-- ご家庭のお困り度（ppi・ppiNote）とコーチ所見メモ（memo）を廃止した（2026-10-21）。アセスメントの入力は知らない項目を受け付けないため、保存済みの値も消す。
-- レポートの版（assessment_revision・updated_at）は変えない（Drive に保存したPDFを作り直さないため。レポートの紙面は次に「レポートを更新」したときに新しくなる）。
UPDATE `assessments` SET `data` = json_remove(`data`, '$.ppi', '$.ppiNote', '$.memo')
WHERE json_type(`data`, '$.ppi') IS NOT NULL OR json_type(`data`, '$.ppiNote') IS NOT NULL OR json_type(`data`, '$.memo') IS NOT NULL;--> statement-breakpoint
UPDATE `reports` SET `assessment_input` = json_remove(`assessment_input`, '$.data.ppi', '$.data.ppiNote', '$.data.memo')
WHERE json_type(`assessment_input`, '$.data.ppi') IS NOT NULL OR json_type(`assessment_input`, '$.data.ppiNote') IS NOT NULL OR json_type(`assessment_input`, '$.data.memo') IS NOT NULL;--> statement-breakpoint
UPDATE `reports` SET `content` = json_remove(`content`, '$.ppi', '$.coach.memo')
WHERE json_type(`content`, '$.ppi') IS NOT NULL OR json_type(`content`, '$.coach.memo') IS NOT NULL;
