import { CORE_EXERCISE_KEYS, EXT_EXERCISE_KEYS, type ExerciseKey } from '../master/exercises';
import { PPI_QUESTIONS } from '../master/ppi';
import { daysBetween, nextDueDate, todayInJst } from './date';

export interface AssessmentProgress {
  status: 'draft' | 'done';
  assessedOn: string;
  unlockExt: boolean;
  lv: Partial<Record<ExerciseKey, number>>;
  troubles: string[];
  ppi: Partial<Record<(typeof PPI_QUESTIONS)[number]['key'], number>>;
}

export interface ChildStatusInput {
  archivedAt: string | null;
  assessments: AssessmentProgress[];
}

export type ChildListState =
  | { key: 'draft'; label: string; filled: number; total: number; order: 0 }
  | { key: 'first'; label: string; order: 1 }
  | { key: 'due'; label: string; daysLeft: number; order: 0.5 }
  | { key: 'ok'; label: string; dueDate: string; order: 2 };

function activeKeys(unlockExt: boolean): ExerciseKey[] {
  return unlockExt ? [...CORE_EXERCISE_KEYS, ...EXT_EXERCISE_KEYS] : [...CORE_EXERCISE_KEYS];
}

export function assessmentProgress(input: AssessmentProgress): { filled: number; total: number } {
  const keys = activeKeys(input.unlockExt);
  const levels = keys.filter((key) => input.lv[key] !== undefined).length;
  const trouble = input.troubles.length > 0 ? 1 : 0;
  const ppi = PPI_QUESTIONS.every(({ key }) => input.ppi[key] !== undefined) ? 1 : 0;
  return { filled: levels + trouble + ppi, total: keys.length + 2 };
}

export function stateOf(
  child: ChildStatusInput,
  today = todayInJst(),
): ChildListState | null {
  if (child.archivedAt) {
    return null;
  }

  const draft = child.assessments.find((assessment) => assessment.status === 'draft');
  if (draft) {
    const progress = assessmentProgress(draft);
    return {
      key: 'draft',
      label: `アセスメント入力中（${progress.filled}/${progress.total}）`,
      ...progress,
      order: 0,
    };
  }

  const completed = child.assessments
    .filter((assessment) => assessment.status === 'done')
    .sort((a, b) => a.assessedOn.localeCompare(b.assessedOn))
    .at(-1);
  if (!completed) {
    return { key: 'first', label: '初回アセスメント未実施', order: 1 };
  }

  const dueDate = nextDueDate(completed.assessedOn);
  const daysLeft = daysBetween(today, dueDate);
  if (daysLeft <= 14) {
    return {
      key: 'due',
      label: daysLeft < 0 ? `予定日を${-daysLeft}日過ぎています` : `次回まであと${daysLeft}日`,
      daysLeft,
      order: 0.5,
    };
  }

  return { key: 'ok', label: `次回 ${dueDate} 予定`, dueDate, order: 2 };
}
