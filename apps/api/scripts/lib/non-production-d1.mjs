import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Worker 名とステージングD1名は同じ文字列。確認用の合言葉としても使う。
export const STAGING_NAME = 'papamo-user-assessment-staging';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** local / staging 以外は受け付けない。本番D1へ向かう経路をそもそも作らない。 */
export function isNonProductionTarget(target) {
  return target === 'local' || target === 'staging';
}

/** `--confirm <値>` と `--confirm=<値>` の両方を受ける。 */
export function readConfirmation(argv) {
  const inlineValue = argv.find((argument) => argument.startsWith('--confirm='));
  if (inlineValue) {
    return inlineValue.slice('--confirm='.length);
  }
  const index = argv.indexOf('--confirm');
  return index >= 0 ? argv[index + 1] : undefined;
}

/** wrangler.toml から対象D1の名前とIDを読む。実行前に本番でないことを目視できるようにする。 */
export function describeDatabase(target) {
  const config = readFileSync(resolve(apiRoot, 'wrangler.toml'), 'utf8');
  const header = target === 'staging' ? '[[env.staging.d1_databases]]' : '[[d1_databases]]';
  const start = config.indexOf(header);
  if (start < 0) {
    return { name: undefined, id: undefined };
  }
  const rest = config.slice(start + header.length);
  const nextSection = rest.search(/^\[/m);
  const body = nextSection < 0 ? rest : rest.slice(0, nextSection);
  const valueOf = (key) => body.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm'))?.[1];
  return { name: valueOf('database_name'), id: valueOf('database_id') };
}

/** ローカルは `--local`、ステージングは `--env staging --remote`。本番向けの引数は組み立てない。 */
export function executeSqlFile(target, file) {
  return spawnSync('pnpm', [
    'exec',
    'wrangler',
    'd1',
    'execute',
    'DB',
    ...(target === 'local' ? ['--local'] : ['--env', 'staging', '--remote']),
    '--file',
    file,
  ], { stdio: 'inherit' });
}
