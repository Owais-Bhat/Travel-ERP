-- ============================================================
-- CyberMilo — EIMS parity migration 001
-- Adds: institution verification, programs, certifications,
--       document vault, admissions depth.
-- Idempotent: safe to re-run (guards via information_schema).
-- Requires MySQL 8.0.13+ / MariaDB 10.2+
-- ============================================================

SET NAMES utf8mb4;

-- ---------- helper: add column only when missing ----------
DROP PROCEDURE IF EXISTS cm_add_column;
DELIMITER //
CREATE PROCEDURE cm_add_column(
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

-- ---------- helper: add index only when missing ----------
DROP PROCEDURE IF EXISTS cm_add_index;
DELIMITER //
CREATE PROCEDURE cm_add_index(
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

-- ============================================================
-- 1. institutions — verification + public profile fields
-- ============================================================
CALL cm_add_column('institutions', 'code',                'VARCHAR(40) NULL');
CALL cm_add_column('institutions', 'verification_status', 'VARCHAR(30) NOT NULL DEFAULT ''pending''');
CALL cm_add_column('institutions', 'verification_notes',  'TEXT NULL');
CALL cm_add_column('institutions', 'verified_at',         'TIMESTAMP NULL');
CALL cm_add_column('institutions', 'verified_by',         'CHAR(36) NULL');
CALL cm_add_column('institutions', 'website',             'VARCHAR(255) NULL');
CALL cm_add_column('institutions', 'city',                'VARCHAR(120) NULL');
CALL cm_add_column('institutions', 'state',               'VARCHAR(120) NULL');
CALL cm_add_column('institutions', 'country',             'VARCHAR(120) NULL');
CALL cm_add_column('institutions', 'postal_code',         'VARCHAR(20) NULL');
CALL cm_add_column('institutions', 'established_year',    'SMALLINT NULL');
CALL cm_add_column('institutions', 'accreditation',       'VARCHAR(255) NULL');
CALL cm_add_column('institutions', 'about',               'TEXT NULL');
CALL cm_add_column('institutions', 'is_published',        'TINYINT(1) NOT NULL DEFAULT 0');
CALL cm_add_index('institutions', 'idx_institutions_verification', '`verification_status`');

-- ============================================================
-- 2. institution_documents — verification evidence
-- ============================================================
CREATE TABLE IF NOT EXISTS institution_documents (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  doc_type       VARCHAR(60)  NOT NULL,
  name           VARCHAR(255) NOT NULL,
  file_url       VARCHAR(500),
  mime_type      VARCHAR(120),
  size_bytes     BIGINT,
  status         VARCHAR(30)  NOT NULL DEFAULT 'pending',
  notes          TEXT,
  uploaded_by    CHAR(36)     NULL,
  reviewed_by    CHAR(36)     NULL,
  reviewed_at    TIMESTAMP    NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_inst_docs_institution (institution_id),
  KEY idx_inst_docs_status (status),
  CONSTRAINT fk_inst_docs_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. programs — degrees / diplomas / certificate tracks
-- ============================================================
CREATE TABLE IF NOT EXISTS programs (
  id              CHAR(36)      NOT NULL DEFAULT (UUID()),
  institution_id  CHAR(36)      NOT NULL,
  name            VARCHAR(255)  NOT NULL,
  code            VARCHAR(60),
  level           VARCHAR(40)   NOT NULL DEFAULT 'certificate',
  department      VARCHAR(150),
  mode            VARCHAR(30)   NOT NULL DEFAULT 'full_time',
  duration_months INT           NOT NULL DEFAULT 12,
  tuition_fee     DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency        VARCHAR(10)   NOT NULL DEFAULT 'INR',
  seats_total     INT           NOT NULL DEFAULT 0,
  seats_filled    INT           NOT NULL DEFAULT 0,
  eligibility     TEXT,
  description     TEXT,
  coordinator_id  CHAR(36)      NULL,
  status          VARCHAR(30)   NOT NULL DEFAULT 'active',
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_programs_institution (institution_id),
  KEY idx_programs_status (status),
  CONSTRAINT fk_programs_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_programs_coordinator FOREIGN KEY (coordinator_id) REFERENCES teachers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- courses gain a program link + credit metadata
CALL cm_add_column('courses', 'program_id', 'CHAR(36) NULL');
CALL cm_add_column('courses', 'code',       'VARCHAR(60) NULL');
CALL cm_add_column('courses', 'credits',    'DECIMAL(5,2) NOT NULL DEFAULT 0');
CALL cm_add_column('courses', 'semester',   'SMALLINT NULL');
CALL cm_add_index('courses', 'idx_courses_program', '`program_id`');

-- teachers gain faculty metadata
CALL cm_add_column('teachers', 'department',       'VARCHAR(150) NULL');
CALL cm_add_column('teachers', 'designation',      'VARCHAR(120) NULL');
CALL cm_add_column('teachers', 'joining_date',     'DATE NULL');
CALL cm_add_column('teachers', 'experience_years', 'DECIMAL(4,1) NOT NULL DEFAULT 0');

-- ============================================================
-- 4. certifications — issued credentials
-- ============================================================
CREATE TABLE IF NOT EXISTS certifications (
  id                CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id    CHAR(36)     NOT NULL,
  student_id        CHAR(36)     NULL,
  program_id        CHAR(36)     NULL,
  title             VARCHAR(255) NOT NULL,
  certificate_no    VARCHAR(80),
  grade             VARCHAR(20),
  issued_on         DATE,
  expires_on        DATE,
  file_url          VARCHAR(500),
  issued_by         CHAR(36)     NULL,
  status            VARCHAR(30)  NOT NULL DEFAULT 'issued',
  verification_code VARCHAR(60),
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_certifications_code (verification_code),
  KEY idx_certifications_institution (institution_id),
  KEY idx_certifications_student (student_id),
  CONSTRAINT fk_cert_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_cert_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE SET NULL,
  CONSTRAINT fk_cert_program FOREIGN KEY (program_id) REFERENCES programs (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. student_documents — per-student document vault
-- ============================================================
CREATE TABLE IF NOT EXISTS student_documents (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  student_id     CHAR(36)     NULL,
  admission_id   CHAR(36)     NULL,
  doc_type       VARCHAR(60)  NOT NULL,
  name           VARCHAR(255) NOT NULL,
  file_url       VARCHAR(500),
  mime_type      VARCHAR(120),
  size_bytes     BIGINT,
  status         VARCHAR(30)  NOT NULL DEFAULT 'pending',
  notes          TEXT,
  uploaded_by    CHAR(36)     NULL,
  verified_by    CHAR(36)     NULL,
  verified_at    TIMESTAMP    NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_student_docs_institution (institution_id),
  KEY idx_student_docs_student (student_id),
  KEY idx_student_docs_admission (admission_id),
  CONSTRAINT fk_student_docs_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_student_docs_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. admissions — application depth (offer letters, pipeline)
-- ============================================================
CALL cm_add_column('admissions', 'application_no',     'VARCHAR(60) NULL');
CALL cm_add_column('admissions', 'program_id',         'CHAR(36) NULL');
CALL cm_add_column('admissions', 'lead_id',            'CHAR(36) NULL');
CALL cm_add_column('admissions', 'referral_id',        'CHAR(36) NULL');
CALL cm_add_column('admissions', 'student_id',         'CHAR(36) NULL');
CALL cm_add_column('admissions', 'assigned_to',        'CHAR(36) NULL');
CALL cm_add_column('admissions', 'source',             'VARCHAR(40) NOT NULL DEFAULT ''direct''');
CALL cm_add_column('admissions', 'intake_year',        'SMALLINT NULL');
CALL cm_add_column('admissions', 'intake_term',        'VARCHAR(30) NULL');
CALL cm_add_column('admissions', 'documents_verified', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL cm_add_column('admissions', 'offer_letter_url',   'VARCHAR(500) NULL');
CALL cm_add_column('admissions', 'offer_issued_at',    'TIMESTAMP NULL');
CALL cm_add_column('admissions', 'offer_expires_at',   'TIMESTAMP NULL');
CALL cm_add_column('admissions', 'offer_accepted_at',  'TIMESTAMP NULL');
CALL cm_add_column('admissions', 'decision_reason',    'TEXT NULL');
CALL cm_add_column('admissions', 'updated_at',         'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
CALL cm_add_index('admissions', 'idx_admissions_status',  '`status`');
CALL cm_add_index('admissions', 'idx_admissions_program', '`program_id`');
CALL cm_add_index('admissions', 'idx_admissions_app_no',  '`institution_id`, `application_no`');

CREATE TABLE IF NOT EXISTS admission_status_history (
  id             CHAR(36)    NOT NULL DEFAULT (UUID()),
  admission_id   CHAR(36)    NOT NULL,
  institution_id CHAR(36)    NOT NULL,
  from_status    VARCHAR(30),
  to_status      VARCHAR(30) NOT NULL,
  note           TEXT,
  changed_by     CHAR(36)    NULL,
  created_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_adm_history_admission (admission_id, created_at),
  CONSTRAINT fk_adm_history_admission FOREIGN KEY (admission_id) REFERENCES admissions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS cm_add_column;
DROP PROCEDURE IF EXISTS cm_add_index;
