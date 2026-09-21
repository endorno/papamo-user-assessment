# ステージング環境のセットアップとデプロイ

公開 URL は `https://user-assessment-staging.heyasupo-lab.com` です。Cloudflare Worker と D1 は本番から分離し、Supabase Auth は lesson-admin のステージングプロジェクトを共用します。

## 初回だけ行う設定

### 1. Web の Supabase 設定

`apps/web/.env.staging.example` を `apps/web/.env.staging.local` にコピーします。`VITE_SUPABASE_ANON_KEY` は `reference/papamo-lesson-admin/.env.staging.local` の同名の値を設定してください。

`.env.staging.local` は Git 管理されません。`pnpm run deploy:staging` は、このファイルが無い場合や別の Supabase URL が指定されている場合に中断します。

### 2. Supabase の JWT Signing Key

ステージング Supabase は P-256 / ES256 の非対称 JWT Signing Key へ移行済みです。設定を作り直す場合は、Supabase Dashboard の Authentication → JWT Signing Keys で次を行ってください。

1. `Migrate JWT secret` を実行する
2. 作成された非対称鍵が P-256 / ES256 であることを確認する
3. JWKS に ES256 の公開鍵が出ることを確認してから `Rotate keys` を実行する
4. 動作確認ではブラウザから一度ログアウトし、Google でログインし直す

確認コマンド:

```bash
curl -fsS https://rqrtabsygnlhgjlevqah.supabase.co/auth/v1/.well-known/jwks.json
```

`keys` に `"alg":"ES256"` の鍵が1件以上あれば準備完了です。既存の legacy JWT secret の revoke は、このステージング公開のためには不要です。

### 3. Supabase Auth と Google OAuth の URL 設定

Supabase Dashboard で lesson-admin のステージングプロジェクトを開き、Authentication の URL Configuration に次を追加します。

- Redirect URL: `https://user-assessment-staging.heyasupo-lab.com`

Google Auth Platform では、lesson-admin のステージング Supabase に設定している Web OAuth クライアントを開き、次を確認します。

- 承認済みの JavaScript 生成元に `https://user-assessment-staging.heyasupo-lab.com` を追加する
- 承認済みのリダイレクト URI に `https://rqrtabsygnlhgjlevqah.supabase.co/auth/v1/callback` があることを確認する

Google プロバイダーの Client ID / Client Secret は Supabase プロジェクト側ですでに設定されているため、本ツール用に新規発行する必要はありません。

### 4. D1 の初期化

マイグレーションをステージング D1 に適用します。

```bash
pnpm db:migrate:staging
```

公式公開前のステージングではデータを作り直せます。必要な場合だけ次を実行してください。実ログイン由来のコーチ行と表示名は残し、子ども関連データと背景コーチを初期化します。

```bash
pnpm --filter @papamo/api db:seed:staging -- --confirm papamo-user-assessment-staging
```

## 通常のデプロイ

```bash
pnpm run deploy:staging
```

このコマンドはステージング用の Web 環境変数でビルドし、`papamo-user-assessment-staging` Worker へ手動デプロイします。GitHub ブランチとの自動連携は使用しません。DB 変更を含む場合は、先に `pnpm db:migrate:staging` を実行してください。

## デプロイ後の確認

```bash
curl -fsS https://user-assessment-staging.heyasupo-lab.com/api/health
```

ブラウザでは次を確認します。

1. Supabase Auth に登録された Google アカウントでログインできる
2. 初回ログイン後に表示名登録へ進める
3. 子どもの登録、アセスメント保存、レポート表示が動作する

## Cloudflare 構成

- Worker: `papamo-user-assessment-staging`
- D1: `papamo-user-assessment-staging`（APAC）
- Custom Domain: `user-assessment-staging.heyasupo-lab.com`
- `workers.dev`: 無効
- Preview URL: 無効

Custom Domain の DNS レコードと TLS 証明書は、Wrangler のデプロイ時に Cloudflare が作成・管理します。同名の CNAME レコードがすでに存在する場合は Custom Domain を作成できないため、先に Cloudflare DNS で競合を解消してください。
