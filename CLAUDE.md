# 実装上の決定事項

プロダクト仕様・マスタ文言・承認済み UI の正は `AGENTS.md` と `reference/design-mock.html`。このファイルには、実装時に見落としやすい補足だけを記録する。

## UI

- 共通ヘッダー、状態バッジ、共有コード表示、確認ダイアログは `apps/web/src/components` の共通部品を使う。
- 子ども一覧は「まずやること」と「次の予定まで余裕あり」に分け、下書きがある場合は新規作成ではなく既存下書きへの導線を出す。
- アセスメントは1ビューを維持し、変更後800msで自動保存する。保存中にさらに変更された場合は古いレスポンスでフォームを戻さず、最新版を続けて保存する。
- レポートは `.sheet` 3枚で構成し、コーチ向けの所見・つまずきは出力しない。未開放かつ次回予定日が入会6か月後以降なら、3枚目に4・5種目目の追加目安を表示する。

## API とデータ

- API のリクエスト・レスポンスは `packages/shared/src/schema` の zod スキーマで API と Web の両側から検証する。
- 存在する子ども・アセスメントに membership がない場合は 403、ID 自体が存在しない場合は 404 を返す。
- 子ども一覧と子ども詳細では、アセスメント・レポートを1件ずつ取得せず一括取得する。
- `ReportContent.header.joinedOn` は既存レポートとの互換性のため optional。新しく生成するレポートには必ず入会日を含める。
- 外部キー、列の値域、子どもごとの単一owner・単一下書きはD1制約でも保証する。サービス層の事前確認は分かりやすいエラー表示のために残す。
- アセスメント更新は内部の `revision` と `mutation_id` でCASを行う。`updatedAt` はクライアント向けの競合検知契約として維持する。
- 完了済みアセスメントの自動保存では、完了用検証・レポート再生成・アセスメント更新を同じD1 batchで行う。`reports.assessment_revision` は必ずアセスメントのrevisionと一致させる。
- 子どもの削除可否は事前SELECTではなく、アセスメント外部キーの `ON DELETE RESTRICT` で競合を含めて保証する。紐づきは `ON DELETE CASCADE` で削除する。
- WorkersのBinding型は `apps/api/worker-configuration.d.ts` を `wrangler types` で生成し、手書きしない。
- 内部エラーは構造化JSONで記録する。ログに入力本文や子どもの名前などの個人情報を含めない。

## テスト

- 承認モックの6人分の子どもとアセスメントは `packages/shared/src/fixtures/children.ts` を使う。
- API 結合テストでは `createAuthMiddleware` にテスト鍵の検証関数を注入する。本番の JWKS 検証は差し替えない。
- 変更後は `pnpm -r lint && pnpm -r typecheck && pnpm -r test && pnpm -r build` を実行する。
- DB変更時は制約そのもののテストと、既存データを保持したマイグレーションテストも追加する。
