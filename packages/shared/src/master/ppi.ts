/**
 * ご家庭のお困り度（Parent Pain Index）。0〜5・高いほど負担が大きい。
 * 子どものレーダーは「外へ広がるほど良い」、こちらは「棒が短くなるほど良い」。
 */
export const PPI_QUESTIONS = [
  { key: 'time', name: '時間の負担', question: 'お子さんへの対応で、日常生活にどのくらい時間的な負担を感じますか', lowLabel: 'ほぼ感じない', highLabel: 'とても大きい' },
  { key: 'emo', name: '感情の負担', question: 'お子さんへの対応で、イライラ・怒り・疲れをどのくらい感じますか', lowLabel: 'ほぼ感じない', highLabel: 'とても大きい' },
  { key: 'soc', name: '周囲との負担', question: '学校・園や周囲との関係で、お子さんのことでどのくらい負担を感じますか', lowLabel: 'ほぼ感じない', highLabel: 'とても大きい' },
  { key: 'fut', name: '将来への不安', question: 'お子さんの今後について、どのくらい不安を感じますか', lowLabel: 'ほぼ感じない', highLabel: 'とても大きい' },
  { key: 'nav', name: '情報・判断の迷い', question: 'お子さんに何をしてあげるべきか、どのくらい迷いを感じますか', lowLabel: 'ほぼ迷わない', highLabel: 'とても迷う' },
] as const;

export type PpiKey = (typeof PPI_QUESTIONS)[number]['key'];

export const PPI_SCORE_MAX = 5;
