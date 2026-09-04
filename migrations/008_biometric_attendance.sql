-- ============================================================
-- CyberMilo — migration 008: Biometric attendance
--
-- A biometric device (fingerprint/face scanner) can't hold a user JWT, so
-- it authenticates to the webhook with its own device_code + api_key
-- instead of the normal session auth. Punches land in biometric_punches
-- first (the raw log, kept regardless of match), then — if the punching
-- person is enrolled — derive a same-day attendance row for the student
-- (existing `attendance` table) or staff member (new `staff_attendance`).
-- Idempotent: safe to re-run.
-- ============================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS biometric_devices (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  device_code    VARCHAR(50)  NOT NULL,
  api_key        VARCHAR(64)  NOT NULL,
  name           VARCHAR(255) NOT NULL,
  location       VARCHAR(150),
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  last_seen_at   TIMESTAMP    NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_biometric_devices_code (institution_id, device_code),
  KEY idx_biometric_devices_institution (institution_id),
  CONSTRAINT fk_biometric_devices_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS biometric_enrollments (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  person_type    VARCHAR(10)  NOT NULL,
  person_id      CHAR(36)     NOT NULL,
  biometric_uid  VARCHAR(50)  NOT NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_biometric_enrollments_uid (institution_id, biometric_uid),
  UNIQUE KEY uq_biometric_enrollments_person (institution_id, person_type, person_id),
  KEY idx_biometric_enrollments_institution (institution_id),
  CONSTRAINT fk_biometric_enrollments_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT chk_biometric_enrollments_person_type CHECK (person_type IN ('student', 'teacher'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS biometric_punches (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  device_id      CHAR(36)     NOT NULL,
  biometric_uid  VARCHAR(50)  NOT NULL,
  punched_at     DATETIME     NOT NULL,
  event_type     VARCHAR(10)  NOT NULL DEFAULT 'unknown',
  person_type    VARCHAR(10)  NULL,
  person_id      CHAR(36)     NULL,
  matched        TINYINT(1)   NOT NULL DEFAULT 0,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_biometric_punches_institution (institution_id, punched_at DESC),
  KEY idx_biometric_punches_device (device_id),
  KEY idx_biometric_punches_uid (institution_id, biometric_uid),
  CONSTRAINT fk_biometric_punches_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_biometric_punches_device FOREIGN KEY (device_id) REFERENCES biometric_devices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_attendance (
  id             CHAR(36)    NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)    NOT NULL,
  teacher_id     CHAR(36)    NOT NULL,
  date           DATE        NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'present',
  first_punch_at DATETIME    NULL,
  last_punch_at  DATETIME    NULL,
  source         VARCHAR(20) NOT NULL DEFAULT 'biometric',
  created_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_staff_attendance_day (institution_id, teacher_id, date),
  KEY idx_staff_attendance_institution (institution_id),
  CONSTRAINT fk_staff_attendance_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_staff_attendance_teacher FOREIGN KEY (teacher_id) REFERENCES teachers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
