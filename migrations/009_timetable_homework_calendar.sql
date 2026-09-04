-- ============================================================
-- CyberMilo — migration 009: Timetable, Homework, School Calendar
--
-- ID Card Generator needs no new tables — it renders on the fly from
-- existing students/teachers/institution data. Idempotent: safe to re-run.
-- ============================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS timetable_slots (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  class_name     VARCHAR(50)  NOT NULL,
  section        VARCHAR(20)  NOT NULL DEFAULT '',
  day_of_week    TINYINT      NOT NULL,
  period_number  TINYINT      NOT NULL,
  subject        VARCHAR(100) NOT NULL,
  teacher_id     CHAR(36)     NULL,
  start_time     TIME         NULL,
  end_time       TIME         NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_timetable_slot (institution_id, class_name, section, day_of_week, period_number),
  KEY idx_timetable_institution (institution_id),
  KEY idx_timetable_teacher (teacher_id, day_of_week, period_number),
  CONSTRAINT chk_timetable_day CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT chk_timetable_period CHECK (period_number BETWEEN 1 AND 20),
  CONSTRAINT fk_timetable_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_timetable_teacher FOREIGN KEY (teacher_id) REFERENCES teachers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS homework (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  class_name     VARCHAR(50)  NOT NULL,
  section        VARCHAR(20),
  subject        VARCHAR(100),
  title          VARCHAR(255) NOT NULL,
  description    TEXT,
  due_date       DATE         NOT NULL,
  teacher_id     CHAR(36)     NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_homework_institution (institution_id),
  KEY idx_homework_class (institution_id, class_name, section),
  CONSTRAINT fk_homework_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_homework_teacher FOREIGN KEY (teacher_id) REFERENCES teachers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS homework_submissions (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  homework_id    CHAR(36)     NOT NULL,
  student_id     CHAR(36)     NOT NULL,
  note           TEXT,
  link           VARCHAR(500),
  status         VARCHAR(20)  NOT NULL DEFAULT 'submitted',
  grade          VARCHAR(20),
  remarks        VARCHAR(500),
  submitted_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_homework_submission (homework_id, student_id),
  KEY idx_homework_submissions_institution (institution_id),
  CONSTRAINT fk_homework_submissions_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_homework_submissions_homework FOREIGN KEY (homework_id) REFERENCES homework (id) ON DELETE CASCADE,
  CONSTRAINT fk_homework_submissions_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS calendar_events (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  title          VARCHAR(255) NOT NULL,
  description    TEXT,
  event_date     DATE         NOT NULL,
  end_date       DATE         NULL,
  event_type     VARCHAR(20)  NOT NULL DEFAULT 'event',
  created_by     CHAR(36)     NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_calendar_events_institution (institution_id, event_date),
  CONSTRAINT fk_calendar_events_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_calendar_events_creator FOREIGN KEY (created_by) REFERENCES user_profiles (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
