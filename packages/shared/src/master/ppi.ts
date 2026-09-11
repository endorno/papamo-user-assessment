export const PPI_QUESTIONS = [
  { key: 'time', name: '時間の負担', question: 'お子さんへの対応で、日常生活にどのくらい時間的な負担を感じますか' },
  { key: 'emo', name: '感情の負担', question: 'お子さんへの対応で、イライラ・怒り・疲れをどのくらい感じますか' },
  { key: 'soc', name: '周囲との負担', question: '学校・園や周囲との関係で、どのくらい負担を感じますか' },
  { key: 'fut', name: '将来への不安', question: 'お子さんの今後について、どのくらい不安を感じますか' },
  { key: 'nav', name: '情報・判断の迷い', question: '何をしてあげるべきか、どのくらい迷いを感じますか' },
] as const;

export type PpiKey = (typeof PPI_QUESTIONS)[number]['key'];
export type PpiAnswers = Partial<Record<PpiKey, number>>;
