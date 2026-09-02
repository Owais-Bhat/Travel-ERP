-- ============================================================
-- CyberMilo ERP — MySQL Schema (for Hostinger / any MySQL host)
-- Converted from supabase_schema.sql (PostgreSQL) on 2026-07-12
--
-- Requirements: MySQL 8.0.13+ or MariaDB 10.2+
--   (needed for DEFAULT (UUID()) expression defaults)
--
-- IMPORTANT differences from the Supabase version:
--   1. Supabase's built-in auth.users is replaced by the `users`
--      table below. Your backend must handle registration/login
--      (bcrypt password hashing + JWT sessions).
--   2. PostgreSQL Row Level Security does NOT exist in MySQL.
--      Tenant isolation MUST be enforced by the backend API:
--      every query must filter by institution_id.
--   3. Supabase Realtime does not exist. Use polling or
--      socket.io from the backend for live features.
--
-- Import on Hostinger: hPanel -> Databases -> phpMyAdmin ->
--   select your database -> Import -> choose this file.
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 0. users (replaces Supabase auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            CHAR(36)     NOT NULL DEFAULT (UUID()),
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email_verified_at TIMESTAMP NULL,
  last_login_at TIMESTAMP    NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 1. institutions
-- ============================================================
CREATE TABLE IF NOT EXISTS institutions (
  id                     CHAR(36)     NOT NULL DEFAULT (UUID()),
  name                   VARCHAR(255) NOT NULL,
  type                   VARCHAR(50),
  address                TEXT,
  phone                  VARCHAR(30),
  email                  VARCHAR(255),
  logo_url               VARCHAR(500),
  subscription_plan      VARCHAR(50)  NOT NULL DEFAULT 'free',
  subscription_status    VARCHAR(50)  NOT NULL DEFAULT 'trialing',
  trial_ends_at          TIMESTAMP    NULL,
  current_period_ends_at TIMESTAMP    NULL,
  billing_email          VARCHAR(255),
  settings               JSON         NOT NULL DEFAULT (JSON_OBJECT()),
  created_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. user_profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  user_id        CHAR(36)     NOT NULL,
  institution_id CHAR(36)     NULL,
  role           VARCHAR(50),
  first_name     VARCHAR(100),
  last_name      VARCHAR(100),
  phone          VARCHAR(30),
  avatar_url     VARCHAR(500),
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_profiles_user_id (user_id),
  KEY idx_user_profiles_institution_id (institution_id),
  CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_profiles_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. students
-- ============================================================
CREATE TABLE IF NOT EXISTS students (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  admission_no   VARCHAR(50),
  first_name     VARCHAR(100) NOT NULL,
  last_name      VARCHAR(100),
  email          VARCHAR(255),
  phone          VARCHAR(30),
  dob            DATE,
  gender         VARCHAR(20),
  address        TEXT,
  class_name     VARCHAR(50),
  section        VARCHAR(20),
  parent_name    VARCHAR(200),
  parent_phone   VARCHAR(30),
  parent_email   VARCHAR(255),
  status         VARCHAR(30)  NOT NULL DEFAULT 'active',
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_students_institution_id (institution_id),
  CONSTRAINT fk_students_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. teachers  (subjects: text[] -> JSON array)
-- ============================================================
CREATE TABLE IF NOT EXISTS teachers (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  employee_id    VARCHAR(50),
  first_name     VARCHAR(100) NOT NULL,
  last_name      VARCHAR(100),
  email          VARCHAR(255),
  phone          VARCHAR(30),
  subjects       JSON         NULL,
  qualification  VARCHAR(255),
  status         VARCHAR(30)  NOT NULL DEFAULT 'active',
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_teachers_institution_id (institution_id),
  CONSTRAINT fk_teachers_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. classes
-- ============================================================
CREATE TABLE IF NOT EXISTS classes (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  name           VARCHAR(100) NOT NULL,
  section        VARCHAR(20),
  teacher_id     CHAR(36)     NULL,
  capacity       INT,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_classes_institution_id (institution_id),
  CONSTRAINT fk_classes_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_classes_teacher FOREIGN KEY (teacher_id) REFERENCES teachers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. attendance
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance (
  id             CHAR(36)    NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)    NOT NULL,
  student_id     CHAR(36)    NOT NULL,
  class_name     VARCHAR(50),
  date           DATE        NOT NULL,
  status         VARCHAR(20) NOT NULL,
  marked_by      CHAR(36)    NULL,
  created_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attendance_day (institution_id, student_id, date),
  KEY idx_attendance_institution_id (institution_id),
  KEY idx_attendance_student_id (student_id),
  KEY idx_attendance_date (date),
  CONSTRAINT chk_attendance_status CHECK (status IN ('present', 'absent', 'late')),
  CONSTRAINT fk_attendance_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_marker FOREIGN KEY (marked_by) REFERENCES user_profiles (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. fee_structures
-- ============================================================
CREATE TABLE IF NOT EXISTS fee_structures (
  id             CHAR(36)      NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)      NOT NULL,
  name           VARCHAR(255)  NOT NULL,
  amount         DECIMAL(12,2) NOT NULL DEFAULT 0,
  frequency      VARCHAR(30),
  class_name     VARCHAR(50),
  is_active      TINYINT(1)    NOT NULL DEFAULT 1,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fee_structures_institution_id (institution_id),
  CONSTRAINT fk_fee_structures_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. fee_payments
-- ============================================================
CREATE TABLE IF NOT EXISTS fee_payments (
  id             CHAR(36)      NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)      NOT NULL,
  student_id     CHAR(36)      NOT NULL,
  fee_type       VARCHAR(100),
  total_amount   DECIMAL(12,2) NOT NULL DEFAULT 0,
  paid_amount    DECIMAL(12,2) NOT NULL DEFAULT 0,
  due_date       DATE,
  payment_date   DATE,
  status         VARCHAR(30)   NOT NULL DEFAULT 'pending',
  receipt_no     VARCHAR(50),
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fee_payments_institution_id (institution_id),
  KEY idx_fee_payments_student_id (student_id),
  CONSTRAINT fk_fee_payments_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_fee_payments_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 9. exams
-- ============================================================
CREATE TABLE IF NOT EXISTS exams (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  title          VARCHAR(255) NOT NULL,
  subject        VARCHAR(100),
  class_name     VARCHAR(50),
  exam_date      DATE,
  total_marks    INT,
  pass_marks     INT,
  status         VARCHAR(30)  NOT NULL DEFAULT 'upcoming',
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_exams_institution_id (institution_id),
  CONSTRAINT fk_exams_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 10. exam_results
-- ============================================================
CREATE TABLE IF NOT EXISTS exam_results (
  id             CHAR(36)      NOT NULL DEFAULT (UUID()),
  exam_id        CHAR(36)      NOT NULL,
  student_id     CHAR(36)      NOT NULL,
  marks_obtained DECIMAL(8,2),
  grade          VARCHAR(10),
  remarks        TEXT,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_exam_results_exam_id (exam_id),
  KEY idx_exam_results_student_id (student_id),
  CONSTRAINT fk_exam_results_exam FOREIGN KEY (exam_id) REFERENCES exams (id) ON DELETE CASCADE,
  CONSTRAINT fk_exam_results_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 11. courses
-- ============================================================
CREATE TABLE IF NOT EXISTS courses (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  title          VARCHAR(255) NOT NULL,
  description    TEXT,
  subject        VARCHAR(100),
  class_name     VARCHAR(50),
  teacher_id     CHAR(36)     NULL,
  thumbnail_url  VARCHAR(500),
  is_published   TINYINT(1)   NOT NULL DEFAULT 0,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_courses_institution_id (institution_id),
  CONSTRAINT fk_courses_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_courses_teacher FOREIGN KEY (teacher_id) REFERENCES teachers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 12. lessons
-- ============================================================
CREATE TABLE IF NOT EXISTS lessons (
  id           CHAR(36)     NOT NULL DEFAULT (UUID()),
  course_id    CHAR(36)     NOT NULL,
  title        VARCHAR(255) NOT NULL,
  content      TEXT,
  video_url    VARCHAR(500),
  file_url     VARCHAR(500),
  lesson_order INT          NOT NULL DEFAULT 0,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lessons_course_id (course_id),
  CONSTRAINT fk_lessons_course FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 13. announcements
-- ============================================================
CREATE TABLE IF NOT EXISTS announcements (
  id              CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id  CHAR(36)     NOT NULL,
  title           VARCHAR(255) NOT NULL,
  content         TEXT,
  priority        VARCHAR(20)  NOT NULL DEFAULT 'normal',
  target_audience VARCHAR(30)  NOT NULL DEFAULT 'all',
  created_by      CHAR(36)     NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_announcements_institution_id (institution_id),
  CONSTRAINT fk_announcements_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_announcements_creator FOREIGN KEY (created_by) REFERENCES user_profiles (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 14. messages
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id             CHAR(36)    NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)    NOT NULL,
  sender_id      CHAR(36)    NULL,
  recipient_id   CHAR(36)    NULL,
  subject        VARCHAR(255),
  body           TEXT,
  is_read        TINYINT(1)  NOT NULL DEFAULT 0,
  created_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_messages_institution_id (institution_id),
  KEY idx_messages_recipient_id (recipient_id),
  CONSTRAINT fk_messages_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES user_profiles (id) ON DELETE SET NULL,
  CONSTRAINT fk_messages_recipient FOREIGN KEY (recipient_id) REFERENCES user_profiles (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 15. transport_routes  (stops: text[] -> JSON array)
-- ============================================================
CREATE TABLE IF NOT EXISTS transport_routes (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  route_name     VARCHAR(255) NOT NULL,
  driver_name    VARCHAR(200),
  driver_phone   VARCHAR(30),
  vehicle_no     VARCHAR(50),
  capacity       INT,
  stops          JSON         NULL,
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_transport_routes_institution_id (institution_id),
  CONSTRAINT fk_transport_routes_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 16. student_routes
-- ============================================================
CREATE TABLE IF NOT EXISTS student_routes (
  id          CHAR(36)     NOT NULL DEFAULT (UUID()),
  route_id    CHAR(36)     NOT NULL,
  student_id  CHAR(36)     NOT NULL,
  pickup_stop VARCHAR(255),
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_student_routes_route_id (route_id),
  KEY idx_student_routes_student_id (student_id),
  CONSTRAINT fk_student_routes_route FOREIGN KEY (route_id) REFERENCES transport_routes (id) ON DELETE CASCADE,
  CONSTRAINT fk_student_routes_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 17. admissions
-- ============================================================
CREATE TABLE IF NOT EXISTS admissions (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  applicant_name VARCHAR(200) NOT NULL,
  email          VARCHAR(255),
  phone          VARCHAR(30),
  dob            DATE,
  class_applying VARCHAR(50),
  parent_name    VARCHAR(200),
  parent_phone   VARCHAR(30),
  address        TEXT,
  status         VARCHAR(30)  NOT NULL DEFAULT 'pending',
  remarks        TEXT,
  applied_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_admissions_institution_id (institution_id),
  CONSTRAINT fk_admissions_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 18. activity_log
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_log (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  user_id        CHAR(36)     NULL,
  action         VARCHAR(100) NOT NULL,
  description    TEXT,
  entity_type    VARCHAR(50),
  entity_id      CHAR(36)     NULL,
  severity       VARCHAR(20)  NOT NULL DEFAULT 'info',
  ip_address     VARCHAR(45),
  user_agent     VARCHAR(500),
  metadata       JSON         NOT NULL DEFAULT (JSON_OBJECT()),
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_activity_log_institution_id (institution_id),
  KEY idx_activity_log_created_at (created_at DESC),
  KEY idx_activity_log_action (action),
  CONSTRAINT fk_activity_log_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 19. feature_usage_events
-- ============================================================
CREATE TABLE IF NOT EXISTS feature_usage_events (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  user_id        CHAR(36)     NULL,
  feature_key    VARCHAR(100) NOT NULL,
  event_type     VARCHAR(50)  NOT NULL DEFAULT 'view',
  metadata       JSON         NOT NULL DEFAULT (JSON_OBJECT()),
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_feature_usage_institution_id (institution_id),
  KEY idx_feature_usage_feature_key (feature_key),
  KEY idx_feature_usage_created_at (created_at),
  CONSTRAINT fk_feature_usage_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 20. notifications (in-app notification center)
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  user_id        CHAR(36)     NOT NULL,
  title          VARCHAR(255) NOT NULL,
  body           TEXT,
  type           VARCHAR(30)  NOT NULL DEFAULT 'info',
  link           VARCHAR(500),
  read_at        TIMESTAMP    NULL,
  created_by     CHAR(36)     NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user_created (user_id, created_at DESC),
  CONSTRAINT fk_notifications_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES user_profiles (id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_creator FOREIGN KEY (created_by) REFERENCES user_profiles (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- Post-import notes
-- ============================================================
-- 1. Create the first super admin (replace the hash with a real
--    bcrypt hash generated by your backend):
--
--    INSERT INTO users (id, email, password_hash)
--    VALUES (UUID(), 'admin@example.com', '$2b$10$REPLACE_WITH_BCRYPT_HASH');
--
--    INSERT INTO user_profiles (user_id, role, first_name, last_name)
--    SELECT id, 'super_admin', 'Platform', 'Owner' FROM users
--    WHERE email = 'admin@example.com';
--
-- 2. Tenant isolation: EVERY backend query must include
--    WHERE institution_id = ? — MySQL has no Row Level Security.
--
-- 3. text[] columns (teachers.subjects, transport_routes.stops)
--    are JSON arrays here, e.g. '["Math", "Physics"]'.
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
-- ============================================================
-- CyberMilo — EIMS parity migration 002
-- Adds: scholarships + cashback, referral partners + commissions
--       + invoices, CRM leads + activities.
-- Idempotent: safe to re-run.
-- ============================================================

SET NAMES utf8mb4;

-- ============================================================
-- 1. scholarship_schemes
-- ============================================================
CREATE TABLE IF NOT EXISTS scholarship_schemes (
  id                CHAR(36)      NOT NULL DEFAULT (UUID()),
  institution_id    CHAR(36)      NOT NULL,
  name              VARCHAR(255)  NOT NULL,
  code              VARCHAR(60),
  type              VARCHAR(40)   NOT NULL DEFAULT 'merit',
  award_type        VARCHAR(20)   NOT NULL DEFAULT 'percentage',
  award_value       DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency          VARCHAR(10)   NOT NULL DEFAULT 'INR',
  max_awards        INT           NOT NULL DEFAULT 0,
  awards_granted    INT           NOT NULL DEFAULT 0,
  budget_total      DECIMAL(14,2) NOT NULL DEFAULT 0,
  budget_committed  DECIMAL(14,2) NOT NULL DEFAULT 0,
  min_percentage    DECIMAL(5,2)  NULL,
  max_family_income DECIMAL(14,2) NULL,
  eligibility_notes TEXT,
  description       TEXT,
  opens_at          DATE          NULL,
  closes_at         DATE          NULL,
  status            VARCHAR(30)   NOT NULL DEFAULT 'open',
  created_by        CHAR(36)      NULL,
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_schemes_institution (institution_id),
  KEY idx_schemes_status (status),
  CONSTRAINT fk_schemes_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. scholarship_applications
-- ============================================================
CREATE TABLE IF NOT EXISTS scholarship_applications (
  id                  CHAR(36)      NOT NULL DEFAULT (UUID()),
  institution_id      CHAR(36)      NOT NULL,
  scheme_id           CHAR(36)      NOT NULL,
  student_id          CHAR(36)      NULL,
  admission_id        CHAR(36)      NULL,
  application_no      VARCHAR(60),
  applicant_name      VARCHAR(200)  NOT NULL,
  email               VARCHAR(255),
  phone               VARCHAR(30),
  academic_percentage DECIMAL(5,2)  NULL,
  family_income       DECIMAL(14,2) NULL,
  category            VARCHAR(60),
  statement           TEXT,
  eligibility_score   DECIMAL(5,2)  NOT NULL DEFAULT 0,
  eligibility_notes   TEXT,
  requested_amount    DECIMAL(12,2) NOT NULL DEFAULT 0,
  awarded_amount      DECIMAL(12,2) NOT NULL DEFAULT 0,
  status              VARCHAR(30)   NOT NULL DEFAULT 'submitted',
  review_notes        TEXT,
  reviewed_by         CHAR(36)      NULL,
  reviewed_at         TIMESTAMP     NULL,
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_scholarship_apps_institution (institution_id),
  KEY idx_scholarship_apps_scheme (scheme_id),
  KEY idx_scholarship_apps_status (status),
  KEY idx_scholarship_apps_student (student_id),
  CONSTRAINT fk_scholarship_apps_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_scholarship_apps_scheme FOREIGN KEY (scheme_id) REFERENCES scholarship_schemes (id) ON DELETE CASCADE,
  CONSTRAINT fk_scholarship_apps_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. cashback_transactions — scholarship / referral payouts
-- ============================================================
CREATE TABLE IF NOT EXISTS cashback_transactions (
  id             CHAR(36)      NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)      NOT NULL,
  student_id     CHAR(36)      NULL,
  application_id CHAR(36)      NULL,
  source         VARCHAR(30)   NOT NULL DEFAULT 'scholarship',
  amount         DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency       VARCHAR(10)   NOT NULL DEFAULT 'INR',
  status         VARCHAR(30)   NOT NULL DEFAULT 'pending',
  reference_no   VARCHAR(80),
  payout_method  VARCHAR(40),
  notes          TEXT,
  approved_by    CHAR(36)      NULL,
  approved_at    TIMESTAMP     NULL,
  paid_at        TIMESTAMP     NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cashback_institution (institution_id),
  KEY idx_cashback_status (status),
  CONSTRAINT fk_cashback_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_cashback_application FOREIGN KEY (application_id) REFERENCES scholarship_applications (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. referral_partners
-- ============================================================
CREATE TABLE IF NOT EXISTS referral_partners (
  id              CHAR(36)      NOT NULL DEFAULT (UUID()),
  institution_id  CHAR(36)      NOT NULL,
  name            VARCHAR(200)  NOT NULL,
  type            VARCHAR(30)   NOT NULL DEFAULT 'agent',
  email           VARCHAR(255),
  phone           VARCHAR(30),
  company         VARCHAR(200),
  city            VARCHAR(120),
  referral_code   VARCHAR(40)   NOT NULL,
  commission_type VARCHAR(20)   NOT NULL DEFAULT 'percentage',
  commission_rate DECIMAL(8,2)  NOT NULL DEFAULT 0,
  payout_details  JSON          NULL,
  total_referrals INT           NOT NULL DEFAULT 0,
  total_converted INT           NOT NULL DEFAULT 0,
  total_earned    DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_paid      DECIMAL(14,2) NOT NULL DEFAULT 0,
  status          VARCHAR(30)   NOT NULL DEFAULT 'active',
  notes           TEXT,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_partner_code (institution_id, referral_code),
  KEY idx_partners_institution (institution_id),
  KEY idx_partners_status (status),
  CONSTRAINT fk_partners_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. leads — CRM pipeline (created before referrals for the FK)
-- ============================================================
CREATE TABLE IF NOT EXISTS leads (
  id                    CHAR(36)      NOT NULL DEFAULT (UUID()),
  institution_id        CHAR(36)      NOT NULL,
  name                  VARCHAR(200)  NOT NULL,
  email                 VARCHAR(255),
  phone                 VARCHAR(30),
  city                  VARCHAR(120),
  source                VARCHAR(40)   NOT NULL DEFAULT 'website',
  program_id            CHAR(36)      NULL,
  interest              VARCHAR(255),
  stage                 VARCHAR(30)   NOT NULL DEFAULT 'new',
  score                 INT           NOT NULL DEFAULT 0,
  budget                DECIMAL(12,2) NULL,
  assigned_to           CHAR(36)      NULL,
  referral_partner_id   CHAR(36)      NULL,
  notes                 TEXT,
  next_follow_up_at     DATE          NULL,
  last_contacted_at     TIMESTAMP     NULL,
  converted_admission_id CHAR(36)     NULL,
  converted_at          TIMESTAMP     NULL,
  lost_reason           VARCHAR(255),
  created_by            CHAR(36)      NULL,
  created_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_leads_institution (institution_id),
  KEY idx_leads_stage (stage),
  KEY idx_leads_assigned (assigned_to),
  KEY idx_leads_follow_up (next_follow_up_at),
  CONSTRAINT fk_leads_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_leads_program FOREIGN KEY (program_id) REFERENCES programs (id) ON DELETE SET NULL,
  CONSTRAINT fk_leads_partner FOREIGN KEY (referral_partner_id) REFERENCES referral_partners (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lead_activities (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  lead_id        CHAR(36)     NOT NULL,
  type           VARCHAR(30)  NOT NULL DEFAULT 'note',
  subject        VARCHAR(255),
  body           TEXT,
  outcome        VARCHAR(60),
  performed_by   CHAR(36)     NULL,
  occurred_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lead_activities_lead (lead_id, occurred_at),
  CONSTRAINT fk_lead_activities_lead FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. referrals
-- ============================================================
CREATE TABLE IF NOT EXISTS referrals (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  partner_id     CHAR(36)     NOT NULL,
  referral_code  VARCHAR(40),
  lead_id        CHAR(36)     NULL,
  admission_id   CHAR(36)     NULL,
  student_id     CHAR(36)     NULL,
  referee_name   VARCHAR(200) NOT NULL,
  referee_email  VARCHAR(255),
  referee_phone  VARCHAR(30),
  program_id     CHAR(36)     NULL,
  status         VARCHAR(30)  NOT NULL DEFAULT 'pending',
  notes          TEXT,
  converted_at   TIMESTAMP    NULL,
  expires_at     DATE         NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_referrals_institution (institution_id),
  KEY idx_referrals_partner (partner_id),
  KEY idx_referrals_status (status),
  CONSTRAINT fk_referrals_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_referrals_partner FOREIGN KEY (partner_id) REFERENCES referral_partners (id) ON DELETE CASCADE,
  CONSTRAINT fk_referrals_lead FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. commission_invoices (before commissions for the FK)
-- ============================================================
CREATE TABLE IF NOT EXISTS commission_invoices (
  id             CHAR(36)      NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)      NOT NULL,
  partner_id     CHAR(36)      NOT NULL,
  invoice_no     VARCHAR(60)   NOT NULL,
  period_start   DATE          NULL,
  period_end     DATE          NULL,
  subtotal       DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax_rate       DECIMAL(5,2)  NOT NULL DEFAULT 0,
  tax_amount     DECIMAL(14,2) NOT NULL DEFAULT 0,
  total          DECIMAL(14,2) NOT NULL DEFAULT 0,
  currency       VARCHAR(10)   NOT NULL DEFAULT 'INR',
  status         VARCHAR(30)   NOT NULL DEFAULT 'draft',
  notes          TEXT,
  issued_at      TIMESTAMP     NULL,
  due_at         DATE          NULL,
  paid_at        TIMESTAMP     NULL,
  created_by     CHAR(36)      NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_commission_invoice_no (institution_id, invoice_no),
  KEY idx_commission_invoices_partner (partner_id),
  KEY idx_commission_invoices_status (status),
  CONSTRAINT fk_commission_invoices_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_commission_invoices_partner FOREIGN KEY (partner_id) REFERENCES referral_partners (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. commissions
-- ============================================================
CREATE TABLE IF NOT EXISTS commissions (
  id             CHAR(36)      NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)      NOT NULL,
  partner_id     CHAR(36)      NOT NULL,
  referral_id    CHAR(36)      NULL,
  invoice_id     CHAR(36)      NULL,
  base_amount    DECIMAL(14,2) NOT NULL DEFAULT 0,
  rate           DECIMAL(8,2)  NOT NULL DEFAULT 0,
  amount         DECIMAL(14,2) NOT NULL DEFAULT 0,
  currency       VARCHAR(10)   NOT NULL DEFAULT 'INR',
  status         VARCHAR(30)   NOT NULL DEFAULT 'pending',
  notes          TEXT,
  approved_by    CHAR(36)      NULL,
  approved_at    TIMESTAMP     NULL,
  paid_at        TIMESTAMP     NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_commissions_institution (institution_id),
  KEY idx_commissions_partner (partner_id),
  KEY idx_commissions_status (status),
  CONSTRAINT fk_commissions_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_commissions_partner FOREIGN KEY (partner_id) REFERENCES referral_partners (id) ON DELETE CASCADE,
  CONSTRAINT fk_commissions_referral FOREIGN KEY (referral_id) REFERENCES referrals (id) ON DELETE SET NULL,
  CONSTRAINT fk_commissions_invoice FOREIGN KEY (invoice_id) REFERENCES commission_invoices (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
