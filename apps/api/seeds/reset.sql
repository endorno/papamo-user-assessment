-- 非本番環境専用。マイグレーション直後の状態に戻す。
-- スキーマと d1_migrations は残すため、実行後に再マイグレーションは不要。
-- コーチ行も消すので、次のログインは新規コーチ（表示名未登録）として始まる。
DELETE FROM reports;
-- prev_assessment_id は RESTRICT。回どうしの参照を先に切ってからまとめて消す。
UPDATE assessments SET prev_assessment_id = NULL;
DELETE FROM assessments;
DELETE FROM child_coaches;
DELETE FROM children;
DELETE FROM coaches;
