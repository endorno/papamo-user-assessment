import {
  executeSqlFile,
  isNonProductionTarget,
  readConfirmation,
  STAGING_NAME,
} from './lib/non-production-d1.mjs';

const target = process.argv[2];

if (!isNonProductionTarget(target)) {
  console.error('対象は local または staging を指定してください。');
  process.exit(1);
}

if (target === 'staging' && readConfirmation(process.argv) !== STAGING_NAME) {
  console.error(`ステージングを初期化するには --confirm ${STAGING_NAME} を指定してください。`);
  process.exit(1);
}

const result = executeSqlFile(target, 'seeds/non-production.sql');

if (result.error) {
  console.error('Wrangler を起動できませんでした。', result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
