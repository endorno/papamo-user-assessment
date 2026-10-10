import type { Honorific } from '../schema/assessment';
import { shortChildId } from './child-id';

const HONORIFIC_LABELS: Record<Honorific, string> = {
  kun: 'くん',
  chan: 'ちゃん',
  san: 'さん',
};

export function honorificLabel(honorific: Honorific) {
  return HONORIFIC_LABELS[honorific] ?? '';
}

/** 保護者向けはコーチ向けの紙面を外した4枚、コーチ向けは末尾のメニュー提案まで含める。 */
export type ReportAudience = 'parent' | 'coach';

/**
 * レポートPDFのファイル名（拡張子なし）。ダウンロードとGoogleドライブで同じ名前にする。
 * 同じお名前のお子さまのPDFを同じフォルダに保存しても上書きしないよう、短縮IDを入れる。
 */
export function reportFileTitle(
  report: { childId: string; childName: string; honorific: Honorific; seqNo: number },
  audience: ReportAudience,
) {
  const title = `育ちマップ_${report.childName}${honorificLabel(report.honorific)}_${shortChildId(report.childId)}_第${report.seqNo}回`;
  return audience === 'coach' ? `${title}_コーチ用` : title;
}
