-- ============================================================
-- CyberMilo — migration 003: authentication hardening
-- Adds forced password rotation, brute-force lockout and
-- database-backed password reset tokens.
-- Idempotent: safe to re-run.
-- ============================================================

SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS cm_add_column_003;
DELIMITER //
CREATE PROCEDURE cm_add_column_003(
  IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

CALL cm_add_column_003('users', 'must_change_password',   'TINYINT(1) NOT NULL DEFAULT 0');
CALL cm_add_column_003('users', 'failed_login_attempts',  'INT NOT NULL DEFAULT 0');
CALL cm_add_column_003('users', 'locked_until',           'TIMESTAMP NULL');
CALL cm_add_column_003('users', 'password_changed_at',    'TIMESTAMP NULL');

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         CHAR(36)     NOT NULL DEFAULT (UUID()),
  user_id    CHAR(36)     NOT NULL,
  token_hash CHAR(64)     NOT NULL,
  expires_at TIMESTAMP    NOT NULL,
  used_at    TIMESTAMP    NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reset_token_hash (token_hash),
  KEY idx_reset_tokens_user (user_id),
  CONSTRAINT fk_reset_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS cm_add_column_003;
