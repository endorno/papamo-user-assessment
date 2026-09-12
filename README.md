# へやすぽ コーチ向けアセスメント・レポートツール

オンライン運動療育サービス「へやすぽ」で、コーチが子どものアセスメントを記録し、保護者向けレポートを作成するためのツールです。

## セットアップ

Node.js 22 以上と pnpm 10 を用意し、リポジトリのルートで実行します。

```bash
pnpm install
pnpm -r build
pnpm -r test
pnpm -r lint && pnpm -r typecheck
```

ローカル開発では API と Web を別ターミナルで起動します。

```bash
pnpm run dev
```

API（Wrangler）は `http://localhost:8787`、Web（Vite）は表示された Vite のURL（通常 `http://localhost:5173`）で起動します。終了するときは、起動中のターミナルで `Ctrl+C` を押してください。個別に起動する場合は `pnpm --filter @papamo/api dev` または `pnpm --filter @papamo/web dev` を使います。

環境変数の例は `apps/api/.dev.vars.example` と `apps/web/.env.local.example` を参照してください。秘密情報はコミットしません。

## 使用方法

Google でログイン後、初回だけコーチ表示名を登録します。子どもを登録すると、学年・目標・共有コードを管理でき、子どもページからアセスメント、育ちマップ、保護者向けレポートを利用できます。レポートはブラウザの印刷機能で PDF 保存できます。

別のコーチから受け取った共有コードは一覧の「共有コードで取り込む」から入力します。退会した子どもはアーカイブ一覧から復元できます。

## 開発者向け情報

- `packages/shared`: API と Web で共有するスキーマ・型
- `apps/api`: Hono on Cloudflare Workers
- `apps/web`: Vite + React + TypeScript
- `reference/`: PdM 承認済みモックと既存サイトの参照資料。ビルド・テスト対象外

### ローカル開発

API は `apps/api/.dev.vars.example` を `.dev.vars` にコピーし、Web は `apps/web/.env.local.example` を `.env.local` にコピーしてから起動します。Supabase のローカル環境は lesson-admin と共有します。

```bash
pnpm --filter @papamo/api dev
pnpm --filter @papamo/web dev
pnpm --filter @papamo/api db:migrate:local
pnpm --filter @papamo/api types:worker
```

`wrangler.toml` のBindingを変更した場合は `types:worker` を実行し、生成された `worker-configuration.d.ts` も更新します。

### 実装状況

M0〜M6 の初期 PoC 範囲（認証、子ども管理、共有・アーカイブ、アセスメント自動保存、ルールベースレポート、子どもハブ、印刷 CSS）を実装しています。仕様変更やマスタ文言の変更は `AGENTS.md` の承認ルールに従います。

### 品質確認

- `packages/shared`: 日付・学年・状態判定、承認モックのフィクスチャ、ルールベースレポートのスナップショット
- `apps/api`: D1 を使ったサービス／Hono ルート結合テスト、テスト鍵による JWT 検証
- `apps/web`: 一覧、入力画面、共通部品、3枚構成レポートの Testing Library テスト

E2E テストは初期リリースの対象外です。画面変更時は PC 幅とスマートフォン幅、印刷プレビューの3枚構成を手動でも確認してください。

D1では外部キー、値域、単一owner・単一下書きをDB制約でも保証します。アセスメントはrevisionベースで競合を検知し、完了済みの自動保存ではレポートも同じD1 batch内で更新します。
