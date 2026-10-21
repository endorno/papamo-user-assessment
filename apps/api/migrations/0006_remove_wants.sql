-- できるようになりたいことの選択（wants）を保存しなくなった（2026-10-21）。候補は目標（COPM）の文言を入れる手助けだけにし、ピラミッドには目標欄だけを使う。
-- アセスメントの入力は知らない項目を受け付けないため、保存済みの値も消す。レポートの版（assessment_revision・updated_at）は変えない（0005 と同じ理由）。
UPDATE `assessments` SET `data` = json_remove(`data`, '$.wants')
WHERE json_type(`data`, '$.wants') IS NOT NULL;--> statement-breakpoint
UPDATE `reports` SET `assessment_input` = json_remove(`assessment_input`, '$.data.wants')
WHERE json_type(`assessment_input`, '$.data.wants') IS NOT NULL;--> statement-breakpoint
UPDATE `reports` SET `content` = json_remove(`content`, '$.wants', '$.coach.wantPackages')
WHERE json_type(`content`, '$.wants') IS NOT NULL OR json_type(`content`, '$.coach.wantPackages') IS NOT NULL;
