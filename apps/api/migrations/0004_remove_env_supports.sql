-- 環境調整（envSupports）を廃止した（2026-10-14）。アセスメントの入力は知らない項目を受け付けないため、保存済みの値も消す。
-- レポートの版（assessment_revision・updated_at）は変えない（中身は同じで、Drive に保存したPDFも作り直さなくてよいため）。
UPDATE `assessments` SET `data` = json_remove(`data`, '$.envSupports')
WHERE json_type(`data`, '$.envSupports') IS NOT NULL;--> statement-breakpoint
UPDATE `reports` SET `assessment_input` = json_remove(`assessment_input`, '$.data.envSupports')
WHERE json_type(`assessment_input`, '$.data.envSupports') IS NOT NULL;--> statement-breakpoint
UPDATE `reports` SET `content` = json_remove(`content`, '$.envSupports')
WHERE json_type(`content`, '$.envSupports') IS NOT NULL;
