ALTER TABLE `reports` ADD `assessment_input` text;--> statement-breakpoint
-- これまでのレポートは自動保存のたびに同じ版で作り直していたため、版が一致する行はいまの入力がそのままレポートの入力になる。
UPDATE `reports` SET `assessment_input` = (
	SELECT json_object(
		'assessedOn', `assessments`.`assessed_on`,
		'unlockExt', json(CASE WHEN `assessments`.`unlock_ext` THEN 'true' ELSE 'false' END),
		'data', json(`assessments`.`data`)
	)
	FROM `assessments`
	WHERE `assessments`.`id` = `reports`.`assessment_id`
		AND `assessments`.`revision` = `reports`.`assessment_revision`
);
