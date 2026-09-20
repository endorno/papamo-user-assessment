# オンライン運動療育 サービス へやすぽ コーチ向けアセスメント・レポートツール

## 0. まず読むもの（優先順）

1. このファイル全体
2. `reference/design-mock.html` — PdM**承認済みのUI/UX**。画面構成・文言・配色・挙動の参考にする。実際に実装する機能は実装のしやすさ、仕様のシンプルさを優先し、最初から複雑にしない。
3. `reference/papamo-lesson-admin/` — **既存のコーチ向けサイト**。レッスン内容の管理・構築を行う。本ツールの認証はこのレッスン管理ツールの認証と共通化する。メインのコーチ管理はレッスン管理ツール側で行い、このツールでログイン・ログアウトのみ行う。

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
| Lv                 | 各種目の到達レベル。**0〜20 の整数、必須**。「未実施」「測れなかった」は存在しない（Lv0＝導入前）                                             |
| 帯 (band)           | Lv をまとめた段階（例：17cm一巡 / 8.5cm一巡）。マスタで定義                                                              |
| つまずき (errs)        | 種目観察中に見えた典型エラー。種目ごとの固定リストから複数選択                                                                    |
| 困りごと (troubles)    | 保護者ヒアリングで確認する日常の困りごと。年齢帯（`sch` 就学 / `pre` 未就学）別のカテゴリ×3項目                                           |
| PPI                | ご家庭の負担度。5設問 × 0〜5                                                                                  |
| 計画 (plan)          | 3か月の運動計画。テンプレートから1つ選ぶ                                                                              |
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
- 子どもレコードの **削除はオーナーのみ、かつアセスメントが1件もない場合だけ** 許可する（登録し間違えたときの取り消し）。
- 退会した子どもは **アーカイブ** する。アーカイブすると全コーチの一覧から消えるが、データは残り **いつでも復元できる**。アーカイブ／復元はオーナーのみ。アーカイブ中の子どもは読み取り専用（アセスメントの新規作成・編集はできない）。
- 共有コードの失効・再発行はしない。誰がいつ取り込んだかは記録に残るため、運用でカバーする。
- 子どもの名前は **下の名前のみを想定**。姓・住所・写真などは扱わない。

### 2.3 アセスメント

- 1つの子どもに **下書き（draft）は同時に1件まで**。
- 入力画面は **1ビュー**（モック参照）。コーチが保護者にヒアリングしながらその場で入力するため、順不同で編集でき、**変更のたびに自動保存**。
- 全種目（3 または 5）の Lv が確定するまで **レポートを作れない**。当日測れない種目があれば下書きのまま閉じ、後日続きから入力する。
- 4・5種目目：表示上の目安は入会6か月以降だが、**有効化はコーチ判断**。新規アセスメント作成時のチェックで開放し、開放後は子ども単位で永続（以降のアセスメントは自動的に5種目）。未開放の間は入力不可・アルゴリズム対象外だが、**レポートには「これから加わる種目」として必ず表示**する。
- ご家庭の負担度（PPI）は **5設問すべてに回答が必要**。0 は「ほぼ感じない」という回答であり、未回答とは区別する（レポートを作るには全問の回答が要る）。
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
│   └── papamo-lesson-admin/     # 既存コーチ向けサイト（別リポジトリへの symlink）
├── packages/
│   └── shared/                  # 依存ゼロ（zod のみ）。API/web 両方から import
│       └── src/
│           ├── master/          # 種目ラダー・困りごと・PPI・計画テンプレ・学年（§6）
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
pnpm --filter api db:migrate:local # wrangler d1 migrations apply --local
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
- 動作環境：Node 24 / pnpm 10.33 / wrangler 4 で確認。`engines.node` は `>=22`。依存のバージョンは初回 install 時に最新安定版で解決し、**lockfile をコミットする**。

---

## 5. データモデル（D1 / Drizzle）

ID は ULID（文字列）。日時は ISO 8601 文字列（UTC）で保存し、表示時に Asia/Tokyo へ変換。日付のみの列（`assessed_on` など）は `YYYY-MM-DD`。

```ts
coaches           id (= supabase sub) PK, email, display_name (null 可 → オンボーディング未完), created_at, updated_at
children          id PK, share_code UNIQUE, owner_share_code UNIQUE, created_by → coaches.id,
                  name, honorific ('kun'|'chan'|'san'),
                  grade_code ('k0'|'k1'|'k2'|'k3'|'e1'..'e6'|'j1'..'j3'), grade_base_year (int, 年度),
                  joined_on ('YYYY-MM-DD'), ext_unlocked (bool, default false), goals (JSON string[]),
                  archived_at (null 可 → アーカイブ済み), created_at, updated_at
child_coaches     child_id, coach_id, role ('owner'|'member'), created_at   PK(child_id, coach_id)
assessments       id PK, child_id → children.id, seq_no (1,2,3...), status ('draft'|'done'), assessed_on,
                  coach_id → coaches.id, unlock_ext (bool), prev_assessment_id (null 可), master_version,
                  data (JSON: AssessmentData), created_at, updated_at, completed_at (null 可)
                  UNIQUE(child_id, seq_no) / 部分制約「child_id ごとに draft は1件」はサービス層で保証
reports           id PK, assessment_id UNIQUE → assessments.id, generator ('rule_v1'...),
                  content (JSON: ReportContent), created_at, updated_at

```

`AssessmentData`（zod で定義、`data` 列に格納）：

```ts
{
  lv: { post?: number, eyeh?: number, hand?: number, sacc?: number, inhi?: number }, // 0..20、未入力は undefined
  errs: Partial<Record<ExerciseKey, string[]>>,
  troubles: string[],            // マスタの困りごと文言（age_group に対応するセットのもの）
  ppi: { time?: number, emo?: number, soc?: number, fut?: number, nav?: number },  // 0..5、未回答は undefined
  ppiNote: string,
  plan: PlanKey | null,
  memo: string,
  goals: string[]                // 完了時に children.goals からコピーされるスナップショット
}

```

zod スキーマは **下書き用（すべて optional）と完了用（全種目の `lv`・PPI 全5設問・`plan` が必須）の2段構え** にする。`PATCH` は下書き用で検証し、`complete` は完了用で検証する。`goals` はクライアントから送らせず、`complete` 時にサーバーが `children.goals` をコピーする。

設計上の注意

- `share_code` / `owner_share_code` は人が口頭・チャットで伝えられる **8文字**（Crockford Base32、`0/O/1/I` を除く、`XXXX-XXXX` 表示）。子ども作成時に2本とも生成し、衝突時は再生成。取り込みAPIは受け取ったコードがどちらの列に一致したかで「参加」か「オーナー移譲」かを判定する（§8.2）。オーナー移譲コードは子どもページのオーナーにだけ表示する。
- **生年月日・生年月・年齢は保存しない**（§2.4）。`grade_code` は登録時の学年、`grade_base_year` はその学年だった **年度**（4/1 始まり）。表示する学年は `gradeAt(child, today)` で算出し、保存値は書き換えない。
  - 年度 `schoolYear(d)` = 月が4以上ならその年、1〜3月なら前年（Asia/Tokyo）。
  - 表示学年の添字 = 登録学年の添字 + (`schoolYear(today)` − `grade_base_year`)。上限（中3）を超えたら「中学卒業以上」で止める。
  - 学年を修正したいときは `grade_code` と `grade_base_year`（＝今の年度）を同時に更新する。
- `age_group`（`sch` / `pre`）は列に持たず、**その時点の学年から算出**する（マスタ `grades.ts`）。困りごとセットの出し分けに使う。
- `archived_at` が入っている子どもは一覧・催促・共有コードの取り込み対象から外れ、書き込み系 API は 409 を返す。復元は `archived_at` を null に戻すだけ。
- `ext_unlocked` は子ども側の永続フラグ。アセスメント完了時に `unlock_ext=true` なら子どもへ伝播し、以後の新規アセスメントは `unlock_ext=true` 固定。
- 完了後の `assessments.data` と `reports.content` も、**次のアセスメントが作られるまでは更新できる**（§2.5）。更新のたびにレポートを再生成して `reports` を上書きする。次のアセスメント（draft を含む）が存在する時点で、以降その回は読み取り専用。
- `assessments.coach_id` は **その回を完了させたコーチ**（レポートの「担当」に出る名前）。下書きを別のコーチが引き継いで完了させた場合は完了時のコーチで上書きする。
- `master_version` にはマスタデータの版（例 `2026-09`）を記録し、後からマスタが変わっても過去データの解釈が追えるようにする。

---

## 6. マスタデータ（`packages/shared/src/master`）

初期リリースでは **TypeScript 定数** として管理する（D1 化は管理UIが必要になってから）。

すべて `reference/design-mock.html` の `<script>` 冒頭にある定数を **そのまま** 移植する（文言を変えない）。

- `exercises.ts` — 5種目の定義。モックの `AX` が正。1種目のフィールドは `k / core / ic / ex（種目名）/ pn（保護者向けの力の名前）/ nm（臨床名）/ grow / build[] / chg3[] / teaser（4・5種目目のみ）/ bands[] / errs[] / lt[20]（ラダー。Lv1〜20 に対応する課題文）`。Lv0 のラベルは定数 `LV0`（`'導入前（Lv1の課題がまだ成立しない）'`）。
- `troubles.ts` — `CATSET`（`sch` / `pre` × カテゴリ5 × 3項目）。**チェックされた困りごとは文言そのものを保存する**（§5）ため、文言変更＝過去データとの突き合わせ不能。変更時は PdM 承認に加えて移行方針が必要。
- `ppi.ts` — 5設問（`time / emo / soc / fut / nav`）。**5問すべて回答必須**（§2.3）。
- `grades.ts` — 学年マスタ（モックには無い。新規に定義する）。`k0 未就園 / k1 年少 / k2 年中 / k3 年長 / e1..e6 小学1〜6年生 / j1..j3 中学1〜3年生` を **この順** で並べ、各要素に `name`（表示名）・`ageHint`（一般論の目安年齢。例 `e1` → `'6〜7歳'`）・`ageGroup`（`k*` → `pre`、`e*`・`j*` → `sch`）を持つ。進級は配列の添字で計算する（§5）。
- `plans.ts` — 計画テンプレート（初期は `base` / `select` / `pre` の3種）。`nm / w（期間）/ items[]`。
- `version.ts` — `MASTER_VERSION`。

マスタ文言の変更は PdM 承認事項。エージェントが独断で言い回しを変えない。

---

## 7. レポート生成の API 境界（将来 LLM に差し替える前提）

### 7.1 インターフェース（`packages/shared/src/report`）

```ts
export interface ReportInput {
  child: ChildSnapshot;              // 名前・敬称・学年（実施日時点）・ageHint・ageGroup・目標
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

`levels` に未開放の4・5種目目は含めない。モックのレポート内一覧表は5行すべて出し、未開放行に「半年目以降」と表示する — この行は `upcomingExercises` からフロントが描く。

```ts
{
  kind: 'first' | 'comparison',
  generator: string, masterVersion: string, generatedAt: string,
  header: { childName, honorific, grade, ageHint, seqNo, assessedOn, prevAssessedOn?, coachName },
  levels: { key, lv, prevLv?, delta?, band, ladderLabel }[],        // 未開放種目は含めない
  upcomingExercises: { key, name, parentName, teaser }[],           // 未開放の4・5種目目（開放済みなら空）
  priorities: { key, parentName, lv, grow, build[] }[],             // 優先テーマ（§7.2 の分割ルール）
  strengths: { key, parentName, lv }[],
  changes3m?: string[],                                             // comparison のみ
  troubles: { current: string[], gone?: string[], stayed?: string[], added?: string[] },
  link: { lowestKey, text },                                        // 困りごととの見立てのつながり
  ppi: { current: PPI, previous?: PPI, note: string },
  plan: { key, name, window, items[] } | null,
  outlook: string[],                                                // 3か月後にこう変わるはず
  nextDue: 'YYYY-MM-DD',
  coach: { strategies: { key, lv, band, nextLv, nextLabel, errs[] }[], memo: string }  // 子どもページ用
}

```

### 7.1.1 保護者向けレポートのシート構成（モック `viewReport()` 準拠）

印刷して3枚。フロントはこの順で `.sheet` を並べる。

| シート | 見出し | 載せる `ReportContent` のフィールド |
| --- | --- | --- |
| Page 1 | 初回『◯◯ちゃんの現在地と強み』／比較『◯◯ちゃんの3か月の変化』 | `header` / レーダー（`levels` + 前回値）/ `link.text` の導入文 / 到達レベル一覧表（`levels` + `upcomingExercises`）/ `changes3m`（比較のみ）/ `priorities` / `strengths` / `upcomingExercises`（未開放のときだけ枠で表示） |
| Page 2 | 初回『今のお困りごとと、その理由』／比較『困りごとと、ご家庭の負担の変化』 | `troubles`（初回はカテゴリ別、比較は gone/stayed/added のピル）/ `link` / `ppi` |
| Page 3 | 『これからの3か月』 | `plan` / `priorities[].build` / `outlook` / `nextDue`（ミニタイムライン。未開放かつ次回で半年を超えるなら「🔓 半年目以降、4・5種目目を追加」を添える） |

子どもページの「今期のレッスン戦略」は `coach.strategies` と `plan`、`coach.memo` を使う（レポートには出さない）。

### 7.2 ルールベース実装 `RuleBasedReportGenerator`（id: `rule_v1`）

- `reference/design-mock.html` の `analyze()` / `strategyHTML()` / `deltaTable()` / `viewReport()` 内の組み立てロジックを純粋関数として移植する。**正は design-mock.html**。
- 優先テーマと強みの分割はモックの `analyze()` に従う：測定済み種目を Lv 昇順に並べ、`n = min(3, max(1, 種目数 - 1))` 件を優先テーマ、残りを Lv 降順で強みにする（3種目なら優先2・強み1、5種目なら優先3・強み2）。`link.lowestKey` は最小 Lv の種目。
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
| POST   | `/children`                 | 作成。`{ name, honorific, gradeCode, joinedOn, goals[] }`。`grade_base_year` は作成時の年度、`age_group` は学年から算出。`child_coaches` に owner を追加し、共有コード2本を生成                |
| POST   | `/children/import`          | `{ code }`。`share_code` 一致 → member として参加。`owner_share_code` 一致 → 参加のうえオーナー移譲（旧オーナーは member に降格、`children.created_by` は変更しない）。既に同じ立場で紐づいていれば 409、未知のコードは 404 |
| GET    | `/children/:id`             | ハブ用。子ども + アセスメント一覧（summary）+ 最新完了アセスメントの report.content。自分が owner のときだけ `ownerShareCode` を含める                                                             |
| PATCH  | `/children/:id`             | `{ name?, honorific?, gradeCode?, joinedOn?, goals? }` の更新。`gradeCode` を送ると `grade_base_year` も現在の年度で更新する。`ext_unlocked` は変更不可。**目標の編集はここに集約**（子どもページ・アセスメント画面のどちらから編集しても同じ） |
| DELETE | `/children/:id/membership`  | 自分のリンク解除。role=owner なら 403                                                                                                                               |
| DELETE | `/children/:id`             | 子どもレコードの削除。**owner かつアセスメント0件のときだけ** 許可（それ以外は 409）。登録し間違えたときの取り消し用                                                                                        |
| POST   | `/children/:id/archive`     | アーカイブ（退会）。owner のみ。下書きが残っていても可（下書きごと隠れる）                                                                                                                 |
| POST   | `/children/:id/unarchive`   | 復元。owner のみ                                                                                                                                              |
| POST   | `/children/:id/assessments` | 下書き作成 `{ unlockExt }`。draft 既存なら 409。`prev_assessment_id`/`seq_no`/`troubles`・`plan` の初期値（前回コピー。初回は `ageGroup` から `pre`/`base`）はサーバーが埋める。`ext_unlocked` の子どもは `unlockExt` を true に強制 |
| GET    | `/assessments/:id`          | 単体取得（前回の summary を同梱）                                                                                                                                     |
| PATCH  | `/assessments/:id`          | 自動保存。`{ assessedOn?, unlockExt?, data }` を **全体置換**（部分マージしない）。`ext_unlocked` の子どもは `unlockExt` を true に強制。後続のアセスメントが存在する回は 409                              |
| DELETE | `/assessments/:id`          | 下書きの破棄。`status='draft'` のときだけ許可（done は 409）。誤って作った下書きを消して前の回の編集に戻るための唯一の手段                                                                               |
| POST   | `/assessments/:id/complete` | 検証（全種目 Lv 確定・PPI 全5設問・plan 必須）→ done → レポート生成 → 子どもの `ext_unlocked` 伝播 → `{ report }`。**完了済みの回に対する再実行も可**（レポートを再生成して上書き）。後続のアセスメントが存在する回は 409                        |
| GET    | `/assessments/:id/report`   | レポート取得                                                                                                                                                    |


子どもスコープの全ルートで `child_coaches` **の membership を確認**する（services 層の共通関数 `requireMembership(childId, coachId)`）。アセスメント／レポートのルートは `assessment.child_id` から子どもを引いて同じ確認を通す。アーカイブ済みの子どもは **読み取りのみ許可**（復元と削除を除く書き込みは 409）、オーナー限定の操作は `role='owner'` を併せて確認する。

**同時編集**：1つの子どもに複数のコーチが紐づくため、同じ下書きを2人が同時に開ける。`PATCH /assessments/:id` は全体置換なので後勝ちで消える。リクエストに直前に取得した `updatedAt` を載せ、サーバー側で不一致なら 409 を返す（フロントは「他のコーチが更新しました。読み込み直してください」と表示して再取得）。

### 8.3 一覧の状態判定（`packages/shared/src/domain/status.ts`）

モックの `stateOf()` を移植。優先順：`draft`（入力中 n/m）→ `due`（次回まで14日以内 or 超過）→ `first`（未実施）→ `ok`（次回予定日）。

- 分母 `m` = **種目数（3 または 5）+ 3**（困りごと・負担度・計画）。分子 `n` = Lv が確定した種目数 + 困りごと1件以上 + 負担度が **5問すべて回答済み** + 計画が選択済み。モックの `filledCount` は「どれか1問でも 1 以上」で判定しているが、0 は正当な回答なので回答済みかどうかで数える（§2.3）。
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
| `/`                | 担当の子ども一覧     | 「まずやること」「次の予定まで余裕あり」の2セクション、状態バッジ、Lvチップ。「＋ 新しいお子さまを登録」「コードで取り込む」。末尾に「アーカイブした子ども（N名）」の折りたたみ（復元導線）                         |
| `/children/new`    | 子ども登録        | モーダルでも可。入力は 名前・敬称・**学年**・入会日・目標のみ（年齢は入力させない）。共有コードは登録直後に表示                                                              |
| `/children/:id`    | 子どもページ（ハブ）   | 育ちマップ（レーダー + Lv行 + 差分）、今期のレッスン戦略、困りごと・負担度、タイムライン、記録一覧、「アセスメントを始める／入力を続ける」「最新の保護者向けレポート」、共有コードの表示、目標の編集。オーナーなら「退会（アーカイブ）」、アセスメント0件なら「削除」。取り込んだ子どもなら「一覧から削除」 |
| `/assessments/:id` | アセスメント（1ビュー） | 左ジャンプナビ、0〜20 グリッド、前回Lvの点線枠、ラダー展開、下部固定バー（未決定の種目名 / レポートを作る）。完了済みの回を開いた場合も同じ画面で編集（後続の回があれば読み取り専用）。モック最下部の「SVへ引き継ぐ」チェックは作らない（§2.3） |
| `/reports/:id`     | 保護者向けレポート    | 初回 / 比較の2レイアウト。印刷/PDF                                                                                                   |


### 9.2 実装ルール

- 認証トークンは supabase-js のセッションから毎リクエスト取得して `Authorization` に付ける（`getSession()` はトークンを自動更新する）。更新しても 401 が返る場合のみ `/login` へ。
- lesson-admin とは別オリジンで動くため **セッションは共有されない**。「認証の共通化」＝アカウント基盤（Supabase プロジェクト）が同じという意味で、このツールでも1回ログインが必要。
- 自動保存：フォーム状態は React state に持ち、変更後 800ms デバウンスで `PATCH /assessments/:id`。連続保存中はキャンセルして最新のみ送る。保存状態（保存中／保存済み HH:MM／失敗）を画面に表示。失敗時はリトライボタンを出す（データを捨てない）。409（他コーチの更新）はリトライせず、再読み込みを促す（§8.2）。
- 保存できないまま画面を閉じられても失わないよう、未送信の下書きは `localStorage`（キー：assessment id）にも置き、復帰時に差分があれば復元を提案する。
- ページ離脱時に未保存があれば `beforeunload` で警告。
- 新しいアセスメントを始めるボタンは、**前の回が編集できなくなる**ことを確認ダイアログで伝えてから作成する（§2.5）。
- レーダー・タイムラインは SVG を自前で描く（モックの `radar()` を React 化）。チャートライブラリは入れない。
- 印刷用 CSS は `styles/print.css`。`.sheet` を A4 1ページ相当にし `page-break-after: always`（保護者向けレポートは3枚構成）。
- 文言・順序・色はモックに合わせる。デザイントークンは `:root` 変数をそのまま移植し、フォント（Zen Kaku Gothic New）も同じものを使う。改善案があればコードではなく Issue/PR 説明に書く。
- 学年・年齢の表示は **「小学1年生（6〜7歳）」** の形（年齢は `ageHint` の参考値。§2.4）。学年は表示のたびに今日の年度で算出するので、4/1 を跨げば自動で上がる。
- 目標の編集はアセスメント画面の基本情報からもできるが、保存先は常に子ども（`PATCH /children/:id`）。その回のレポートには完了時点のスナップショットが載る。
- ご家庭の負担度は **未選択で始める**（モックのスライダー初期値0は使わない）。0〜5 のボタンで選ばせ、未回答が残っていれば下部バーに「あと N 問」を出してレポート作成を止める。
- アクセシビリティ：タップ領域 44px 以上、フォーカスリング必須、色だけで意味を伝えない（▲▼ とテキストを併記）。

---

## 10. テスト

- `packages/shared`：ルールエンジン・状態判定・日付計算・**学年の自動進級**（3/31 と 4/1 の境界、上限の中3で止まること）のユニットテスト。**モックの6人分のダミーデータ（`CHILDREN` / `ASSESS`）をフィクスチャ**（`fixtures/children.ts`）にして、レポート出力をスナップショットで固定する。初回・比較・5種目開放済み（c6 の3回目）・下書き途中（c3）が最低限のケース。
- `apps/api`：`@cloudflare/vitest-pool-workers` で D1 マイグレーションを適用した上でルートを結合テスト。認証は JWKS を差し替えられるようにし、テスト用鍵で署名したトークンを使う。必須ケース：membership 無しの 403、オーナーのリンク解除 403、通常コード／オーナー移譲コードでの取り込み、draft 重複 409、Lv 未確定の complete が 400、完了済みの回の再編集 → 再 complete でレポートが上書きされる、後続の回があるときの PATCH が 409、draft の DELETE と done の DELETE が 409、PPI 未回答での complete が 400、ext_unlocked の伝播、アーカイブ済みの子どもが一覧に出ない・書き込みが 409・復元できる、アセスメントがある子どもの DELETE が 409、表示名未登録での 403 `onboarding_required`。
- `apps/web`：主要コンポーネント（Lvグリッド、状態バッジ、レポートの初回/比較切替）を Testing Library で。E2E は初期リリースでは行わない。
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
- D1 マイグレーションはデプロイ前に `wrangler d1 migrations apply <DB> --remote` を手動で実行する（初期は自動化しない。マイグレーションを含む PR の説明に必ず明記）。
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
- **staging 環境**。リリース後、開発物をリリース前に社内で確認して貰う必要が生じたら作成する。
- レポート生成の LLM 版（§7）。
