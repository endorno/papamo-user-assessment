const SHARE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SHARE_CODE_LENGTH = 8;

export function normalizeShareCode(value: string): string {
  return value.replace(/-/g, '').trim().toUpperCase();
}

export function formatShareCode(value: string): string {
  const normalized = normalizeShareCode(value);
  return normalized.length === SHARE_CODE_LENGTH
    ? `${normalized.slice(0, 4)}-${normalized.slice(4)}`
    : value;
}

export function isValidShareCode(value: string): boolean {
  const normalized = normalizeShareCode(value);
  return normalized.length === SHARE_CODE_LENGTH &&
    [...normalized].every((character) => SHARE_CODE_ALPHABET.includes(character));
}

export function generateShareCode(randomBytes: Uint8Array): string {
  if (randomBytes.length < SHARE_CODE_LENGTH) {
    throw new Error('共有コード生成用の乱数が不足しています。');
  }
  return [...randomBytes.slice(0, SHARE_CODE_LENGTH)]
    .map((byte) => SHARE_CODE_ALPHABET[byte % SHARE_CODE_ALPHABET.length])
    .join('');
}
