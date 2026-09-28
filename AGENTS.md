# オンライン運動療育 サービス へやすぽ コーチ向けアセスメント・レポートツール

## 0. まず読むもの（優先順）

1. このファイル全体
2. `reference/design-mock-v2.html` — PdM が作った**最新の項目定義**。到達ラダー・見えた動作・取り組みの発達・ご家族/本人の目標（COPM）・ご家庭のお困り度・レポートの構成はこちらが正。1ページ運用前提のため、画面の作りまでは真似しない。
3. `reference/design-mock.html` — PdM**承認済みのUI/UX**。画面構成・配色・挙動の参考にする。項目そのものが v2 と食い違う場合は v2 を採る。実際に実装する機能は実装のしやすさ、仕様のシンプルさを優先し、最初から複雑にしない。
4. `reference/papamo-lesson-admin/` — **既存の「メニュー構築サイト」**。レッスン内容の管理・構築を行う。本ツールの認証はメニュー構築サイトの認証と共通化する。コーチのID管理はメニュー構築サイト側で行い、このツールでログイン・ログアウトのみ行う。

`reference/` 配下は参照専用。ビルドにもテストにも含めない。

---

## 1. プロダクト概要

オンラインのマンツーマン運動療育レッスンで、コーチが **3か月ごと** に子どものアセスメントを取り、保護者向けの進捗レポートを作るツール。

- 利用者はコーチ（理学療法士・作業療法士・シッター・幼稚園教諭など、PC操作に不慣れな人が多い）。**直感的でシンプルなUI** が最優先。PC優先だがスマホでも見れるようにする。
- 初期リリースは PoC。機能を足すより、決めた範囲を確実に動かす。将来的には別システムに統合予定。データは引き継ぎたい。
- レポート生成は初期リリースでは **すべてルールベース**。将来 LLM に置き換えるため、生成部分は差し替え可能な API 境界を持つ（§7）。

### 1.1 ドメイン用語


| 用語                 | 意味                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| 種目 (exercise)      | 観察課題。`post` ラインウォーク / `eyeh` お手玉キャッチ / `hand` グーパータッチ が基本3種。`sacc` あしあとものまね / `inhi` 信号ゲーム が4・5種目目 |
| Lv                 | 各種目の到達レベル。**上限は全種目 30**（`sacc`/`inhi` の Lv21〜30 はラダー拡張までの仮置き文言）。`0`＝未実施（今回は測っていない）、`-1`＝実施不可（取り組めなかった）。未入力（`undefined`）とは区別する |
| 帯 (band)           | Lv をまとめた段階（例：17cm一巡 / 8.5cm一巡 / VOR / パスート）。マスタで定義                                                              |
| 見えた動作 (observations) | 種目観察中に見えた動き。種目ごとの固定リストから複数選択＋自由記入欄1つ                                                                    |
| 取り組みの発達 (engagement) | 参加の持続／必要な支援／課題への向かい方／切り替えと立て直し の4軸×5段階。未評価あり                                                        |
| 環境調整 (envSupports) | 取り組みやすくなった条件。4グループ×5項目の複数選択。順序尺度ではなく profile                                                          |
| できるようになりたいこと (wants) | 達成したい具体的なこと。22項目から最大4つ                                                                                 |
| 目標 (copm)          | COPM形式の目標。最大4件、各件に 遂行度／満足度／親御さんの重要度（1〜10）                                                             |
| 神経ドメイン (domain)    | 困りごとの背景にある力。DN 1〜7。困りごとの各項目が内部でここに紐づく                                                                 |
| 育ちのピラミッド          | 感覚（いちばん下）から学習・情緒（いちばん上）までの5段。レポートで「いま育てたい土台」を示す                                                    |
| 困りごと (troubles)    | 保護者ヒアリングで確認する日常の困りごと。年齢帯（`sch` 就学 / `pre` 未就学）別のカテゴリ×3項目                                           |
| PPI                | ご家庭の負担度。5設問 × 0〜5                                                                                  |
| 開放 (unlockExt)     | 4・5種目目を有効にすること。子ども単位で **一度有効にしたら以降ずっと有効**                                                          |
| 共有コード (shareCode)  | 子どもを別のコーチに引き継ぐためのコード。通常コードとオーナー移譲コードの2種類                                                            |
| オーナー (owner)       | その子どもに対する唯一の責任コーチ。リンク解除ができない側                                                                      |
| 学年 (grade)         | 登録時の学年と年度を保存し、**4/1 に自動で進級** する。生年月日・年齢は保存しない（§2.4）                                                |
| アーカイブ (archive)    | 退会した子どもを一覧から隠すこと。データは消さず、いつでも戻せる                                                                    |


---

## 2. 確定した仕様（変更するには PdM の承認が必要）

### 2.1 認証・コーチ

- 認証は **Supabase Auth**。`reference/papamo-lesson-admin` で行っている認証基盤に相乗りする。
- ログインは **Google OAuth のみ**（lesson-admin と同じ方式）。メール／パスワード認証は実装しない。モックのログイン画面にはメール・パスワード欄があるが、実際は「Google でログイン」ボタン1つに置き換える。
- **lesson-admin にログインできる人はこのツールにもログインできる**（同じ Supabase プロジェクトのユーザーであることが唯一の条件）。本ツール側での在籍チェック・許可リストは持たない。
- JWT は **非対称鍵（JWKS）で検証** する。API は `Authorization: Bearer <access_token>` を受け取り、Supabase の JWKS エンドポイントで署名検証・`exp`・`aud`・`iss` を確認する。HS256 の JWT secret は使わない。
- コーチの追加・退職などのユーザー管理は lesson-admin 側の責務。**このリポジトリはログイン／ログアウトのみ**。パスワードリセット・招待・プロフィール管理UIは作らない。
- コーチの識別子は Supabase の `sub`（user id）。メールアドレスは Supabase Auth から受け取る。
- **初回ログイン時に、このリポジトリ用の表示名（例「さとうコーチ」）を登録させる**。表示名未登録のコーチはオンボーディング画面以外に進めない。表示名はあとから `/me` で変更可能。
- 退職者はトークン失効（lesson-admin 側での無効化）に任せる。こちらでの在籍管理はしない。

### 2.2 子どもと閲覧範囲

- コーチの一覧には **自分が作成した子ども** と **取り込んだ子ども** だけが出る（他のコーチの子どもは見えない）。
- 子どもには **共有コード（share code）** がある。別のコーチはそのコードで子どもを **取り込み（import）** できる。取り込めるコードに制限はない（任意の子どもを取り込める）。
- 取り込んだコーチは **作成者（初期オーナー）と同じ全権限**（閲覧・アセスメント作成・レポート作成）を持つ。
- **オーナー移譲付き共有コード** もある。こちらで取り込んだ場合はオーナー権限が移譲する（旧オーナーは member になり、以後は自分でリンク解除できる）。
- 取り込んだ子どもはオーナーでない場合、自分の一覧から **削除（リンク解除）できる**。**オーナーはリンク解除できない**（誰からも見えなくなるため）。
- 子どもレコードの **削除はオーナーのみ、かつ最初のレポートを作成する前だけ** 許可する。入力中のアセスメントがあれば一緒に削除し、共有済みの場合は全コーチの一覧から消す。オーナー移譲後の旧オーナーは member なので削除できない。
- 退会した子どもは **アーカイブ** する。アーカイブすると全コーチの一覧から消えるが、データは残り **いつでも復元できる**。アーカイブ／復元はオーナーのみ。アーカイブ中の子どもは読み取り専用（アセスメントの新規作成・編集はできない）。
- 共有コードの失効・再発行はしない。誰がいつ取り込んだかは記録に残るため、運用でカバーする。
- 子どもの名前は **下の名前のみを想定**。敬称は「くん／ちゃん／さん」。姓・住所・写真などは扱わない。
- 性別は「男の子／女の子／選ばない」。**敬称とは連動させない**（女の子でも「くん」で呼ぶなど、呼び方は家庭ごとに違うため）。既定は「選ばない」。

### 2.3 アセスメント

- 1つの子どもに **下書き（draft）は同時に1件まで**。
- 入力画面は **1ビュー**（モック参照）。コーチが保護者にヒアリングしながらその場で入力するため、順不同で編集でき、**変更のたびに自動保存**。
- 目標は子ども登録時ではなく、初回アセスメントで設定する。初回だけ、入会時Googleフォームの回答セルをスプレッドシートからコピーし、専用ダイアログへ貼り付けて目標欄へ一括入力できる。
- 全種目（3 または 5）の到達が **選ばれる** までレポートを作れない。選択肢は Lv1〜（種目ごとの上限）と「未実施」「実施不可」で、**未入力のまま残っているとレポートを作れない**。当日測れない種目は「未実施」を選ぶか、下書きのまま閉じて後日続きから入力する。
- 未実施・実施不可の種目はレーダーでは中心に寄せて描き、優先テーマ・強みの対象から外す。レポートには「できないという意味ではありません」と注記する。
- 取り組みの発達・環境調整・できるようになりたいこと・目標（COPM）は **レポート作成の必須条件にしない**。入力があった分だけレポートに出す。
- 4・5種目目：表示上の目安は入会6か月以降だが、**有効化はコーチ判断**。新規アセスメント作成時のチェックで開放し、開放後は子ども単位で永続（以降のアセスメントは自動的に5種目）。未開放の間は入力不可・アルゴリズム対象外だが、**レポートには「これから加わる種目」として必ず表示**する。
- ご家庭のお困り度（PPI）は **5設問すべてに回答が必要**。0 は「ほぼ感じない」という回答であり、未回答とは区別する（レポートを作るには全問の回答が要る）。
- **3か月の運動計画（テンプレート選択）は持たない**。design-mock-v2 に無い概念のため廃止した（2026-09-21）。コーチ所見メモは内部用として残す。
- 比較対象は **直前の完了アセスメントのみ**（選択UIなし）。
- 一覧の「次回まであとN日」警告は **予定日の14日前** から（予定日 = 直前の完了アセスメントの実施日 `assessed_on` + 3か月）。アーカイブ済みの子どもは催促に出ない。
- 「SVに引き継ぐ」チェックはモックUIにあるが **実装しない**。通知先がなく、フラグだけ残っても運用されないため（将来メール／Slack通知とセットで検討する）。

### 2.4 学年と年齢

- **生年月日・生年月は保存しない**。必要なのは「困りごとセットの出し分け（就学／未就学）」と「レポートでの見え方」だけで、正確な年齢は要らないため。
- 登録時にコーチが **現在の学年** を選び、`grade_code` とその時点の **年度** を保存する。以後は **4/1 に自動で進級** して表示される（保存値は書き換えない）。
- `age_group`（`sch` 就学 / `pre` 未就学）は **学年から自動判定**。コーチに選ばせない。
- 年齢は保存も算出もせず、学年に対応する **一般論の目安**（例：小学1年生 →「6〜7歳」）をマスタから引いて参考表示する。モックの「7歳・小学1年生」は「小学1年生（6〜7歳）」になる。

### 2.5 レポート

- レポートは **保護者向けのみ**。コーチ向けの内容（優先テーマ・次に狙うLv・つまずき・所見）は子どもページで閲覧する。
- アセスメントとレポートは何度でも編集・出力ができる。ただし、次のアセスメントを作った後は編集不可とする（アセスメントは過去のデータを参考にするので差分が生じ、混乱を生むため）
- 「保護者に共有した」フラグはモックUIにはあるが、実装不要。コーチが自己責任で保護者に共有する。
- PDF は **ブラウザ印刷**（`window.print()` + 印刷用CSS）。サーバー側PDF生成は初期はしない。
- 引き継ぎシートもモックUIにはあるが実装不要。子どもの共有機能（共有コード）で代替する。

---

## 3. 技術スタックとリポジトリ構成


| 領域       | 採用                                                                                          |
| -------- | ------------------------------------------------------------------------------------------- |
| ランタイム    | Cloudflare Workers（1 Worker に API と静的アセットを同梱）                                               |
| API      | Hono                                                                                        |
| DB       | Cloudflare D1 + Drizzle ORM（drizzle-kit でマイグレーション）                                          |
| フロント     | Vite + React 19 + TypeScript、react-router、@tanstack/react-query                             |
| 認証クライアント | @supabase/supabase-js（セッション取得のみ）                                                            |
| JWT 検証     | jose（JWKS の取得・キャッシュ・ES256 検証）                                                               |
| ID 生成      | ulid                                                                                        |
| スタイル     | 素の CSS（CSS Modules）。Tailwind は使わない。デザイントークンはモックの `:root` 変数を移植                           |
| バリデーション  | zod（`packages/shared` に集約、API とフロントで共用）                                                     |
| テスト      | Vitest（API は `@cloudflare/vitest-pool-workers`、web は jsdom + Testing Library、shared は node） |
| パッケージ管理  | pnpm workspace（pnpm 10 / Node 22）                                                           |
| デプロイ     | Cloudflare Workers Builds（Git 連携）。`main` へのマージで本番デプロイ                                       |


```
.
├── AGENTS.md
├── package.json                 # workspace ルート。lint/test/build を束ねる
├── pnpm-workspace.yaml
├── reference/                   # 参照専用（ビルド・テスト対象外）
│   ├── design-mock.html         # PdM 承認済みモック。マスタ文言とロジックの唯一の正
│   └── papamo-lesson-admin/     # 既存のメニュー構築サイト（別リポジトリへの symlink）
├── packages/
│   └── shared/                  # 依存ゼロ（zod のみ）。API/web 両方から import
│       └── src/
│           ├── master/          # 種目ラダー・見えた動作・取り組みの発達・目標・困りごと・PPI・学年（§6）
│           ├── schema/          # zod スキーマ & 型（Child, Assessment, Report...）
│           ├── domain/          # 純粋関数：状態判定・次回予定日・帯判定・差分
│           └── report/          # ReportGenerator インターフェース & RuleBasedReportGenerator（§7）
└── apps/
    ├── api/                     # Hono on Workers
    │   ├── wrangler.toml
    │   ├── drizzle.config.ts
    │   ├── migrations/          # drizzle-kit generate の出力（コミットする）
    │   └── src/
    │       ├── index.ts         # app 組み立て・アセット配信
    │       ├── db/schema.ts     # Drizzle スキーマ（§5）
    │       ├── middleware/auth.ts
    │       ├── routes/          # me / children / assessments / reports
    │       └── services/        # DB アクセス & ユースケース
    └── web/                     # Vite + React
        └── src/
            ├── app/             # ルーター・プロバイダ
            ├── pages/           # Login / Onboarding / Home / Child / Assessment / Report
            ├── components/
            ├── api/             # fetch ラッパ（Bearer 付与）と react-query hooks
            └── styles/          # tokens.css / print.css

```

依存の向き：`web → shared`、`api → shared`。`shared` は Workers 固有・DOM 固有の API に依存しない。

---

## 4. セットアップと日常コマンド

```bash
pnpm install
pnpm -r build                      # pnpm が依存グラフ順（shared → web → api）で実行する
pnpm --filter api dev              # wrangler dev（ローカル D1、web は dist を配信。web 開発中は下を併用）
pnpm --filter web dev              # Vite dev server。/api は wrangler dev にプロキシ
pnpm --filter api db:generate      # drizzle-kit generate（スキーマ変更時）
pnpm db:migrate:local              # ローカル D1 に未適用マイグレーションを適用
pnpm db:migrate:staging            # staging D1 に適用（D1 ID 設定後）
pnpm db:migrate:production         # 本番 D1 に適用（D1 ID 設定後）
pnpm -r test                       # 全テスト
pnpm -r lint && pnpm -r typecheck

```

環境変数（`apps/api/wrangler.toml` の `[vars]` と `.dev.vars`）：


| 名前                    | 用途                                                                       |
| --------------------- | ------------------------------------------------------------------------ |
| `SUPABASE_URL`        | lesson-admin と同じ値。JWKS は `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` |
| `SUPABASE_JWT_ISSUER` | `${SUPABASE_URL}/auth/v1`                                                |
| `SUPABASE_JWT_AUDIENCE` | `authenticated`（Supabase のアクセストークンの `aud`）                          |
| `REPORT_GENERATOR`    | `rule_v1`（既定）。将来 `llm_v1` などを追加                                          |
| `TZ` 相当               | コード内で `Asia/Tokyo` 固定。環境変数にしない                                           |


web 側（`apps/web/.env.local`）：`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`。値は lesson-admin のものを流用する。秘密情報（service role key 等）は **一切使わない・コミットしない**。

**ローカル開発の具体値**（lesson-admin 側で `supabase start` して立ち上がっているものを共有する）：

```bash
# apps/api/.dev.vars（コミットしない。.dev.vars.example を同じ内容で置く）
SUPABASE_URL=http://127.0.0.1:15421
SUPABASE_JWT_ISSUER=http://127.0.0.1:15421/auth/v1
SUPABASE_JWT_AUDIENCE=authenticated
REPORT_GENERATOR=rule_v1

# apps/web/.env.local
VITE_SUPABASE_URL=http://127.0.0.1:15421
VITE_SUPABASE_ANON_KEY=...   # reference/papamo-lesson-admin/.env.local の同名の値を流用
```

- ローカルの JWKS は `http://127.0.0.1:15421/auth/v1/.well-known/jwks.json`。**ES256 の鍵が返ることを確認済み**（2026-09-12）。
- D1 のバインディング名は `DB`、`database_name` は `papamo-user-assessment`。ローカルは `wrangler dev` が `.wrangler/` 配下に自動で作る。
- Orca でワークツリーを作ると、`.worktreeinclude` に列挙した `.dev.vars` / `.env.local` / `.env.staging.local` が元のチェックアウトからコピーされ、`orca.yaml` の setup で `pnpm install` → `pnpm -r build` → ローカル D1 マイグレーションを行う。`node_modules` とローカル D1 はワークツリーごとに別々に持つ（共有しない）。
- 動作環境：Node 24 / pnpm 10.33 / wrangler 4 で確認。`engines.node` は `>=22`。依存のバージョンは初回 install 時に最新安定版で解決し、**lockfile をコミットする**。

### 4.1 公式リリース前のデータとマイグレーション

- 公式リリースまでは、このリポジトリ専用の local / staging D1 にあるデータは検証用であり、実装やデータモデルを簡潔にできるなら削除・DB再作成・マイグレーション履歴の再構築を選べる。
- データ互換や移行のために複雑な実装を追加する前に、local / staging D1 のデータを破棄してよいか PdM に確認する。明示的な了承がある場合は、旧データ互換コードを残さず最終形から作り直す。
- この方針の対象は **本リポジトリ専用のD1だけ**。`reference/papamo-lesson-admin`、lesson-admin が使うDB、Supabase Auth、共有Supabaseプロジェクト、その他の外部サービスのデータは削除・初期化しない。
- 公式リリース後は適用済みマイグレーションを変更せず追記方式に切り替え、既存データを保持する移行とテストを必須にする。
- 初期マイグレーションは Drizzle の `meta` を含めてコミットする。Drizzleスキーマで表現できないトリガー等は `drizzle-kit generate --custom` で別マイグレーションにする。

---

## 5. データモデル（D1 / Drizzle）

ID は ULID（文字列）。日時は ISO 8601 文字列（UTC）で保存し、表示時に Asia/Tokyo へ変換。日付のみの列（`assessed_on` など）は `YYYY-MM-DD`。

```ts
coaches           id (= supabase sub) PK, email, display_name (null 可 → オンボーディング未完), created_at, updated_at
children          id PK, share_code UNIQUE, owner_share_code UNIQUE, created_by → coaches.id,
                  name, honorific ('kun'|'chan'|'san'), gender ('boy'|'girl'|'unspecified'),
                  grade_code ('k0'|'k1'|'k2'|'k3'|'e1'..'e6'|'j1'..'j3'), grade_base_year (int, 年度),
                  joined_month ('YYYY-MM'), ext_unlocked (bool, default false),
                  archived_at (null 可 → アーカイブ済み), created_at, updated_at
child_coaches     child_id, coach_id, role ('owner'|'member'), created_at   PK(child_id, coach_id)
assessments       id PK, child_id → children.id, seq_no (1,2,3...), status ('draft'|'done'), assessed_on,
                  coach_id → coaches.id, unlock_ext (bool), prev_assessment_id (null 可), master_version,
                  data (JSON: AssessmentData), created_at, updated_at, completed_at (null 可)
                  UNIQUE(child_id, seq_no) / 部分 UNIQUE INDEX で「child_id ごとに draft は1件」
reports           id PK, assessment_id UNIQUE → assessments.id, generator ('rule_v1'...),
                  content (JSON: ReportContent), created_at, updated_at

```

`AssessmentData`（zod で定義、`data` 列に格納）：

```ts
{
  lv: { post?: number, eyeh?: number, hand?: number, sacc?: number, inhi?: number }, // -1..種目ごとの上限、未入力は undefined
  observations: Partial<Record<ExerciseKey, string[]>>,   // 見えた動作（選択）
  observationNotes: Partial<Record<ExerciseKey, string>>, // 見えた動作（自由記入）
  engagement: { dur?: number, sup?: number, mot?: number, rec?: number },  // 0..4、未評価は undefined
  envSupports: string[],         // 環境調整のキー
  troubles: string[],            // マスタの困りごと文言（age_group に対応するセットのもの）
  wants: string[],               // できるようになりたいことの id（最大4）
  copm: { text, memo, performance, satisfaction, importance }[],  // 最大4、採点は 1..10
  ppi: { time?: number, emo?: number, soc?: number, fut?: number, nav?: number },  // 0..5、未回答は undefined
  ppiNote: string,
  memo: string
}

```

zod スキーマは **下書き用（すべて optional）と完了用（全種目の `lv`・PPI 全5設問が必須）の2段構え** にする。`PATCH` は下書き用で検証し、`complete` は完了用で検証する。目標の唯一の保存元はその回の `copm` とし、`children` や `AssessmentData.goals` へ重複保存しない。次の下書きには直前の完了アセスメントの `copm` を初期値としてコピーし、初回は空欄から始める。

設計上の注意

- `share_code` / `owner_share_code` は人が口頭・チャットで伝えられる **8文字**（Crockford Base32、`0/O/1/I` を除く、`XXXX-XXXX` 表示）。子ども作成時に2本とも生成し、衝突時は再生成。取り込みAPIは受け取ったコードがどちらの列に一致したかで「参加」か「オーナー移譲」かを判定する（§8.2）。オーナー移譲コードは子どもページのオーナーにだけ表示する。
- **生年月日・生年月・年齢は保存しない**（§2.4）。`grade_code` は登録時の学年、`grade_base_year` はその学年だった **年度**（4/1 始まり）。表示する学年は `gradeAt(child, today)` で算出し、保存値は書き換えない。
  - 年度 `schoolYear(d)` = 月が4以上ならその年、1〜3月なら前年（Asia/Tokyo）。
  - 表示学年の添字 = 登録学年の添字 + (`schoolYear(today)` − `grade_base_year`)。上限（中3）を超えたら「中学卒業以上」で止める。
  - 学年を修正したいときは `grade_code` と `grade_base_year`（＝今の年度）を同時に更新する。
- `age_group`（`sch` / `pre`）は列に持たず、**その時点の学年から算出**する（マスタ `grades.ts`）。困りごとセットの出し分けに使う。
- `archived_at` が入っている子どもは一覧・催促・共有コードの取り込み対象から外れ、書き込み系 API は 409 を返す。復元は `archived_at` を null に戻すだけ。
- `ext_unlocked` は子ども側の永続フラグ。4・5種目目の開放操作は未開放時のアセスメント画面だけに置く。アセスメント完了時に `unlock_ext=true` なら子どもへ伝播し、以後の新規アセスメントは `unlock_ext=true` 固定。
- 完了後の `assessments.data` と `reports.content` も、**次のアセスメントが作られるまでは更新できる**（§2.5）。更新のたびにレポートを再生成して `reports` を上書きする。次のアセスメント（draft を含む）が存在する時点で、以降その回は読み取り専用。
- `assessments.coach_id` は **その回を完了させたコーチ**（レポートの「担当」に出る名前）。下書きを別のコーチが引き継いで完了させた場合は完了時のコーチで上書きする。
- `master_version` にはマスタデータの版（例 `2026-09`）を記録し、後からマスタが変わっても過去データの解釈が追えるようにする。

---

## 6. マスタデータ（`packages/shared/src/master`）

初期リリースでは **TypeScript 定数** として管理する（D1 化は管理UIが必要になってから）。

すべて `reference/design-mock.html` の `<script>` 冒頭にある定数を **そのまま** 移植する（文言を変えない）。

- `exercises.ts` — 5種目の定義。`design-mock-v2.html` の `AX` が正。1種目のフィールドは `key / core / icon / name（種目名）/ parentName（保護者向けの力の名前）/ clinicalName / summary / about / grow / maxLevel / pyramidRoot / pyramidRelated / build[] / changes3m[] / links[] / changes6m[] / observations[]（見えた動作）/ bands[] / errorPatterns[] / ladder[]`。到達の特別値は `LEVEL_NOT_MEASURED`（0＝未実施）と `LEVEL_NOT_POSSIBLE`（-1＝実施不可）。
- `ladders.ts` — 到達ラダー。v2 の `LT` をそのまま移植（全種目30段。`sacc`/`inhi` の Lv21〜30 は仮置き）。
- `troubles.ts` — `sch` / `pre` × カテゴリ5 × 3項目。各項目は `text` と `domain`（DN の id）を持つ。**チェックされた困りごとは文言そのものを保存する**（§5）ため、文言変更＝過去データとの突き合わせ不能。変更時は PdM 承認に加えて移行方針が必要。就学／未就学の統合は検討中で、統合までは文言を据え置く。
- `domains.ts` — 神経ドメイン（DN 1〜7）と育ちのピラミッド（5段）。各ドメインは `priorityKey`（主に支える種目）・`pyramid`・`parentLabel` / `parentText`（保護者向けの平易な言い換え）を持つ。
- `engagement.ts` — 取り組みの発達（4軸×5段階）と環境調整（4グループ×5項目）。
- `goals.ts` — できるようになりたいこと（22項目・最大4）と COPM の採点定義（1〜10、最大4件）。
- `report-copy.ts` — レポートの固定文言（リスク・成長のサイン・免責）と、ルール未確定箇所の一覧 `TUNING_NOTES`。
- `ppi.ts` — 5設問（`time / emo / soc / fut / nav`）。**5問すべて回答必須**（§2.3）。
- `grades.ts` — 学年マスタ（モックには無い。新規に定義する）。`k0 未就園 / k1 年少 / k2 年中 / k3 年長 / e1..e6 小学1〜6年生 / j1..j3 中学1〜3年生` を **この順** で並べ、各要素に `name`（表示名）・`ageHint`（一般論の目安年齢。例 `e1` → `'6〜7歳'`）・`ageGroup`（`k*` → `pre`、`e*`・`j*` → `sch`）を持つ。進級は配列の添字で計算する（§5）。
- `version.ts` — `MASTER_VERSION`。

マスタ文言の変更は PdM 承認事項。エージェントが独断で言い回しを変えない。

---

## 7. レポート生成の API 境界（将来 LLM に差し替える前提）

### 7.1 インターフェース（`packages/shared/src/report`）

```ts
export interface ReportInput {
  child: ChildSnapshot;              // 名前・敬称・学年（実施日時点）・ageHint・ageGroup
  coach: { displayName: string };    // レポートに出る「担当」
  assessment: CompletedAssessment;   // seq_no, assessed_on, unlock_ext, data
  previous?: CompletedAssessment;    // 直前の完了アセスメント（初回は undefined）
  master: MasterData;                // exercises/troubles/ppi/plans + version
  generatedAt: string;               // 呼び出し側が注入（§7.2）
}

export interface ReportGenerator {
  readonly id: string;               // 'rule_v1' | 'llm_v1' ...
  generate(input: ReportInput): Promise<ReportContent>;
}

```

`ReportContent` は **表示用HTMLではなく構造化JSON**。フロントはこの JSON をレンダリングする。レポート画面は `GET /assessments/:id/report` の結果だけで描けること（子ども名・担当名を別APIから取りに行かない）。将来の LLM 実装も同じスキーマを返す（文章フィールドが増える場合はスキーマに optional で追加し、ルール版では省略）。

`levels` に未開放の4・5種目目は含めない。レポートのレーダーは5軸すべて描き、未開放の軸に「半年目以降」と表示する — この軸は `upcomingExercises` からフロントが描く（種目ごとの一覧表は出さない）。

```ts
{
  kind: 'first' | 'comparison',
  generator: string, masterVersion: string, generatedAt: string,
  header: { childName, honorific, grade, ageHint, joinedMonth, seqNo, assessedOn, prevAssessedOn?, coachName },
  levels: { key, name, parentName, lv, maxLv, measured, prevLv?, delta?, band, ladderLabel }[],  // 未開放種目は含めない
  unmeasured: { key, name, upcoming, notPossible }[],        // 今回測っていない種目（図の注記）
  conditionNotes: { key, name, notes[] }[],                  // 当日の様子（指示理解の難しさ など）
  upcomingExercises: { key, name, parentName, about }[],     // 未開放の4・5種目目
  priorities: { key, parentName, lv, maxLv, grow, build[] }[],
  strengths: { key, parentName, lv, maxLv }[],
  engagement: { key, title, subtitle, level, levelCount, label, prevLevel?, delta? }[],
  envSupports: { group, items[] }[],
  changes3m?: string[],                                      // comparison のみ
  troubles: { current[], byCategory[], gone?, stayed?, added? },
  domainHits: { id, title, parentLabel, parentText, pyramid, troubles[], verdict, priority... }[],
  rootDomain: { id, title, parentLabel, parentText } | null,
  proprioceptionNote: boolean,                               // 力加減の基準（固有覚）の所見を出すか
  risks: string[],
  pyramid: { rows[], highlighted[], root, rootTierLabel, related[], sourceKey },
  link: { lowestKey, text },
  ppi: { current: PPI, previous?: PPI, note },
  roadmap: { month3Build[], month3Changes[], month6Links[], month6Changes[] },
  wants: { id, group, icon, text, short, menu }[],
  copm: { text, memo, performance, satisfaction, importance, previous?, performanceDelta?, satisfactionDelta? }[],
  growthSigns: string[], watchPoints: string[],
  nextDue: 'YYYY-MM-DD', nextReview: 'YYYY-MM-DD',           // 3か月・6か月レビューの目安日
  tuning: { key, label, note }[],                            // 「アルゴリズム調整中」を出す箇所
  coach: { strategies: { key, lv, band, nextLv, nextLabel, observations[], note }[], memo }  // 子どもページ用
}
```

### 7.1.1 保護者向けレポートのシート構成（`design-mock-v2.html` 準拠）

印刷して4枚。フロントはこの順で `.sheet` を並べる。

| シート | 見出し | 載せる `ReportContent` のフィールド |
| --- | --- | --- |
| Page 1 | 初回『◯◯ちゃんの現在地と強み』／比較『◯◯ちゃんの3か月の変化』 | `header` / レーダー（`levels` + `upcomingExercises`。軸ごとの Lv と「今の到達」の合計をレーダー内・直下に出す）/ `unmeasured`・`conditionNotes` の注記 / `changes3m`（比較のみ）/ `priorities` / `strengths` / `engagement`・`envSupports` / `upcomingExercises`（レーダーの「半年目以降」と ※ 注記で触れる。別枠は置かない） |
| Page 2 | 『今のお困りごとと、その理由』／比較『困りごとと、ご家庭の負担の変化』 | `troubles`（初回はカテゴリ別、比較は gone/stayed/added のピル）/ `domainHits` の表 / `risks` / `rootDomain` / `proprioceptionNote` / `pyramid` |
| Page 3 | 『◯◯ちゃんの6か月成長ロードマップ』 | 現在地（`levels` + `strengths`）→ `roadmap.month3*` → `roadmap.month6*` → 目指す未来（`wants` + `copm`）。4本を色分けし、矢印でつなぐ |
| Page 4 | 『これから一緒に見ていくこと』 | `growthSigns` / `watchPoints` / `wants` / `copm` の表 / `ppi` / `nextDue`・`nextReview` のミニタイムライン |

子どもページの「今期のレッスン戦略」は `coach.strategies` と `coach.memo` を使う（レポートには出さない）。

### 7.2 ルールベース実装 `RuleBasedReportGenerator`（id: `rule_v1`）

- `reference/design-mock-v2.html` の `build()` 内の組み立てロジックを純粋関数として移植する。**正は design-mock-v2.html**。
- 優先テーマと強みの分割はモックの分割に従う：**Lv1 以上で実際に測れた種目だけ**を Lv 昇順に並べ、`n = min(3, max(1, 測定済み種目数 - 1))` 件を優先テーマ、残りを Lv 降順で強みにする。`link.lowestKey` は最小 Lv の種目。未実施・実施不可の種目はどちらにも入れない。
- 困りごとは項目ごとの `domain` で神経ドメインへ集約し、`強く一致`（主軸種目が下位半分かつ Lv6 以下）→ `一致`（下位半分かつ Lv10 以下）→ `未測定`（主軸種目が未実施、または帯の条件に未到達）→ `不一致` の順に並べる。最初の `強く一致` / `一致` が `rootDomain`。
- **ルールが未確定の箇所は `tuning` に載せ、レポート画面に「アルゴリズム調整中」を表示する**。勝手に決め打ちせず、決まったら `TUNING_NOTES` から外す。現在の対象は、2回目以降の比較・取り組みの発達の差分・COPM の再採点・未就学児の困りごとの紐づけ・優先テーマの決め方（種目間の重みづけ）。
- **同 Lv のタイブレークは `AX` の定義順**（post → eyeh → hand → sacc → inhi）。JS の安定ソートに暗黙に頼らず、比較関数に明示する。
- 完全に決定的であること（同じ入力 → 同じ出力）。乱数・日時依存を入れない（`generatedAt` は呼び出し側から注入）。
- ユニットテストでスナップショットを固定する（§10）。

### 7.3 組み込み

- `apps/api/src/services/report.ts` に `getReportGenerator(env)` を置き、`env.REPORT_GENERATOR` で実装を選ぶ。未知の値は起動時エラー。
- 生成は `POST /api/assessments/:id/complete` の中で **同期的に** 行い、`reports` に保存してから返す。生成に失敗した場合はアセスメントを `done` にしない（トランザクション or 順序で保証）。
- 完了済みアセスメントを編集して再度 `complete` した場合は、同じ `reports` 行を上書きする（版は残さない）。再生成には **そのアセスメントの `master_version` ではなく現在のマスタ** を使い、`master_version` を更新する。
- LLM 版を追加するときは `packages/shared/src/report/llm/` に実装し、API キー等は Workers の Secrets から注入する。フロントは変更不要であること。

---

## 8. API 仕様（Hono, `/api/*`）

すべて JSON。認証必須（§8.1）。エラーは `{ error: { code, message } }`、コードは `unauthorized | forbidden | onboarding_required | not_found | validation | conflict | internal`。`message` はコーチがそのまま読める日本語（§13）。

**リクエストとレスポンスの型は両方 `packages/shared/src/schema` に zod で置き**、API は同じスキーマで検証し、web は `z.infer` した型で受ける。API 側だけに型を書かない。日付・日時は文字列のまま返す（`Date` にしない）。

### 8.1 認証ミドルウェア

1. `Authorization: Bearer` を取り出す。無ければ 401。
2. JWKS（キャッシュ：Workers の `caches.default` または in-memory、TTL 10分）で検証。`iss`・`aud`・`exp` を確認（§2.1）。
3. `sub` で `coaches` を upsert（email を最新化）。`c.set('coach', row)`。
4. `display_name` が null の場合、`/api/me` 以外は 403 `onboarding_required`。

### 8.2 ルート


| Method | Path                        | 内容                                                                                                                                                        |
| ------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/me`                       | 自分のコーチ情報（`displayName` が null ならオンボーディング対象）                                                                                                               |
| PUT    | `/me`                       | `{ displayName }` を更新（1〜30文字）                                                                                                                             |
| GET    | `/children`                 | 自分に紐づく子ども（作成した子ども＋取り込んだ子ども）の一覧 + 各子どもの状態（§8.3）。**アーカイブ済みは除外**、`?archived=1` でアーカイブ済みのみ。一覧の並び順はサーバーで決める                                                     |
| POST   | `/children`                 | 作成。`{ name, honorific, gender?, gradeCode, joinedMonth }`（`gender` 省略時は `unspecified`）。`grade_base_year` は作成時の年度、`age_group` は学年から算出。`child_coaches` に owner を追加し、共有コード2本を生成                |
| POST   | `/children/import`          | `{ code }`。`share_code` 一致 → member として参加。`owner_share_code` 一致 → 参加のうえオーナー移譲（旧オーナーは member に降格、`children.created_by` は変更しない）。既に同じ立場で紐づいていれば 409、未知のコードは 404 |
| GET    | `/children/:id`             | ハブ用。子ども + アセスメント一覧（summary。目標表示用に完了回の `copm[].text` から導出した `goals` を含む）+ 最新完了アセスメントの report.content。自分が owner のときだけ `ownerShareCode` を含める                                                             |
| PATCH  | `/children/:id`             | `{ name?, honorific?, gender?, gradeCode?, joinedMonth? }` の更新。`gradeCode` を送ると `grade_base_year` も現在の年度で更新する。`ext_unlocked` と目標は変更不可 |
| DELETE | `/children/:id/membership`  | 自分のリンク解除。role=owner なら 403                                                                                                                               |
| DELETE | `/children/:id`             | 子どもレコードの削除。**owner かつレポート0件のときだけ** 許可（それ以外は 409）。入力中のアセスメントと全コーチの紐づきも同じトランザクションで削除する                                                                                        |
| POST   | `/children/:id/archive`     | アーカイブ（退会）。owner のみ。下書きが残っていても可（下書きごと隠れる）                                                                                                                 |
| POST   | `/children/:id/unarchive`   | 復元。owner のみ                                                                                                                                              |
| POST   | `/children/:id/assessments` | 下書き作成 `{ unlockExt }`。draft 既存なら 409。`prev_assessment_id`/`seq_no`/`troubles`・`wants`・`copm` の初期値（直前の完了回からコピー。初回の `copm` は空）はサーバーが埋める。`ext_unlocked` の子どもは `unlockExt` を true に強制 |
| GET    | `/assessments/:id`          | 単体取得（前回の summary を同梱）                                                                                                                                     |
| PATCH  | `/assessments/:id`          | 自動保存。`{ assessedOn?, unlockExt?, data }` を **全体置換**（部分マージしない）。`ext_unlocked` の子どもは `unlockExt` を true に強制。後続のアセスメントが存在する回は 409                              |
| DELETE | `/assessments/:id`          | 下書きの破棄。`status='draft'` のときだけ許可（done は 409）。誤って作った下書きを消して前の回の編集に戻るための唯一の手段                                                                               |
| POST   | `/assessments/:id/complete` | 検証（全種目の到達が選択済み・PPI 全5設問）→ done → レポート生成 → 子どもの `ext_unlocked` 伝播 → `{ report }`。**完了済みの回に対する再実行も可**（レポートを再生成して上書き）。後続のアセスメントが存在する回は 409                        |
| GET    | `/assessments/:id/report`   | レポート取得                                                                                                                                                    |


子どもスコープの全ルートで `child_coaches` **の membership を確認**する（services 層の共通関数 `requireMembership(childId, coachId)`）。アセスメント／レポートのルートは `assessment.child_id` から子どもを引いて同じ確認を通す。アーカイブ済みの子どもは **読み取りのみ許可**（復元と削除を除く書き込みは 409）、オーナー限定の操作は `role='owner'` を併せて確認する。

**同時編集**：1つの子どもに複数のコーチが紐づくため、同じ下書きを2人が同時に開ける。`PATCH /assessments/:id` は全体置換なので後勝ちで消える。リクエストに直前に取得した `updatedAt` を載せ、サーバー側で不一致なら 409 を返す（フロントは「他のコーチが更新しました。読み込み直してください」と表示して再取得）。

### 8.3 一覧の状態判定（`packages/shared/src/domain/status.ts`）

モックの `stateOf()` を移植。優先順：`draft`（入力中 n/m）→ `due`（次回まで14日以内 or 超過）→ `first`（未実施）→ `ok`（次回予定日）。

- 分母 `m` = **種目数（3 または 5）+ 2**（困りごと・お困り度）。分子 `n` = 到達が選ばれた種目数 + 困りごと1件以上 + お困り度が **5問すべて回答済み**。モックの `filledCount` は「どれか1問でも 1 以上」で判定しているが、0 は正当な回答なので回答済みかどうかで数える（§2.3）。
- 次回予定日 = **直前の完了アセスメントの `assessed_on` + 3か月**（`completed_at` ではない）。日付の比較は Asia/Tokyo の今日で行う。
- アーカイブ済みの子どもは一覧・催促の対象外。

**日付計算の注意**（`packages/shared/src/domain/date.ts` に集約する）

- 「今日」は必ず **Asia/Tokyo の日付**。Workers は UTC で動くので、JST で 0〜9時の間は素の `new Date()` の日付と1日ずれる。`todayInJst()` を1つ作り、全部そこを通す。
- **3か月後は月末の繰り上がりに注意**。JS の `setMonth` は 11/30 に +3 すると 3/2 になる。月末は clamp する（`addMonthsClamped(date, 3)`：11/30 → 2/28、5/31 → 8/31）。モックの `addM()` は clamp していないので、そのまま移植しない。
- 日付は `YYYY-MM-DD` の文字列で扱い、タイムゾーン付きの `Date` を経由しない方が事故が少ない。

---

## 9. フロントエンド

### 9.1 画面と経路（モックの画面番号に対応）


| Path               | 画面           | 備考                                                                                                                      |
| ------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `/login`           | ログイン         | **「Google でログイン」ボタン1つ**（supabase-js の `signInWithOAuth({ provider: 'google' })`）。モックのメール／パスワード欄は作らない（§2.1）                       |
| `/onboarding`      | 表示名登録        | `displayName` 未登録時のみ。完了後 `/` へ                                                                                          |
| `/`                | 担当の子ども一覧     | 最上段に「初回アセスメント未実施」、続けて「まずやること」「次の予定まで余裕あり」のセクション、状態バッジ、Lvチップ。「＋ 新しいお子さまを登録」「コードで取り込む」。末尾に「アーカイブした子ども（N名）」の折りたたみ（復元導線）                         |
| `/children/new`    | 子ども登録        | モーダルでも可。入力は 名前・敬称・性別・**学年**・入会月（年齢・目標は入力させない）。登録後は完了画面を挟まず一覧へ戻り、共有コードはここでは表示しない                                                              |
| `/children/:id`    | 子どもページ（ハブ）   | 育ちマップ（レーダー + Lv行 + 差分）、今期のレッスン戦略、困りごと・負担度、タイムライン、記録一覧、「アセスメントを始める／入力を続ける」「最新の保護者向けレポート」、共有コード、**直近の完了アセスメントで確認した目標**の表示。目標はここでは編集せず、アセスメントの COPM で変更する。4・5種目目の開放操作は置かない。オーナーなら「退会（アーカイブ）」、最初のレポート作成前なら「削除」。取り込んだ子どもなら「一覧から削除」 |
| `/assessments/:id` | アセスメント（1ビュー） | 左ジャンプナビ、「未実施／実施不可」ボタン＋帯ごとに区切ったLv1〜上限の課題リスト（前回Lvに「前回」表示）、見えた動作（選択＋自由記入）、取り組みの発達・環境調整、ご家族・本人の目標（できるようになりたいこと＋COPM表）、ご家庭のお困り度、下部固定バー（未決定の種目名 / レポートを作る）。入力は「その場で観察して記入」（種目・取り組みの発達）と「保護者と確認して記入」（お困りごと・目標・お困り度）の2エリアに**ゆるく**分け、枠線と淡い地色だけで示す（実際は順不同で行き来するため、操作は分けない）。後者の頭に「事前アンケートから取り込む」を置く。未開放時は4・5種目目の開放操作を表示。完了済みの回を開いた場合も同じ画面で編集（後続の回があれば読み取り専用）。モック最下部の「SVへ引き継ぐ」チェックは作らない（§2.3） |
| `/reports/:id`     | 保護者向けレポート    | 4枚構成（§7.1.1）。初回 / 比較の2レイアウト。印刷/PDF。ルール未確定の箇所には「アルゴリズム調整中」を表示                                                                                                   |


### 9.2 実装ルール

- 認証トークンは supabase-js のセッションから毎リクエスト取得して `Authorization` に付ける（`getSession()` はトークンを自動更新する）。更新しても 401 が返る場合のみ `/login` へ。
- lesson-admin とは別オリジンで動くため **セッションは共有されない**。「認証の共通化」＝アカウント基盤（Supabase プロジェクト）が同じという意味で、このツールでも1回ログインが必要。
- 自動保存：フォーム状態は React state に持ち、変更後 800ms デバウンスで `PATCH /assessments/:id`。連続保存中はキャンセルして最新のみ送る。保存状態（保存中／保存済み HH:MM／失敗）を画面に表示。失敗時はリトライボタンを出す（データを捨てない）。409（他コーチの更新）はリトライせず、再読み込みを促す（§8.2）。
- 保存できないまま画面を閉じられても失わないよう、未送信の下書きは `localStorage`（キー：assessment id）にも置き、復帰時に差分があれば復元を提案する。
- ページ離脱時に未保存があれば `beforeunload` で警告。
- 新しいアセスメントを始めるボタンは、**前の回が編集できなくなる**ことを確認ダイアログで伝えてから作成する（§2.5）。
- レーダー・タイムラインは SVG を自前で描く（モックの `radar()` を React 化）。チャートライブラリは入れない。
- 印刷用 CSS は `styles/print.css`。`.sheet` を A4 1ページ相当にし `page-break-after: always`（保護者向けレポートは4枚構成）。
- 文言・順序・色はモックに合わせる。デザイントークンは `:root` 変数をそのまま移植し、フォント（Zen Kaku Gothic New）も同じものを使う。改善案があればコードではなく Issue/PR 説明に書く。
- 学年・年齢の表示は **「小学1年生（6〜7歳）」** の形（年齢は `ageHint` の参考値。§2.4）。学年は表示のたびに今日の年度で算出するので、4/1 を跨げば自動で上がる。
- 目標の入力・編集はアセスメント画面の「ご家族・本人の目標」1か所（COPM表、最大4件）。保存先はその回の `AssessmentData.copm` だけとし、子どもレコードへ同期しない。子どもページでは直近の**完了**アセスメントの `copm[].text` を保護者・コーチ向けに「目標」として表示し、下書き中の変更は完了するまで反映しない。
- 事前アンケートの取り込みは「保護者と確認して記入」エリアの頭に置き、**お困りごと・目標・ご家庭のお困り度の3つ**をまとめて入れる。列名の行（`trouble` / `want` / `goal` / `ppi_time`〜`ppi_nav` / `ppi_note`）を含めて貼り付けると各欄へ振り分け、列名が無ければ従来どおり目標として扱う。回答が無かった項目には触らず、コーチの手入力を消さない。
- レポートのレーダーは大きく出す（1枚目の主役）。「これから加わる種目」は枠を作らず、レーダーの「半年目以降」とレーダー下の ※ 注記だけで伝える（別枠の案内文は重複するため置かない。2026-09-28）。育ちのピラミッドは段ごとに幅を変えて（38 / 56 / 74 / 88 / 100%）実際に三角形に見せる。6か月ロードマップは4本を色分け（現在地=緑 / 3か月後=オレンジ / 6か月後=青 / 目指す未来=ピンク）し、矢印でつなぐ。
- ご家庭の負担度は **未選択で始める**（モックのスライダー初期値0は使わない）。0〜5 のボタンで選ばせ、未回答が残っていれば下部バーに「あと N 問」を出してレポート作成を止める。
- アクセシビリティ：タップ領域 44px 以上、フォーカスリング必須、色だけで意味を伝えない（▲▼ とテキストを併記）。

---

## 10. テスト

- `packages/shared`：ルールエンジン・状態判定・日付計算・**学年の自動進級**（3/31 と 4/1 の境界、上限の中3で止まること）のユニットテスト。**モックの6人分のダミーデータ（`CHILDREN` / `ASSESS`）をフィクスチャ**（`fixtures/children.ts`）にして、レポート出力をスナップショットで固定する。初回・比較・5種目開放済み（c6 の3回目）・下書き途中（c3）が最低限のケース。
- `apps/api`：`@cloudflare/vitest-pool-workers` で D1 マイグレーションを適用した上でルートを結合テスト。認証は JWKS を差し替えられるようにし、テスト用鍵で署名したトークンを使う。必須ケース：membership 無しの 403、オーナーのリンク解除 403、通常コード／オーナー移譲コードでの取り込み、draft 重複 409、Lv 未確定の complete が 400、完了済みの回の再編集 → 再 complete でレポートが上書きされる、後続の回があるときの PATCH が 409、draft の DELETE と done の DELETE が 409、PPI 未回答での complete が 400、ext_unlocked の伝播、アーカイブ済みの子どもが一覧に出ない・書き込みが 409・復元できる、最初のレポート前は下書きと共有先ごと子どもを DELETE できる・レポート後は 409、表示名未登録での 403 `onboarding_required`。
- `apps/web`：主要コンポーネント（Lvリスト、状態バッジ、レポートの初回/比較切替）を Testing Library で。E2E は初期リリースでは行わない。
- PR には必ず該当テストを含める。`pnpm -r test && pnpm -r typecheck && pnpm -r lint` が通らないものはマージしない。

---

## 11. デプロイ

- Cloudflare Workers Builds（Git 連携）。`main` **へのマージで本番デプロイ**。
  - Build command: `pnpm install --frozen-lockfile && pnpm -r build`
  - Deploy command: `pnpm --filter api exec wrangler deploy`
  - Root directory: リポジトリルート
- `apps/api/wrangler.toml` の骨子：

```toml
name = "papamo-user-assessment"
main = "src/index.ts"
compatibility_date = "2026-09-01"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = "../web/dist"
not_found_handling = "single-page-application"
run_worker_first = ["/api/*"]

[[d1_databases]]
binding = "DB"
database_name = "papamo-user-assessment"
database_id = "（作成後に埋める）"
migrations_dir = "migrations"

[vars]                       # ローカルは .dev.vars で上書きする（§4）
SUPABASE_URL = "..."
SUPABASE_JWT_ISSUER = "..."
SUPABASE_JWT_AUDIENCE = "authenticated"
REPORT_GENERATOR = "rule_v1"
```

  未定義の `/api/*` は Hono 側で JSON の 404 を返す（SPA のフォールバックに流さない）。
- D1 マイグレーションはデプロイ前に `pnpm db:migrate:production` を手動で実行する（初期は自動化しない。マイグレーションを含む PR の説明に必ず明記）。ステージングは `pnpm db:migrate:staging` を使い、実行前に対象環境のD1 IDを確認する。
- staging 用 Worker は将来追加。`wrangler.toml` は `[env.staging]` を書けるように環境固有値を `[vars]` に寄せておく。
- Secrets（あれば）は `wrangler secret put`。リポジトリに置かない。

---

## 12. 実装の進め方（マイルストーン）

各マイルストーンは動く状態でマージできる単位。順番を守る。

1. **M0 足場**：workspace（pnpm-workspace.yaml + ルート package.json に build/test/lint/typecheck）、shared/api/web の雛形、ESLint 9（flat config。ルートに共通設定を置き各パッケージから読む）、`wrangler dev` で `/api/health` が返る、Vitest 3種（shared=node / api=vitest-pool-workers / web=jsdom）が空で通る、`apps/api/wrangler.toml`（§11）と `.dev.vars.example`、Workers Builds 設定。
2. **M1 認証**：JWKS 検証ミドルウェア、`/me`、ログイン画面、オンボーディング（表示名）。
3. **M2 子ども**：スキーマ &amp; マイグレーション、`/children` 一式、学年マスタと自動進級、共有コード2種、取り込み・オーナー移譲・リンク解除、アーカイブ／復元・削除、一覧画面（状態バッジは M3 で本実装）。
4. **M3 アセスメント**：下書き作成・破棄・自動保存・complete 検証、1ビュー入力画面、状態判定。
5. **M4 レポート**：マスタ移植、`RuleBasedReportGenerator` とスナップショットテスト、`complete` での生成、保護者向けレポート画面（初回/比較）、印刷CSS。
6. **M5 ハブ**：子どもページ（育ちマップ・戦略・タイムライン）、完了済みアセスメントの再編集と再生成、4・5種目目の開放フロー。
7. **M6 仕上げ**：エラー表示・空状態・スマホ幅・アクセシビリティ・パフォーマンス、README。

---

## 13. やること／やらないこと

**やる**

- 小さな PR（1 マイルストーン内でも機能単位で分割）。PR 説明に「どの画面・どのルート・どのテスト」を書く。
- 型は `packages/shared` の zod スキーマから `z.infer` で導出。手書きの重複型を作らない。
- ログに子どもの名前・目標・所見・困りごとを出さない。ID のみ。
- 日本語 UI。エラーメッセージも日本語で、コーチが次に何をすればいいか分かる文にする。

**やらない**

- 仕様（§2）・マスタ文言（§6）・画面デザインの独断変更。
- Supabase の service role key・管理 API の使用。ユーザー管理機能の実装。
- 完了アセスメントの削除 API、レポートの版管理（再生成は同じ行を上書き）。
- 引き継ぎシート（PDF）と「保護者に共有した」フラグ、「SVへ引き継ぐ」チェック。モックには画面があるが実装しない（§2.3 / §2.5）。
- 共有コードの失効・再発行（§2.2）。
- 生年月日・生年月・年齢の保持。年齢は学年からの参考表示だけ（§2.4）。
- 保護者向けのログイン・画面。レポートはコーチが印刷・共有する。
- サーバー側 PDF 生成、メール送信、通知、LLM 呼び出し（初期リリース）。
- Tailwind、状態管理ライブラリ（Redux 等）、チャートライブラリ、ORM 以外の DB アクセス。
- `reference/` 配下の編集。

---

## 14. 未決事項・将来の検討

**確認済み**

- **JWT 署名鍵**：ローカル Supabase（`http://127.0.0.1:15421`）で非対称鍵が有効。`/auth/v1/.well-known/jwks.json` が ES256 の鍵を返すことを確認済み（2026-09-12）。
- **Google OAuth のリダイレクト設定**：ローカルは設定済み。

**本番環境で確認が必要なこと（ローカル実装が終わってから）**

1. 本番 Supabase プロジェクトでも JWT Signing Keys（非対称鍵）が有効か。
2. 本番の Redirect URLs に本ツールのオリジンが入っているか。

**将来やるかもしれないこと（初期リリースでは実装しない）**

- **SV引き継ぎ**。判断に迷うケースをスーパーバイザーへ回す導線。フラグだけでは運用されないため、メール／Slack 通知とセットで設計する（§2.3）。
- レポート生成の LLM 版（§7）。

---

## 15. 実装上の決定事項

この節は、実装時に見落としやすい補足の正とする。別のエージェント向け指示ファイルへ分散させず、この `AGENTS.md` で一元管理する。

### 15.1 UI

- 共通ヘッダー、状態バッジ、共有コード表示、確認ダイアログ、通知は `apps/web/src/components` の共通部品を使う。
- 認証後の画面は `App.tsx` の `AuthenticatedLayout` の下に置く。`/me` はここで1回だけ取得し `MeContext` で配る。画面ごとに取り直さない。読み込み中は `PageSkeleton` を出し、ヘッダーが消えないようにする。
- 画面の切り替えでスクロール位置を先頭に戻す（`ScrollToTop`）。ページ内ジャンプは `pathname` が変わらないので対象外。
- 操作の結果は `ToastProvider` の通知で伝える。通知はレイアウトに置くため、`showToast` してから `navigate` すれば遷移先でも残る。取り消せる操作にはアクションを1つ添える。
- `ConfirmDialog` の `tone` は、取り消せない操作が `danger`（初期フォーカスはキャンセル）、確認だけの操作が `primary`（初期フォーカスは確定）。判断材料は `detail`、3つ目の選択肢は `secondary` に渡す。
- 未保存の入力がある画面は `UnsavedChangesContext` にガードを登録する。ヘッダーのリンクは `GuardedLink` を通し、「保存して移動／保存せずに移動／入力に戻る」を選ばせる。「保存せずに移動」を選んだときは離脱時の自動送信もしない（`discard`）。
- 子ども一覧は「初回アセスメント未実施」「まずやること」「次の予定まで余裕あり」に分け、下書きがある場合は新規作成ではなく既存下書きへの導線を出す。カードのクリックは常に子どもページへ行き、入力中の回があるときだけ「入力を続ける」ボタンをカードに添えてその回へ直接飛ばす。8名以上で名前のしぼり込みを出す。
- 子ども登録は名前・敬称・性別・学年・入会月だけにし、完了画面や共有コード表示を挟まず一覧へ戻す。「続けて登録」は遷移後の通知から選べる。アセスメント未作成の子どもは一覧最上段の専用セクションにまとめる。
- 性別（男の子／女の子／選ばない）と敬称（くん／ちゃん／さん）は連動させない。どちらも独立して選ばせる。敬称の「なし」は廃止済みで、旧値がある場合は「さん」へ寄せる。
- 目標は「ご家族・本人の目標」セクション1か所で入力する。できるようになりたいこと（最大4）を選ぶと、空いている COPM 行へ「〜たい」を言い切りに直した仮の文言を入れる。COPM は目標文言・メモ・遂行度・満足度・親御さんの重要度（1〜10）を回ごとに保存する。採点欄のラベルと並びは `COPM_FIELDS` から出し、画面側に重複定義しない。1件の目標は「目標文言・メモ」を上段、「採点3つと削除」を下段に置く（横3列だと採点欄がはみ出すため。2026-09-28）。前回の採点は項目名の下に別行で出す。初回だけ「入会アンケートから取り込む」を表示し、目標セルをタブ・改行で分割して最大4件まで COPM 行へ入れる。専用の保存ボタンは置かず自動保存する。
- 到達レベルは「未実施」「実施不可」を独立したボタンにし、その下に Lv1〜種目ごとの上限（現在はすべて30）の課題リストを置く。未入力とは別物で、未入力が残っているとレポートを作れない。
- Lvは番号だけでは選べず課題文を読んで決めるため、番号グリッドやプルダウンは使わない（2026-09-28）。リストは帯ごとに見出しで区切り、高さは選択行の上下3段ぶん（7行）に固定してリスト内をスクロールさせる。開いた時点で選択済みのLv、無ければ前回Lvを中央に据え、どちらも無ければ先頭から表示する。全件を一度に広げる表示は置かない。
- 「見えた動作」は種目ごとの選択肢チップと自由記入欄の2段にする。自由記入には選択肢に当てはまらない動きだけを書いてもらう。
- 取り組みの発達（4軸×5段階のセレクト）と環境調整（4グループ×5項目のチェック）は任意入力とし、レポート作成の必須条件にしない。
- 一覧カードの状態バッジは名前・学年と同じ行に置かない。日本語の学年表記と並べると300px幅のカードで重なるため、独立した行にする。次回予定のバッジは年を省く（例「次回 12月12日 予定」）。
- アセスメント画面は縦に長いと負担に見えるため、design-mock-v2 の密度に寄せる（2026-09-28）。本文幅は最大1080px（入力欄 約870px）、見出しと補足は1行、部品の高さは PC で 32〜40px に詰める。タッチ端末（`pointer: coarse`）では 44px に戻す。スタイルは `page.module.css` 末尾の `.assessmentPage` 配下にまとめ、他画面の共通クラスには波及させない。
- アセスメントは1ビューを維持し、ボタン・チェックは800ms、文字入力は1500msのデバウンスで自動保存する。保存中に変更された場合は古いレスポンスでフォームを戻さず、最新版を続けて保存する。
- レーダーは全軸を 0〜30 の等間隔（10刻みのリングと数値）で描く。モックの指数スケール（1.55）は使わない。Lvの差がそのまま長さの差になるようにし、未実施・実施不可は中心（0）に寄せ、未開放の種目は軸ラベルの下に「半年目以降」を出す。レポート版は加えて軸ラベルの下に今回のLv（または「未実施」「実施不可」）を出す（下記）。
- 入力は「その場で観察して記入」と「保護者と確認して記入」の2エリアにゆるく分ける。運動観察中に保護者へ聞くこともあるため、破線と淡い地色だけにとどめ、操作やナビは分けない。
- 入力画面の見出しには連番を振る（2026-09-28）。観察エリアの見出しは「1.アセスメント」とし、以降「2.取り組みの発達」「3.お子さまのお困りごと」「4.ご家族・本人の目標」「5.ご家庭のお困り度」「6.コーチ所見メモ」。基本情報・各種目・「保護者と確認して記入」には番号を振らない。
- 事前アンケートの取り込みは「保護者と確認して記入」エリアの頭に1つだけ置く。取り込み先はお困りごと・目標・ご家庭のお困り度で、回答が無かった項目には触らず、コーチの手入力を消さない。
- 3か月の運動計画（テンプレート選択）は廃止済み。コーチ所見メモは内部用として残す。
- アセスメント下部バーの不足項目は該当セクションへのリンクにする。4・5種目目の開放操作は、子どもが未開放かつ下書きのアセスメント画面だけに置く。下書き中に閉じた場合は `sacc` / `inhi` の入力も落とす。
- レポートは `.sheet` 4枚で構成し（現在地と強み／お困りごととその理由／6か月ロードマップ／これから一緒に見ていくこと）、コーチ向けの所見・見えた動作・運動計画は出力しない。レーダーは1枚目の主役として大きく置き、「これから加わる種目」はレーダーの「半年目以降」と ※ 注記だけで伝え、育ちのピラミッドは段ごとに幅を変え、6か月ロードマップは4本を色分けして矢印でつなぐ。未開放かつ次回予定日が入会6か月後以降なら、4枚目のタイムラインに4・5種目目の追加目安を表示する。
- レポート1枚目のレーダーは「育ちマップ」の枠内で中央に大きく置き（design-mock-v2 準拠）、各軸の外にアイコン・力の名前（`clinicalName`。例「姿勢制御/動的バランス」。図が小さくならないよう「/」の後ろで2行に折る）・今回のLv（比較時は ▲▼ の差分つき）をレーダー内に描き、種目ごとの一覧表は1枚目に出さない。未実施・実施不可・未開放の軸はアイコンを破線にしてラベルごと薄く描き、頂点を白抜きにする。凡例（前回／今回）は前回と重ねる比較のときだけ出す。説明文はレーダーの下に回し、「いまどの段にいるか」を太字で強調する。直下に「今の到達 N /M（実施したn種目の合計）」を出し、分母は **実際に測れた種目の上限の合計だけ** にする（未実施・実施不可・未開放は含めない。2026-09-28）。
- レポートの番号つき見出しは、そのページに2つ以上あるときだけ連番を振る（「1」だけだと続きがあるように見えるため）。
- レポートのルール未確定箇所は `ReportContent.tuning` にサーバーが載せ、Web は `TuningTag` で描く。決定後に `TUNING_NOTES` から外す。
- モーションは `global.css` の `--dur-fast` / `--dur` / `--ease` を使い、`prefers-reduced-motion: reduce` で遷移とスムーススクロールを止める。

### 15.2 API とデータ

- API のリクエスト・レスポンスは `packages/shared/src/schema` の zod スキーマで API と Web の両側から検証する。
- 目標の正は各アセスメントの `data.copm`。`children` と `AssessmentData` に別の `goals` 保存欄を作らない。子ども詳細レスポンスの完了アセスメント summary にだけ、`copm[].text` から導出した表示用 `goals` を返す。下書き summary の `goals` は空にする。
- 子ども詳細の目標は直接編集しない。目標の変更はアセスメント画面の COPM で行い、完了後に子ども詳細へ反映する。
- 困りごとの各項目は `domain` を持ち、レポートの背景ドメイン照合に使う。就学／未就学の統合が決まるまでは文言を据え置き、未就学セットの紐づけは `tuning` に出す。
- 子ども一覧が読むアセスメントは「入力中の回」と「直近の完了回」だけに絞り、過去の全記録やアーカイブ済みの記録を読まない。一覧の並び順は 状態 → 期限超過が大きい順 → 名前。`latestAssessment.id` を返す。
- レポート応答には本文とは別に `childId` と `assessmentId` を載せ、レポート画面から子どもページへ戻るために使う。
- 409 は「他コーチの更新」「アーカイブ中」「後続の回あり」で共通。Web は文言ではなく `error.code` で判定する。401 は `apiRequest` が拾ってサインアウトし、中断画面は `sessionStorage` に記録して再ログイン後に戻す。
- 存在する子ども・アセスメントに membership がない場合は403、ID自体が存在しない場合は404を返す。
- 子ども一覧と子ども詳細では、アセスメント・レポートを1件ずつ取得せず一括取得する。
- 入会は **月単位（`joined_month` = `YYYY-MM`）** で持つ。サービス側で入会日を記録していないため（2026-09-28 変更）。入力は年・月の2つのセレクト（`MonthSelect`）で、`<input type="month">` は PC 版 Safari・Firefox で文字入力になるため使わない。「入会から何か月目」は入会月を1か月目として `monthOrdinalSince` で数え、日付計算が要る箇所は `firstDayOfMonth` でその月の1日に寄せる。`ReportContent.header.joinedMonth` は必須。
- 外部キー、列の値域、子どもごとの単一owner・単一下書きはD1制約でも保証する。サービス層の事前確認は分かりやすいエラー表示のために残す。
- アセスメント更新は内部の `revision` と `mutation_id` でCASを行う。`updatedAt` はクライアント向けの競合検知契約として維持する。
- 完了済みアセスメントの自動保存では、完了用検証・レポート再生成・アセスメント更新を同じD1 batchで行う。`reports.assessment_revision` はアセスメントのrevisionと一致させる。
- 子どもの完全削除はオーナーかつ最初のレポート作成前だけ許可する。D1 batch 内でレポートのないアセスメントを先に削除し、子ども削除を続ける。競合時は外部キーで batch 全体をロールバックし、`child_coaches` は `ON DELETE CASCADE` で削除する。
- 共有先で開いている間に子どもが完全削除され、子ども・アセスメントAPIが `not_found` を返した場合、Webは端末下書きを破棄して担当一覧へ戻す。
- Drizzle のクライアントは `apps/api/src/db/client.ts` の `dbFor` だけを使う。サービスごとに `drizzle()` を作らない。
- `children` 行から学年を読むときは `apps/api/src/services/child-row.ts` の `gradeOf` を通す。
- 「その回で記録する種目」は `activeExerciseKeys(unlockExt)`、「4・5種目目を閉じたときの入力整理」は `withoutExtExerciseInput(data, unlockExt)` を使い、API と Web で共有する。
- `AssessmentServiceError` はコードに対応するHTTPステータスを自分で持つ。WorkersのBinding型は `wrangler types` で生成し、手書きしない。
- 内部エラーは構造化JSONで記録し、ログに入力本文や子どもの名前などの個人情報を含めない。
- 大量データ生成は `APP_ENV` が `local` / `staging` かつ `NON_PRODUCTION_TOOLS_ENABLED=true` のときだけ有効にする。本番では開発用APIを404にし、WebはAPIの機能情報を取得できたときだけ操作パネルを描画する。
- 非本番シードは子ども・担当紐づき・アセスメント・レポートを全削除する一方、実ログイン由来のコーチ行と表示名を残す。`seed-coach-*@example.invalid` の背景コーチ15名だけを作り直す。`prev_assessment_id` は `RESTRICT` なので、先に `NULL` にしてから回を消す。
- 非本番リセット（`pnpm --filter @papamo/api db:reset:local` / `db:reset:staging`）はコーチ行も含めて本リポジトリのD1全テーブルを空にし、マイグレーション直後の状態に戻す。対象は `local` / `staging` だけを受け付け、本番D1へ向かう引数は組み立てない。実行前にD1名を表示して y/N で確認し、stagingは `--confirm papamo-user-assessment-staging` も必須とする。確認のない非対話実行は中止する。
- 開発用の一括削除（`DELETE /dev-tools/children`）は担当一覧を空にする操作。自分がオーナーの子どもはアーカイブ中も含めてアセスメント・レポートごと消し、他コーチがオーナーの子どもは自分の担当紐づきだけを消す。`prev_assessment_id` は `RESTRICT` なので、先に参照を `NULL` にしてから回をまとめて消す。
- コーチID管理は lesson-admin の責務。画面の文言でも「コーチ管理サイト」ではなく「メニュー構築サイト」と書く。
- staging でもアプリ内の許可リストは持たず、lesson-admin と共用する Supabase Auth のユーザーを受け入れる。service role、Admin Auth API、コーチなりすましは導入しない。
- staging の公開先は `user-assessment-staging.heyasupo-lab.com`。`papamo-user-assessment-staging` Worker と APAC 配置の専用D1を使い、lesson-admin の staging Supabase を共用する。デプロイはGit連携せず `pnpm run deploy:staging` で手動実行し、D1マイグレーションを先に適用する。
- 共有・オーナー移譲の確認には2つの実Googleテストアカウントを別ブラウザプロファイルで使う。背景コーチはログイン用途に使わない。
- サンプル10名の内訳は長期6（完了6回）、短期2（完了1〜2回）、新規2（空または下書き）で固定する。Webからの生成リクエストは最大3並列とし、途中失敗した分を隠さない。

### 15.3 テスト

- 承認モックの6人分の子どもとアセスメントは `packages/shared/src/fixtures/children.ts` を使う。
- Web の画面テストは `apps/web/src/test-utils.tsx` の `renderWithProviders` を使い、本番と同じ順でプロバイダを重ねる。
- API 結合テストでは `createAuthMiddleware` にテスト鍵の検証関数を注入し、本番の JWKS 検証は差し替えない。
- 変更後は `pnpm -r lint && pnpm -r typecheck && pnpm -r test && pnpm -r build` を実行する。
- 公式リリース前にマイグレーション履歴を再構築した場合は、空DBから最終スキーマ・インデックス・トリガーを構築できることをテストする。公式リリース後のDB変更は、既存データを保持する移行テストも追加する。
- D1マイグレーションはルートの `db:migrate:local` / `db:migrate:staging` / `db:migrate:production` を使い、リモート適用前に `wrangler.toml` の対象D1 IDを確認する。
