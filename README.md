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

Google でログイン後、初回だけコーチ表示名を登録します。子どもは名前・敬称・性別・学年・入会日で登録し、目標は初回アセスメントで設定します。初回の目標は入会アンケートの回答セルをGoogleスプレッドシートから貼り付けて取り込めます。子どもページから共有コード、アセスメント、育ちマップ、保護者向けレポートを利用でき、レポートはブラウザの印刷機能で PDF 保存できます。

別のコーチから受け取った共有コードは一覧の「共有コードで取り込む」から入力します。退会した子どもはアーカイブ一覧から復元できます。

## 開発者向け情報

- `packages/shared`: API と Web で共有するスキーマ・型
- `apps/api`: Hono on Cloudflare Workers
- `apps/web`: Vite + React + TypeScript
- `reference/`: PdM 承認済みモックと既存サイトの参照資料。ビルド・テスト対象外

### ローカル開発

API は `apps/api/.dev.vars.example` を `.dev.vars` にコピーし、Web は `apps/web/.env.local.example` を `.env.local` にコピーしてから起動します。Supabase のローカル環境は lesson-admin と共有します。

Supabase の URL やポートを変更したときは、API と Web の両方を停止してから再起動してください。ローカルでは Web の `VITE_SUPABASE_URL`、API の `SUPABASE_URL`、`SUPABASE_JWT_ISSUER` が同じ Supabase（現在は `http://127.0.0.1:15421`）を指している必要があります。ログイン後に 401 が表示された場合は、API の設定を確認して再起動してください。

```bash
pnpm --filter @papamo/api dev
pnpm --filter @papamo/web dev
pnpm db:migrate:local
pnpm --filter @papamo/api types:worker
```

`wrangler.toml` のBindingを変更した場合は `types:worker` を実行し、生成された `worker-configuration.d.ts` も更新します。

### 大量データでの動作確認

開発環境では、ログイン中のコーチに対して一覧画面下部の「開発用：サンプルデータ」から1名・10名・30名を追加できます。10名ごとの内訳は次のとおりです。

- 7名: 完了アセスメント12回（約3年分）と各回のレポート
- 2名: 完了アセスメント1〜4回と各回のレポート
- 1名: アセスメント未作成、または入力途中の下書き1回

一部の子どもには4・5種目目の開放や背景コーチとの担当紐づきも入ります。30名追加を2回実行すると、60名・500件以上のアセスメント／レポートを持つ一覧を確認できます。

追加しすぎたときは、同じパネルの「担当の子どもをすべて削除」で担当一覧を空にできます。自分がオーナーのお子さまはアーカイブ中も含めて、アセスメント・レポートごと削除します。共有コードで受け取ったお子さま（オーナーが別のコーチ）は担当リンクだけ外すので、記録は相手側に残ります。取り消せないため確認ダイアログを挟み、削除される人数と環境名を表示します。本番では他の開発用APIと同じく404になります。

初回とデータを作り直したいときは、ローカルD1へマイグレーションを適用してからシードを実行します。

```bash
pnpm db:migrate:local
pnpm --filter @papamo/api db:seed:local
```

`db:seed:local` はローカルD1の子ども、担当紐づき、アセスメント、レポートをすべて削除します。実際のログインで作られたコーチ行と表示名は残し、ログイン不能な背景コーチ15名だけを作り直します。背景コーチは一覧規模・担当関係の確認用であり、Googleログイン用アカウントではありません。

共有コードの取り込みとオーナー移譲は、実在する2つのGoogleテストアカウントを別々のブラウザプロファイルで同時にログインして確認します。

1. プロファイルAで子どもを開き、通常の共有コードをコピーする
2. プロファイルBで取り込み、双方から同じ記録が見えることを確認する
3. プロファイルAでオーナー移譲コードをコピーし、プロファイルBで取り込む
4. プロファイルBがオーナー、プロファイルAがメンバーになり、Aだけリンク解除できることを確認する

本リポジトリはなりすまし機能やSupabaseのservice role key／Admin Auth APIを使いません。

### ステージング環境

ステージングは本番とは別の Worker・D1 を使い、Supabase は lesson-admin のステージングプロジェクトを共用します。公開 URL は `https://user-assessment-staging.heyasupo-lab.com` です。

最初に `apps/web/.env.staging.example` を `apps/web/.env.staging.local` へコピーし、lesson-admin の `.env.staging.local` と同じ `VITE_SUPABASE_ANON_KEY`（`sb_publishable_...`）を設定してください。`.env.staging.local` は Git 管理されません。service role / secret key は本ツールでは使用しません。

```bash
pnpm db:migrate:staging
pnpm run deploy:staging
```

必要な場合だけ、デプロイ後にステージングのサンプルデータを初期化します。このコマンドは子ども・担当紐づき・アセスメント・レポートを削除するため、確認文字列を必須にしています。

```bash
pnpm --filter @papamo/api db:seed:staging -- --confirm papamo-user-assessment-staging
```

`deploy:staging` は shared・web・api をビルドしてから `wrangler deploy --env staging` を実行します。D1 マイグレーションは自動実行しないため、DB 変更があるときは先に `pnpm db:migrate:staging` を実行してください。Google OAuth と Supabase の設定を含む初回手順は `docs/staging-deployment.md` を参照してください。

本番D1のマイグレーションはデプロイ前に `pnpm db:migrate:production` で適用します。ステージング・本番とも、実行前に `apps/api/wrangler.toml` の対象D1 IDを確認してください。

ステージングでもアプリ内のメールアドレス許可リストは持たず、共用する Supabase Auth でログインできるユーザーを受け入れます。ステージングのシードは子ども関連データを全削除し、実コーチの表示名を保ったまま背景コーチ15名を再作成します。

本番は `APP_ENV=production` かつ `NON_PRODUCTION_TOOLS_ENABLED=false` です。開発用UIは表示されず、認証済みで開発用APIを呼んでも404を返します。環境名と有効化フラグの両方を満たさない限り、生成機能は有効になりません。

### 実装状況

M0〜M6 の初期 PoC 範囲（認証、子ども管理、共有・アーカイブ、アセスメント自動保存、ルールベースレポート、子どもハブ、印刷 CSS）を実装しています。仕様変更やマスタ文言の変更は `AGENTS.md` の承認ルールに従います。

画面構成と文言は承認済みモックのままに、遷移まわりを部分的に整えています。コーチ情報はレイアウトで1回だけ取得し、画面の切り替えでヘッダーを保ったままスクロールを先頭に戻します。未保存のアセスメントから離れようとすると保存するか確認し、操作の結果は画面下の通知で伝えます。セッションが切れた場合は再ログイン後に中断した画面へ戻ります。

### 品質確認

- `packages/shared`: 日付・学年・状態判定、承認モックのフィクスチャ、ルールベースレポートのスナップショット
- `apps/api`: D1 を使ったサービス／Hono ルート結合テスト、テスト鍵による JWT 検証
- `apps/web`: 一覧、入力画面、共通部品、3枚構成レポートの Testing Library テスト

E2E テストは初期リリースの対象外です。画面変更時は PC 幅とスマートフォン幅、印刷プレビューの3枚構成、OS の「視差効果を減らす」設定での表示を手動でも確認してください。

D1では外部キー、値域、単一owner・単一下書きをDB制約でも保証します。アセスメントはrevisionベースで競合を検知し、完了済みの自動保存ではレポートも同じD1 batch内で更新します。
