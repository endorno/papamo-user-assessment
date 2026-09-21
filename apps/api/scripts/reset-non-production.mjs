import { createInterface } from 'node:readline/promises';

import {
  describeDatabase,
  executeSqlFile,
  isNonProductionTarget,
  readConfirmation,
  STAGING_NAME,
} from './lib/non-production-d1.mjs';

const target = process.argv[2];

if (!isNonProductionTarget(target)) {
  console.error('対象は local または staging を指定してください。本番D1のリセットは用意していません。');
  process.exit(1);
}

if (target === 'staging' && readConfirmation(process.argv) !== STAGING_NAME) {
  console.error(`ステージングをリセットするには --confirm ${STAGING_NAME} を指定してください。`);
  process.exit(1);
}

const database = describeDatabase(target);

// wrangler.toml を書き換えて本番D1へ向いていないかを、リモート実行の直前に確かめる。
if (target === 'staging' && database.name !== STAGING_NAME) {
  console.error(`ステージングのD1が ${STAGING_NAME} ではありません（${database.name ?? '不明'}）。wrangler.toml を確認してください。`);
  process.exit(1);
}

const location = target === 'local' ? 'ローカルD1（.wrangler/state）' : 'ステージングD1（リモート）';
console.log(`対象: ${location}`);
console.log(`データベース: ${database.name ?? '不明'}（${database.id ?? '不明'}）`);
console.log('コーチ・子ども・担当紐づき・アセスメント・レポートをすべて削除し、マイグレーション直後の状態に戻します。');
console.log('スキーマとマイグレーション履歴は残るため、実行後の再マイグレーションは不要です。');

if (!process.stdin.isTTY) {
  console.error('確認入力が必要です。対話できる端末で実行してください。');
  process.exit(1);
}

const prompt = createInterface({ input: process.stdin, output: process.stdout });
const answer = (await prompt.question('実行しますか? [y/N]: ')).trim().toLowerCase();
prompt.close();

if (answer !== 'y' && answer !== 'yes') {
  console.log('中止しました。');
  process.exit(0);
}

const result = executeSqlFile(target, 'seeds/reset.sql');

if (result.error) {
  console.error('Wrangler を起動できませんでした。', result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
