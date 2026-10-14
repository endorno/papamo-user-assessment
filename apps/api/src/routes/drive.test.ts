import {
  assessmentCreateResponseSchema,
  assessmentResponseSchema,
  childDetailResponseSchema,
  childImportResponseSchema,
  meResponseSchema,
  reportDriveEventSchema,
  reportResponseSchema,
  shortChildId,
  type ReportDriveEvent,
} from '@papamo/shared';
import { applyD1Migrations, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

import { GoogleDriveError, type DriveConnector } from '../services/google-drive';
import type { ReportPdfRenderer } from '../services/report-pdf';
import { saveReportPdfs } from '../services/report-drive';
import {
  createChild,
  createCompletedAssessment,
  createTestClient,
  onboard,
  request,
  testEnv,
  type TestClient,
} from '../test-utils/api-client';
import { FakeDrive } from '../test-utils/fake-drive';

beforeAll(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});

const PARENT_HTML = '<!doctype html><html><body><section class="sheet">保護者向け</section></body></html>';
const COACH_HTML = '<!doctype html><html><body><section class="sheet">コーチ向け</section></body></html>';

/** HTML の中身をそのまま PDF の中身にして、どちらのPDFがどこに保存されたかを見分ける。 */
const echoPdf: ReportPdfRenderer = async (_env, htmls, onPageStart) => htmls.map((html, index) => {
  onPageStart?.(index);
  return new Uint8Array(new TextEncoder().encode(html));
});

function driveClient(drive: FakeDrive, options: { renderPdf?: ReportPdfRenderer } = {}) {
  const connector: DriveConnector = () => drive.connection();
  return createTestClient({ drive: connector, renderPdf: options.renderPdf ?? echoPdf });
}

async function fetchReport(client: TestClient, assessmentId: string) {
  const response = await request(client, `/assessments/${assessmentId}/report`);
  expect(response.status).toBe(200);
  return reportResponseSchema.parse(await response.json());
}

function saveToDrive(client: TestClient, assessmentId: string, generatedAt: string, executionContext?: ExecutionContext) {
  return request(client, `/assessments/${assessmentId}/report/drive`, {
    method: 'POST',
    body: JSON.stringify({ generatedAt, parentHtml: PARENT_HTML, coachHtml: COACH_HTML }),
  }, executionContext);
}

/** 保存APIが1行ずつ返す途中経過を読む。確認を済ませた後は 200 で返し始める。 */
async function driveEvents(response: Response): Promise<ReportDriveEvent[]> {
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toContain('application/x-ndjson');
  // workerd は text/* 以外の本文を .text() で読むと警告するため、バイト列から読む。
  const text = new TextDecoder().decode(await response.arrayBuffer());
  return text.trim().split('\n').map((line) => reportDriveEventSchema.parse(JSON.parse(line)));
}

/** 保存して、最後の行（done）の保存状態を返す。 */
async function savedDrive(response: Response | Promise<Response>) {
  const last = (await driveEvents(await response)).at(-1);
  if (last?.type !== 'done') throw new Error(`保存に失敗しました: ${JSON.stringify(last)}`);
  return last.drive;
}

/** 完了済みの回の入力を少し変えて、レポートを更新する。 */
async function updateReport(client: TestClient, assessmentId: string) {
  const current = assessmentResponseSchema.parse(await (await request(client, `/assessments/${assessmentId}`)).json()).assessment;
  const patched = await request(client, `/assessments/${assessmentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ data: { ...current.data, memo: '更新' }, updatedAt: current.updatedAt }),
  });
  const saved = assessmentResponseSchema.parse(await patched.json()).assessment;
  const completed = await request(client, `/assessments/${assessmentId}/complete`, {
    method: 'POST',
    body: JSON.stringify({ updatedAt: saved.updatedAt }),
  });
  expect(completed.status).toBe(200);
}

function idFromUrl(url: string | null) {
  return url?.split('/').filter(Boolean).find((_, index, parts) => parts[index - 1] === 'folders' || parts[index - 1] === 'd') ?? null;
}

describe('Googleドライブへのレポート保存', () => {
  it('オーナーのコーチフォルダの下にお子さまのフォルダを作り、保護者向けとコーチ向けを保存する', async () => {
    const drive = new FakeDrive();
    const owner = await driveClient(drive);
    await onboard(owner, 'さとう');
    const child = await createChild(owner, 'れん');
    const assessment = await createCompletedAssessment(owner, child.id);

    const before = await fetchReport(owner, assessment.id);
    expect(before.drive).toEqual({ folderUrl: null, parentFileUrl: null, coachFileUrl: null, savedAt: null, upToDate: false });

    const events = await driveEvents(await saveToDrive(owner, assessment.id, before.report.generatedAt));
    // 段階に入るたびに知らせ、最後に保存状態を返す。
    expect(events.map((event) => (event.type === 'step' ? event.step : event.type))).toEqual(['renderParent', 'renderCoach', 'upload', 'done']);
    const last = events.at(-1);
    if (last?.type !== 'done') throw new Error('保存が終わっていません。');
    const saved = last.drive;
    expect(saved.upToDate).toBe(true);

    const [coachFolder] = drive.live(drive.rootFolderId, 'folder');
    // メールアドレスはドメインまで出さず、@ より前だけを添える。
    expect(coachFolder?.name).toBe(`さとうコーチ（${owner.coachId}）`);
    // コーチには自分のフォルダの閲覧権限だけを付ける。
    expect(drive.shares).toEqual([{ id: coachFolder!.id, email: owner.email }]);
    const [childFolder] = drive.live(coachFolder!.id, 'folder');
    expect(childFolder?.name).toBe(`れんちゃん_${shortChildId(child.id)}`);
    const files = drive.live(childFolder!.id, 'pdf');
    const title = `育ちマップ_れんちゃん_${shortChildId(child.id)}_第1回`;
    expect(files.map((file) => file.name).sort()).toEqual([`${title}.pdf`, `${title}_コーチ用.pdf`]);
    expect(new TextDecoder().decode(drive.items.get(idFromUrl(saved.coachFileUrl)!)!.content)).toBe(COACH_HTML);
    expect(new TextDecoder().decode(drive.items.get(idFromUrl(saved.parentFileUrl)!)!.content)).toBe(PARENT_HTML);
    expect(idFromUrl(saved.folderUrl)).toBe(childFolder!.id);

    expect((await fetchReport(owner, assessment.id)).drive).toEqual(saved);
    const me = meResponseSchema.parse(await (await request(owner, '/me')).json());
    expect(idFromUrl(me.driveFolderUrl)).toBe(coachFolder!.id);
    const detail = childDetailResponseSchema.parse(await (await request(owner, `/children/${child.id}`)).json()).child;
    expect(detail.driveFolderUrl).toBe(saved.folderUrl);
  });

  it('レポートを更新したら保存し直しを促し、同じファイルを上書きしてリンクを変えない', async () => {
    const drive = new FakeDrive();
    const owner = await driveClient(drive);
    await onboard(owner);
    const child = await createChild(owner, 'そら');
    const assessment = await createCompletedAssessment(owner, child.id);
    const first = await fetchReport(owner, assessment.id);
    const saved = await savedDrive(saveToDrive(owner, assessment.id, first.report.generatedAt));

    await updateReport(owner, assessment.id);
    const updated = await fetchReport(owner, assessment.id);
    expect(updated.drive?.upToDate).toBe(false);
    expect(updated.drive?.coachFileUrl).toBe(saved.coachFileUrl);

    // 画面に出していた古い版で、新しいレポートを上書きしない。
    const stale = await saveToDrive(owner, assessment.id, first.report.generatedAt);
    expect(stale.status).toBe(409);

    const resaved = await savedDrive(saveToDrive(owner, assessment.id, updated.report.generatedAt));
    expect(resaved).toMatchObject({ upToDate: true, coachFileUrl: saved.coachFileUrl, parentFileUrl: saved.parentFileUrl });
    expect([...drive.items.values()].filter((item) => item.kind === 'pdf')).toHaveLength(2);
    expect([...drive.items.values()].filter((item) => item.kind === 'folder')).toHaveLength(3);
  });

  it('取り込んだコーチも保存でき、保存先はオーナーのフォルダのまま。オーナー移譲でフォルダごと移る', async () => {
    const drive = new FakeDrive();
    const owner = await driveClient(drive);
    const member = await driveClient(drive);
    const nextOwner = await driveClient(drive);
    await onboard(owner, 'さとう');
    await onboard(member, 'たなか');
    await onboard(nextOwner, 'すずき');
    const child = await createChild(owner, 'みお');
    const assessment = await createCompletedAssessment(owner, child.id);
    const ownerCode = childDetailResponseSchema.parse(await (await request(owner, `/children/${child.id}`)).json()).child.ownerShareCode;

    expect((await request(member, '/children/import', { method: 'POST', body: JSON.stringify({ code: child.shareCode }) })).status).toBe(200);
    const report = await fetchReport(member, assessment.id);
    const saved = await savedDrive(saveToDrive(member, assessment.id, report.report.generatedAt));
    const [ownerFolder] = drive.live(drive.rootFolderId, 'folder');
    expect(ownerFolder?.name).toBe(`さとうコーチ（${owner.coachId}）`);
    expect(drive.shares.map((share) => share.email)).toEqual([owner.email]);
    // 取り込んだだけのコーチにも、フォルダへのリンクは出す（開けるかは Drive 上の共有しだい）。
    const memberDetail = childDetailResponseSchema.parse(await (await request(member, `/children/${child.id}`)).json()).child;
    expect(memberDetail.driveFolderUrl).toBe(saved.folderUrl);

    const imported = await request(nextOwner, '/children/import', { method: 'POST', body: JSON.stringify({ code: ownerCode }) });
    expect(childImportResponseSchema.parse(await imported.json()).ownershipTransferred).toBe(true);
    const nextOwnerFolder = drive.live(drive.rootFolderId, 'folder').find((folder) => folder.name.includes(nextOwner.coachId));
    expect(nextOwnerFolder).toBeDefined();
    expect(drive.shares).toContainEqual({ id: nextOwnerFolder!.id, email: nextOwner.email });
    const childFolderId = idFromUrl(saved.folderUrl)!;
    expect(drive.items.get(childFolderId)?.parents).toEqual([nextOwnerFolder!.id]);
    expect(drive.live(ownerFolder!.id)).toHaveLength(0);
  });

  it('Drive 上でお子さまのフォルダが消されていたら作り直して保存する', async () => {
    const drive = new FakeDrive();
    const owner = await driveClient(drive);
    await onboard(owner);
    const child = await createChild(owner, 'ゆい');
    const assessment = await createCompletedAssessment(owner, child.id);
    const report = await fetchReport(owner, assessment.id);
    const first = await savedDrive(saveToDrive(owner, assessment.id, report.report.generatedAt));
    drive.items.get(idFromUrl(first.folderUrl)!)!.trashed = true;

    const second = await savedDrive(saveToDrive(owner, assessment.id, report.report.generatedAt));
    expect(second.folderUrl).not.toBe(first.folderUrl);
    expect(second.coachFileUrl).not.toBe(first.coachFileUrl);
    expect(drive.live(idFromUrl(second.folderUrl)!, 'pdf')).toHaveLength(2);
  });

  it('同時に保存してもフォルダとファイルを二重に作らない', async () => {
    const drive = new FakeDrive();
    const owner = await driveClient(drive);
    await onboard(owner);
    const child = await createChild(owner, 'はる');
    const assessment = await createCompletedAssessment(owner, child.id);
    const { report } = await fetchReport(owner, assessment.id);
    const pdfs = { parent: new Uint8Array([1]), coach: new Uint8Array([2]) };

    const results = await Promise.all([1, 2, 3].map(() => saveReportPdfs(testEnv, drive.connection(), {
      assessmentId: assessment.id,
      generatedAt: report.generatedAt,
      pdfs,
    })));

    const [coachFolder, ...extraCoachFolders] = drive.live(drive.rootFolderId, 'folder');
    expect(extraCoachFolders).toHaveLength(0);
    const childFolders = drive.live(coachFolder!.id, 'folder');
    expect(childFolders).toHaveLength(1);
    expect(drive.live(childFolders[0]!.id, 'pdf')).toHaveLength(2);
    // 競合に負けた側が作ったものはゴミ箱へ移している（同時に進んだことの確認）。
    expect([...drive.items.values()].filter((item) => item.trashed).length).toBeGreaterThan(0);
    const final = await fetchReport(owner, assessment.id);
    expect(results.map((result) => result.coachFileUrl)).toContain(final.drive?.coachFileUrl);
  });

  it('担当外・レポートなし・未設定・失敗を分けて返す', async () => {
    const drive = new FakeDrive();
    const owner = await driveClient(drive);
    const stranger = await driveClient(drive);
    await onboard(owner);
    await onboard(stranger);
    const child = await createChild(owner, 'こう');
    const assessment = await createCompletedAssessment(owner, child.id);
    const { report } = await fetchReport(owner, assessment.id);

    expect((await saveToDrive(stranger, assessment.id, report.generatedAt)).status).toBe(403);
    expect((await saveToDrive(owner, 'unknown-assessment', report.generatedAt)).status).toBe(404);
    const draftChild = await createChild(owner, 'なぎ');
    const draft = await request(owner, `/children/${draftChild.id}/assessments`, { method: 'POST', body: JSON.stringify({ unlockExt: false }) });
    const draftId = assessmentCreateResponseSchema.parse(await draft.json()).assessment.id;
    expect((await saveToDrive(owner, draftId, report.generatedAt)).status).toBe(404);
    expect((await request(owner, `/assessments/${assessment.id}/report/drive`, {
      method: 'POST',
      body: JSON.stringify({ generatedAt: report.generatedAt, parentHtml: '', coachHtml: COACH_HTML }),
    })).status).toBe(400);

    // 保存を設定していない環境では、状態は null で保存APIは404。
    const disabled = await createTestClient();
    await onboard(disabled);
    const disabledChild = await createChild(disabled, 'りく');
    const disabledAssessment = await createCompletedAssessment(disabled, disabledChild.id);
    const disabledReport = await fetchReport(disabled, disabledAssessment.id);
    expect(disabledReport.drive).toBeNull();
    expect((await saveToDrive(disabled, disabledAssessment.id, disabledReport.report.generatedAt)).status).toBe(404);

    const failingPdf = await driveClient(drive, { renderPdf: async () => { throw new Error('browser unavailable'); } });
    await onboard(failingPdf);
    const failingChild = await createChild(failingPdf, 'まお');
    const failingAssessment = await createCompletedAssessment(failingPdf, failingChild.id);
    const failingReport = await fetchReport(failingPdf, failingAssessment.id);
    // 返し始めた後の失敗はステータスにできないため、最後の行で知らせる。
    const pdfFailed = await driveEvents(await saveToDrive(failingPdf, failingAssessment.id, failingReport.report.generatedAt));
    expect(pdfFailed.at(-1)).toEqual({
      type: 'error',
      error: { code: 'internal', message: 'PDFを作成できませんでした。少し待ってからもう一度お試しください。' },
    });

    drive.failWith = new GoogleDriveError('create_folder', 403, 'insufficientFilePermissions');
    const driveFailed = await driveEvents(await saveToDrive(owner, assessment.id, report.generatedAt));
    expect(driveFailed.at(-1)).toEqual({
      type: 'error',
      error: { code: 'internal', message: 'Googleドライブの保存先に書き込めませんでした。管理者に共有ドライブの設定を確認してもらってください。' },
    });
    expect((await fetchReport(owner, assessment.id)).drive?.upToDate).toBe(false);
  });

  it('PDFを作っている間にレポートが更新されたら、古い紙面で上書きせず最後の行で知らせる', async () => {
    const drive = new FakeDrive();
    const target: { client?: TestClient; assessmentId?: string } = {};
    // PDFを作り終える前に、別の画面でレポートを更新したことにする。
    const updateWhileRendering: ReportPdfRenderer = async (env, htmls, onPageStart) => {
      await updateReport(target.client!, target.assessmentId!);
      return echoPdf(env, htmls, onPageStart);
    };
    const owner = await driveClient(drive, { renderPdf: updateWhileRendering });
    await onboard(owner);
    const child = await createChild(owner, 'いと');
    const assessmentId = (await createCompletedAssessment(owner, child.id)).id;
    Object.assign(target, { client: owner, assessmentId });
    const { report } = await fetchReport(owner, assessmentId);

    const events = await driveEvents(await saveToDrive(owner, assessmentId, report.generatedAt));
    expect(events.at(-1)).toEqual({
      type: 'error',
      error: { code: 'conflict', message: 'レポートが更新されたため、保存を取りやめました。画面を読み込み直してください。' },
    });
    expect(drive.live(drive.rootFolderId, 'folder')).toHaveLength(0);
  });

  it('PDFを作り終える前に、始まった段階を先に返し、画面を閉じて通信が切れても保存は最後まで行う', async () => {
    const drive = new FakeDrive();
    let releaseRender: () => void = () => undefined;
    const rendering = new Promise<void>((resolve) => {
      releaseRender = resolve;
    });
    const owner = await driveClient(drive, {
      renderPdf: async (env, htmls, onPageStart) => {
        await rendering;
        return echoPdf(env, htmls, onPageStart);
      },
    });
    await onboard(owner);
    const child = await createChild(owner, 'つむぎ');
    const assessment = await createCompletedAssessment(owner, child.id);
    const { report } = await fetchReport(owner, assessment.id);

    const executionContext = createExecutionContext();
    const response = await saveToDrive(owner, assessment.id, report.generatedAt, executionContext);
    expect(response.status).toBe(200);
    // PDFを作っている途中でも、最初の段階はもう届いている（まとめて返していない）。
    const reader = response.body!.getReader();
    const { value } = await reader.read();
    expect(JSON.parse(new TextDecoder().decode(value).trim())).toEqual({ type: 'step', step: 'renderParent' });
    await reader.cancel();
    releaseRender();
    await waitOnExecutionContext(executionContext);

    expect((await fetchReport(owner, assessment.id)).drive?.upToDate).toBe(true);
  });
});
