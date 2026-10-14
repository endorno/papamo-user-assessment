import type { AppContext } from '../env';
import { logInternalError } from './errors';

/**
 * 途中経過を1行1つの JSON（NDJSON）で返す。run が終わるまで応答を開いておく。
 * 画面を閉じるなどで通信が切れても run は最後まで行う（waitUntil。切断から30秒まで延びる）。
 * 途中で打ち切られると、Drive に送ったファイルを記録できずに残すなど、後始末の要る状態になりうるため。
 */
export function streamJsonLines<T>(
  context: AppContext,
  operation: string,
  run: (send: (event: T) => void) => Promise<void>,
) {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  let connected = true;
  const send = (event: T) => {
    if (!connected) return;
    // 読み手を待たずに積む。読み手がいなくなったら（通信が切れたら）以降は送らない。
    writer.write(encoder.encode(`${JSON.stringify(event)}\n`)).catch(() => {
      connected = false;
    });
  };
  const finished = run(send)
    .catch((caught: unknown) => logInternalError(context, caught, operation))
    .finally(() => writer.close().catch(() => undefined));
  try {
    context.executionCtx.waitUntil(finished);
  } catch {
    // テストなど ExecutionContext の無い呼び出し。応答を読み切るまで run が続くので延長は要らない。
  }
  return context.body(readable, 200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    // 途中経過がまとめて届かないよう、Cloudflare に圧縮などの変換をさせない。
    'Cache-Control': 'no-store, no-transform',
  });
}
