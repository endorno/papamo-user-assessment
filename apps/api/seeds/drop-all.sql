-- 非本番環境専用。マイグレーション履歴（d1_migrations）ごと全テーブルを消す。
-- 適用済みマイグレーションを書き換えたときは行を消すだけでは列が古いまま残るため、DBを空にしてから適用し直す。
-- テーブルを追加したらここにも足す（seeds.test.ts が消し残しを検出する）。
-- prev_assessment_id の自己参照（RESTRICT）で DROP の暗黙 DELETE が失敗しないよう、外部キー検査をコミット時まで遅らせる。
-- UPDATE で参照を切る方法と違い、テーブルが無い状態で再実行しても失敗しない。
PRAGMA defer_foreign_keys = on;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS assessments;
DROP TABLE IF EXISTS child_coaches;
DROP TABLE IF EXISTS children;
DROP TABLE IF EXISTS coaches;
DROP TABLE IF EXISTS d1_migrations;
