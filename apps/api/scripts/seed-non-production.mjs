import { spawnSync } from 'node:child_process';

const target = process.argv[2];
const confirmationIndex = process.argv.indexOf('--confirm');
const confirmation = process.argv.find((argument) => argument.startsWith('--confirm='))?.slice('--confirm='.length)
  ?? (confirmationIndex >= 0 ? process.argv[confirmationIndex + 1] : undefined);
const stagingName = 'papamo-user-assessment-staging';

if (target !== 'local' && target !== 'staging') {
  console.error('対象は local または staging を指定してください。');
  process.exit(1);
}

if (target === 'staging' && confirmation !== stagingName) {
  console.error(`ステージングを初期化するには --confirm ${stagingName} を指定してください。`);
  process.exit(1);
}

const wranglerArguments = [
  'exec',
  'wrangler',
  'd1',
  'execute',
  'DB',
  ...(target === 'local' ? ['--local'] : ['--env', 'staging', '--remote']),
  '--file',
  'seeds/non-production.sql',
];
const result = spawnSync('pnpm', wranglerArguments, { stdio: 'inherit' });

if (result.error) {
  console.error('Wrangler を起動できませんでした。', result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
