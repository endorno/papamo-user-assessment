import { useState } from 'react';

/** クリップボードへコピーし、結果を読み上げ用の文言で返す。失敗時は手で選んでコピーしてもらう。 */
export function useClipboardCopy(text: string, failureMessage: string) {
  const [message, setMessage] = useState('');

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setMessage('コピーしました');
    } catch {
      setMessage(failureMessage);
    }
  }

  return { message, copy };
}
