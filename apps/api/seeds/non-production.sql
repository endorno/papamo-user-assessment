-- 非本番環境専用。子ども関連データを全削除し、背景コーチを作り直す。
DELETE FROM reports;
-- prev_assessment_id は RESTRICT。回どうしの参照を先に切ってからまとめて消す。
UPDATE assessments SET prev_assessment_id = NULL;
DELETE FROM assessments;
DELETE FROM child_coaches;
DELETE FROM children;
DELETE FROM coaches WHERE email LIKE 'seed-coach-%@example.invalid';

INSERT INTO coaches (id, email, display_name, created_at, updated_at) VALUES
  ('seed-coach-01', 'seed-coach-01@example.invalid', 'テスト01', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('seed-coach-02', 'seed-coach-02@example.invalid', 'テスト02', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('seed-coach-03', 'seed-coach-03@example.invalid', 'テスト03', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('seed-coach-04', 'seed-coach-04@example.invalid', 'テスト04', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('seed-coach-05', 'seed-coach-05@example.invalid', 'テスト05', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('seed-coach-06', 'seed-coach-06@example.invalid', 'テスト06', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('seed-coach-07', 'seed-coach-07@example.invalid', 'テスト07', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('seed-coach-08', 'seed-coach-08@example.invalid', 'テスト08', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('seed-coach-09', 'seed-coach-09@example.invalid', 'テスト09', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('seed-coach-10', 'seed-coach-10@example.invalid', 'テスト10', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('seed-coach-11', 'seed-coach-11@example.invalid', 'テスト11', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('seed-coach-12', 'seed-coach-12@example.invalid', 'テスト12', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('seed-coach-13', 'seed-coach-13@example.invalid', 'テスト13', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('seed-coach-14', 'seed-coach-14@example.invalid', 'テスト14', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('seed-coach-15', 'seed-coach-15@example.invalid', 'テスト15', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
