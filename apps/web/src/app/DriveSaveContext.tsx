import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { reportDriveEventSchema, type ReportDrive, type ReportDriveStep } from '@papamo/shared';
import { ApiClientError, apiRequestLines } from '../api/client';
import { DriveSavePanel } from '../components/DriveSavePanel';

/*
 * レポートPDFの Googleドライブへの保存を、レポート画面ではなくレイアウトで持つ。
 * 保存は十数秒かかるため、ほかの画面へ移っても続け、進み具合と結果を画面の隅のパネルで見せる。
 */

export interface DriveSaveRequest {
  assessmentId: string;
  childId: string;
  /** パネルに出す名前（例「はるとくん 第2回」）。 */
  label: string;
  /** 画面に表示したレポートの版。 */
  generatedAt: string;
  /** 紙面のHTML。組み立てが重いので、実際に保存を始めるときだけ呼ぶ。 */
  buildHtml: () => { parentHtml: string; coachHtml: string };
}

export interface DriveSaveTask {
  /** 保存を始めるたびに振る番号。前の保存の結果で、新しく始めた保存の状態を書き換えないため。 */
  key: number;
  assessmentId: string;
  childId: string;
  label: string;
  generatedAt: string;
  status: 'saving' | 'saved' | 'failed';
  step: ReportDriveStep;
  stepStartedAt: number;
  finishedAt: number | null;
  drive: ReportDrive | null;
  error: { message: string; conflict: boolean } | null;
  /** パネルに出すか。閉じても保存は続く。 */
  inPanel: boolean;
}

interface DriveSaveContextValue {
  /** レポート（assessment id）ごとの、この画面を開いてから始めた保存。 */
  tasks: Readonly<Record<string, DriveSaveTask>>;
  /** 同じ版を保存中・保存済みなら何もしない。失敗した保存は始め直す。 */
  startSave: (request: DriveSaveRequest, session: Session) => void;
  hideFromPanel: (assessmentId: string) => void;
}

// 保存できた知らせは「フォルダを開く」を押す時間がいるので、操作つきの通知と同じだけ出してから畳む。
const SAVED_NOTICE_MS = 8000;

const INTERRUPTED_MESSAGE = '通信が途中で切れました。通信状況を確認してもう一度お試しください。';
const NETWORK_MESSAGE = '通信状況を確認してもう一度お試しください。';

const DriveSaveContext = createContext<DriveSaveContextValue | undefined>(undefined);

export function DriveSaveProvider({ children }: { children: ReactNode }) {
  // 同じ版を二重に送らないよう、描画を待たずに判定できる控えも持つ（StrictMode で効果が2回走っても1回にする）。
  const tasksRef = useRef<Record<string, DriveSaveTask>>({});
  const [tasks, setTasks] = useState<Record<string, DriveSaveTask>>({});
  const nextKey = useRef(0);

  const putTask = useCallback((task: DriveSaveTask) => {
    tasksRef.current = { ...tasksRef.current, [task.assessmentId]: task };
    setTasks(tasksRef.current);
  }, []);

  const updateTask = useCallback((assessmentId: string, key: number, patch: Partial<DriveSaveTask>) => {
    const current = tasksRef.current[assessmentId];
    if (current?.key !== key) return;
    putTask({ ...current, ...patch });
  }, [putTask]);

  const startSave = useCallback((request: DriveSaveRequest, session: Session) => {
    const current = tasksRef.current[request.assessmentId];
    if (current && current.generatedAt === request.generatedAt && current.status !== 'failed') return;
    nextKey.current += 1;
    const key = nextKey.current;
    const { assessmentId } = request;
    putTask({
      key,
      assessmentId,
      childId: request.childId,
      label: request.label,
      generatedAt: request.generatedAt,
      status: 'saving',
      step: 'renderParent',
      stepStartedAt: Date.now(),
      finishedAt: null,
      drive: null,
      error: null,
      inPanel: true,
    });
    // 保存中にパネルを閉じていても、失敗は知らせ直す（閉じたのは進み具合を見なくてよいという意味なので）。
    const fail = (message: string, conflict: boolean) => {
      updateTask(assessmentId, key, { status: 'failed', finishedAt: Date.now(), error: { message, conflict }, inPanel: true });
    };

    void (async () => {
      let finished = false;
      try {
        const html = request.buildHtml();
        await apiRequestLines(`/assessments/${assessmentId}/report/drive`, session, {
          method: 'POST',
          body: JSON.stringify({ generatedAt: request.generatedAt, ...html }),
        }, (line) => {
          const parsed = reportDriveEventSchema.safeParse(line);
          if (!parsed.success) return;
          const event = parsed.data;
          if (event.type === 'step') {
            updateTask(assessmentId, key, { step: event.step, stepStartedAt: Date.now() });
            return;
          }
          finished = true;
          if (event.type === 'done') {
            updateTask(assessmentId, key, { status: 'saved', finishedAt: Date.now(), drive: event.drive });
          } else {
            fail(event.error.message, event.error.code === 'conflict');
          }
        });
        // 最後の行（done / error）が届かずに終わったら、途中で通信が切れている。
        if (!finished) fail(INTERRUPTED_MESSAGE, false);
      } catch (caught) {
        if (finished) return;
        fail(
          caught instanceof ApiClientError ? caught.message : NETWORK_MESSAGE,
          caught instanceof ApiClientError && caught.code === 'conflict',
        );
      }
    })();
  }, [putTask, updateTask]);

  const hideFromPanel = useCallback((assessmentId: string) => {
    const current = tasksRef.current[assessmentId];
    if (current) putTask({ ...current, inPanel: false });
  }, [putTask]);

  // 保存できた知らせは少し出したら畳む。失敗はコーチが閉じるか保存し直すまで残す。
  useEffect(() => {
    const timers = Object.values(tasks)
      .filter((task) => task.status === 'saved' && task.inPanel && task.finishedAt !== null)
      .map((task) => window.setTimeout(
        () => hideFromPanel(task.assessmentId),
        Math.max(0, task.finishedAt! + SAVED_NOTICE_MS - Date.now()),
      ));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [tasks, hideFromPanel]);

  // 画面を閉じる・再読み込みすると結果を見届けられないので確かめる（保存自体はサーバーで最後まで続く）。
  const saving = Object.values(tasks).some((task) => task.status === 'saving');
  useEffect(() => {
    if (!saving) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [saving]);

  const value = useMemo<DriveSaveContextValue>(
    () => ({ tasks, startSave, hideFromPanel }),
    [tasks, startSave, hideFromPanel],
  );

  return (
    <DriveSaveContext.Provider value={value}>
      {children}
      <DriveSavePanel tasks={tasks} onHide={hideFromPanel} />
    </DriveSaveContext.Provider>
  );
}

export function useDriveSave(): DriveSaveContextValue {
  const value = useContext(DriveSaveContext);
  if (!value) throw new Error('DriveSaveProvider の内側で使ってください。');
  return value;
}
