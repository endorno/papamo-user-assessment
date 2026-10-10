import { and, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import {
  formatCoachName,
  honorificLabel,
  reportFileTitle,
  shortChildId,
  type Honorific,
  type ReportAudience,
  type ReportDrive,
} from '@papamo/shared';

import { dbFor } from '../db/client';
import { assessments, childCoaches, children, coaches, reports } from '../db/schema';
import { describeError } from '../http/errors';
import type { Env } from '../env';
import { AssessmentServiceError } from './assessments';
import { requireMembership } from './children';
import { driveFileUrl, driveFolderUrl, GoogleDriveError, type DriveConnection } from './google-drive';

/*
 * レポートPDFを Googleドライブ（共有ドライブ）に保存する。
 *   保存先のフォルダ / {コーチ名}（メール） / {子ども名}_{短縮ID} / 育ちマップ_…_第N回.pdf（保護者向け・コーチ用）
 * お子さまのフォルダはオーナーのコーチフォルダの下に置き、オーナーが移ったら移動する。
 * コーチには自分のフォルダの閲覧権限だけをアプリが付ける。SV・代行のコーチへの共有は Drive 上で手動で行う。
 */

type ChildRow = typeof children.$inferSelect;
type CoachRow = typeof coaches.$inferSelect;

/**
 * 表示名が同じコーチがいても見分けられるよう、メールアドレスの @ より前を添える。
 * フォルダ名は共有された人に見えるため、ドメインまでは出さない（lesson-admin と同じ扱い。ドメイン違いで重なることは許容する）。
 * 表示名を登録する前に作ることはない（オンボーディングを済ませないとレポートを作れない）が、念のため「コーチ」だけでも作れるようにする。
 */
export function coachFolderName(coach: Pick<CoachRow, 'displayName' | 'email'>) {
  const [localPart = coach.email] = coach.email.split('@');
  return `${formatCoachName(coach.displayName ?? '')}（${localPart}）`;
}

export function childFolderName(child: Pick<ChildRow, 'id' | 'name' | 'honorific'>) {
  return `${child.name}${honorificLabel(child.honorific as Honorific)}_${shortChildId(child.id)}`;
}

function sameValue(column: SQLiteColumn, value: string | null): SQL {
  return value === null ? isNull(column) : eq(column, value);
}

function changed(result: { meta: { changes?: number } }) {
  return (result.meta.changes ?? 0) > 0;
}

/**
 * 作ったフォルダ・ファイルの ID を記録する。記録は「まだ前の値のままなら」に限り、同時に保存した別のリクエストが
 * 先に記録していたら、こちらで作った方はゴミ箱へ移して先の方を使う（フォルダやファイルが二重にできないようにする）。
 */
async function adopt(
  drive: DriveConnection,
  createdId: string,
  record: () => Promise<boolean>,
  current: () => Promise<string | null>,
): Promise<string> {
  if (await record()) return createdId;
  await drive.client.trash(createdId);
  const winner = await current();
  if (!winner) throw new Error('Googleドライブの保存先を記録できませんでした。');
  return winner;
}

/** 失敗しても本体の処理は続けるもの（共有・移動）を、個人情報を含めずに記録する。 */
function logDriveFailure(operation: string, ids: Record<string, string>, caught: unknown) {
  console.error(JSON.stringify({ event: 'google_drive_failed', operation, ...ids, error: describeError(caught) }));
}

async function ensureCoachFolder(env: Env, drive: DriveConnection, coach: CoachRow): Promise<string> {
  const db = dbFor(env);
  const name = coachFolderName(coach);
  const current = coach.driveFolderId ? await drive.client.get(coach.driveFolderId) : null;
  let folderId: string;
  if (current && !current.trashed) {
    folderId = current.id;
    if (current.name !== name) await drive.client.update(folderId, { name });
  } else {
    // 管理者が Drive 上でゴミ箱へ移した場合も、作り直して保存を続ける。
    const created = await drive.client.createFolder(name, drive.rootFolderId);
    folderId = await adopt(
      drive,
      created,
      async () => changed(await db.update(coaches)
        .set({ driveFolderId: created, driveSharedEmail: null })
        .where(and(eq(coaches.id, coach.id), sameValue(coaches.driveFolderId, coach.driveFolderId)))
        .run()),
      async () => (await db.select({ id: coaches.driveFolderId }).from(coaches).where(eq(coaches.id, coach.id)).get())?.id ?? null,
    );
  }

  // 付け直しが要るのは、フォルダを作ったときとログインのメールアドレスが変わったとき。
  if (folderId !== coach.driveFolderId || coach.driveSharedEmail !== coach.email) {
    try {
      await drive.client.shareAsReader(folderId, coach.email);
      await db.update(coaches)
        .set({ driveSharedEmail: coach.email })
        .where(and(eq(coaches.id, coach.id), eq(coaches.driveFolderId, folderId)))
        .run();
    } catch (caught) {
      // 共有できなくてもPDFの保存は続ける（管理者は Drive 上で開ける）。記録しないので次の保存で付け直す。
      if (!(caught instanceof GoogleDriveError)) throw caught;
      logDriveFailure('share_coach_folder', { coachId: coach.id }, caught);
    }
  }
  return folderId;
}

async function ownerOf(env: Env, childId: string): Promise<CoachRow> {
  const owner = await dbFor(env)
    .select({ coach: coaches })
    .from(childCoaches)
    .innerJoin(coaches, eq(coaches.id, childCoaches.coachId))
    .where(and(eq(childCoaches.childId, childId), eq(childCoaches.role, 'owner')))
    .get();
  if (!owner) throw new Error(`オーナーのコーチが見つかりません: ${childId}`);
  return owner.coach;
}

/** お子さまのフォルダを、いまのオーナーのコーチフォルダの下にそろえる（無ければ作る）。 */
async function ensureChildFolder(env: Env, drive: DriveConnection, child: ChildRow): Promise<string> {
  const db = dbFor(env);
  const ownerFolderId = await ensureCoachFolder(env, drive, await ownerOf(env, child.id));
  const name = childFolderName(child);
  const current = child.driveFolderId ? await drive.client.get(child.driveFolderId) : null;
  if (current && !current.trashed) {
    const moved = !current.parents.includes(ownerFolderId);
    if (current.name !== name || moved) {
      await drive.client.update(current.id, {
        ...(current.name === name ? {} : { name }),
        ...(moved ? { moveTo: ownerFolderId, moveFrom: current.parents } : {}),
      });
    }
    return current.id;
  }

  const created = await drive.client.createFolder(name, ownerFolderId);
  const folderId = await adopt(
    drive,
    created,
    async () => changed(await db.update(children)
      .set({ driveFolderId: created })
      .where(and(eq(children.id, child.id), sameValue(children.driveFolderId, child.driveFolderId)))
      .run()),
    async () => (await db.select({ id: children.driveFolderId }).from(children).where(eq(children.id, child.id)).get())?.id ?? null,
  );
  if (folderId === created && child.driveFolderId) {
    // 前のフォルダが消されていた。そこにあったPDFを指したままにせず、ほかの回も次に開いたときに保存し直す。
    await db.update(reports)
      .set({ driveParentFileId: null, driveCoachFileId: null, driveSavedAt: null, driveReportUpdatedAt: null })
      .where(inArray(
        reports.assessmentId,
        db.select({ id: assessments.id }).from(assessments).where(eq(assessments.childId, child.id)),
      ))
      .run();
  }
  return folderId;
}

/**
 * オーナー移譲のあと、お子さまのフォルダを新しいオーナーのフォルダへ移す。まだフォルダが無ければ何もしない。
 * 取り込みは成功させたいので、失敗は記録だけして次にPDFを保存するときにそろえ直す。
 */
export async function moveChildFolderToOwner(env: Env, drive: DriveConnection, childId: string) {
  const child = await dbFor(env).select().from(children).where(eq(children.id, childId)).get();
  if (!child?.driveFolderId) return;
  try {
    await ensureChildFolder(env, drive, child);
  } catch (caught) {
    logDriveFailure('move_child_folder', { childId }, caught);
  }
}

type ReportDriveRow = Pick<
  typeof reports.$inferSelect,
  'updatedAt' | 'driveParentFileId' | 'driveCoachFileId' | 'driveSavedAt' | 'driveReportUpdatedAt'
>;

export function reportDriveStatus(report: ReportDriveRow, childFolderId: string | null): ReportDrive {
  return {
    folderUrl: childFolderId ? driveFolderUrl(childFolderId) : null,
    parentFileUrl: report.driveParentFileId ? driveFileUrl(report.driveParentFileId) : null,
    coachFileUrl: report.driveCoachFileId ? driveFileUrl(report.driveCoachFileId) : null,
    savedAt: report.driveSavedAt,
    upToDate: report.driveReportUpdatedAt === report.updatedAt,
  };
}

async function reportRow(env: Env, assessmentId: string) {
  return dbFor(env)
    .select({ report: reports, assessment: assessments, child: children })
    .from(reports)
    .innerJoin(assessments, eq(assessments.id, reports.assessmentId))
    .innerJoin(children, eq(children.id, assessments.childId))
    .where(eq(reports.assessmentId, assessmentId))
    .get();
}

/** レポート応答に載せる Drive の状態。レポートが無ければ null。 */
export async function reportDriveStatusOf(env: Env, assessmentId: string): Promise<ReportDrive | null> {
  const row = await reportRow(env, assessmentId);
  return row ? reportDriveStatus(row.report, row.child.driveFolderId) : null;
}

const REPORT_UPDATED_MESSAGE = 'レポートが更新されたため、保存を取りやめました。画面を読み込み直してください。';

/**
 * 保存してよいレポートかを確かめる。担当していない子どものレポートは保存させない（存在と membership はレポート取得と同じ扱い）。
 * 画面に表示した版（generatedAt）が古ければ、新しい版を古い紙面で上書きしないよう 409 にする。
 */
export async function assertReportSavable(env: Env, assessmentId: string, coachId: string, generatedAt: string) {
  const assessment = await dbFor(env).select({ childId: assessments.childId }).from(assessments).where(eq(assessments.id, assessmentId)).get();
  if (!assessment) throw new AssessmentServiceError('not_found', 'アセスメントが見つかりません。');
  if (!(await requireMembership(env, assessment.childId, coachId))) {
    throw new AssessmentServiceError('forbidden', 'このレポートを閲覧する権限がありません。');
  }
  const row = await reportRow(env, assessmentId);
  if (!row) throw new AssessmentServiceError('not_found', 'レポートが見つかりません。');
  if (row.report.updatedAt !== generatedAt) throw new AssessmentServiceError('conflict', REPORT_UPDATED_MESSAGE);
}

const FILE_COLUMNS = {
  parent: reports.driveParentFileId,
  coach: reports.driveCoachFileId,
} as const;

function fileIdUpdate(audience: ReportAudience, fileId: string) {
  return audience === 'parent' ? { driveParentFileId: fileId } : { driveCoachFileId: fileId };
}

async function savedFileIds(env: Env, reportId: string): Promise<Record<ReportAudience, string | null>> {
  const current = await dbFor(env)
    .select({ parent: reports.driveParentFileId, coach: reports.driveCoachFileId })
    .from(reports)
    .where(eq(reports.id, reportId))
    .get();
  return { parent: current?.parent ?? null, coach: current?.coach ?? null };
}

/**
 * 保護者向けとコーチ向けのPDFを、お子さまのフォルダに保存する。2回目以降は同じファイルを上書きしてリンクを変えない
 * （Drive の版の履歴に前の版が残る）。保存した版（generatedAt）を記録し、レポートが更新されたら保存し直せるようにする。
 */
export async function saveReportPdfs(
  env: Env,
  drive: DriveConnection,
  input: { assessmentId: string; generatedAt: string; pdfs: Record<ReportAudience, Uint8Array<ArrayBuffer>> },
): Promise<ReportDrive> {
  const db = dbFor(env);
  const row = await reportRow(env, input.assessmentId);
  if (!row) throw new AssessmentServiceError('not_found', 'レポートが見つかりません。');
  // PDFを作っている間に別のコーチがレポートを更新していたら、古い紙面で上書きしない。
  if (row.report.updatedAt !== input.generatedAt) throw new AssessmentServiceError('conflict', REPORT_UPDATED_MESSAGE);

  const folderId = await ensureChildFolder(env, drive, row.child);
  // フォルダを作り直したときは記録が消されているため、そろえた後の記録を読む。
  const fileIds = await savedFileIds(env, row.report.id);
  for (const audience of ['parent', 'coach'] as const) {
    const name = `${reportFileTitle({
      childId: row.child.id,
      childName: row.child.name,
      honorific: row.child.honorific as Honorific,
      seqNo: row.assessment.seqNo,
    }, audience)}.pdf`;
    const pdf = input.pdfs[audience];
    const existingId = fileIds[audience];
    if (existingId && await drive.client.replacePdf(existingId, name, pdf)) continue;

    const created = await drive.client.createPdf(name, folderId, pdf);
    fileIds[audience] = await adopt(
      drive,
      created,
      async () => changed(await db.update(reports)
        .set(fileIdUpdate(audience, created))
        .where(and(eq(reports.id, row.report.id), sameValue(FILE_COLUMNS[audience], existingId)))
        .run()),
      async () => (await savedFileIds(env, row.report.id))[audience],
    );
  }

  const savedAt = new Date().toISOString();
  await db.update(reports)
    .set({ driveSavedAt: savedAt, driveReportUpdatedAt: input.generatedAt })
    .where(eq(reports.id, row.report.id))
    .run();
  return reportDriveStatus({
    updatedAt: row.report.updatedAt,
    driveParentFileId: fileIds.parent,
    driveCoachFileId: fileIds.coach,
    driveSavedAt: savedAt,
    driveReportUpdatedAt: input.generatedAt,
  }, folderId);
}
