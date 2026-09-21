CREATE TRIGGER `reports_assessment_consistency_insert`
BEFORE INSERT ON `reports`
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM `assessments`
  WHERE `id` = NEW.`assessment_id`
    AND `status` = 'done'
    AND `revision` = NEW.`assessment_revision`
)
BEGIN
  SELECT RAISE(ABORT, 'report assessment revision mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `reports_assessment_consistency_update`
BEFORE UPDATE OF `assessment_id`, `assessment_revision` ON `reports`
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM `assessments`
  WHERE `id` = NEW.`assessment_id`
    AND `status` = 'done'
    AND `revision` = NEW.`assessment_revision`
)
BEGIN
  SELECT RAISE(ABORT, 'report assessment revision mismatch');
END;
