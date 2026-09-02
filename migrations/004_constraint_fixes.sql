-- ============================================================
-- CyberMilo — migration 004: constraint corrections
--
-- The original attendance CHECK only allowed present/absent/late, so
-- "excused" and "half_day" — which the UI offers — were rejected by the
-- database. Widen it, and add the indexes the new list endpoints sort on.
-- Idempotent: safe to re-run.
-- ============================================================

SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS cm_004_fix_attendance_check;
DELIMITER //
CREATE PROCEDURE cm_004_fix_attendance_check()
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'attendance'
      AND CONSTRAINT_NAME = 'chk_attendance_status'
  ) THEN
    ALTER TABLE attendance DROP CHECK chk_attendance_status;
  END IF;

  ALTER TABLE attendance
    ADD CONSTRAINT chk_attendance_status
    CHECK (status IN ('present', 'absent', 'late', 'excused', 'half_day'));
END //
DELIMITER ;

CALL cm_004_fix_attendance_check();
DROP PROCEDURE IF EXISTS cm_004_fix_attendance_check;

-- ------------------------------------------------------------
-- Indexes backing the new sortable list endpoints
-- ------------------------------------------------------------
DROP PROCEDURE IF EXISTS cm_004_add_index;
DELIMITER //
CREATE PROCEDURE cm_004_add_index(
  IN p_table VARCHAR(64), IN p_index VARCHAR(64), IN p_columns TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_index
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD INDEX `', p_index, '` (', p_columns, ')');
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

CALL cm_004_add_index('students',     'idx_students_status',        '`institution_id`, `status`');
CALL cm_004_add_index('students',     'idx_students_class',         '`institution_id`, `class_name`, `section`');
CALL cm_004_add_index('students',     'idx_students_admission_no',  '`institution_id`, `admission_no`');
CALL cm_004_add_index('fee_payments', 'idx_fee_payments_status',    '`institution_id`, `status`');
CALL cm_004_add_index('fee_payments', 'idx_fee_payments_due',       '`institution_id`, `due_date`');
CALL cm_004_add_index('exams',        'idx_exams_status',           '`institution_id`, `status`');
CALL cm_004_add_index('exam_results', 'uq_exam_result_student',     '`exam_id`, `student_id`');
CALL cm_004_add_index('teachers',     'idx_teachers_status',        '`institution_id`, `status`');

DROP PROCEDURE IF EXISTS cm_004_add_index;
