SET NAMES utf8mb4;

-- Multi-Branch/Campus Management — a branch is just another institutions
-- row, linked back to its parent. Existing tenant-scoping (institution_id
-- on every table) already isolates a branch's data automatically.
ALTER TABLE institutions ADD COLUMN parent_institution_id CHAR(36) NULL AFTER id;
ALTER TABLE institutions ADD KEY idx_institutions_parent_institution_id (parent_institution_id);
ALTER TABLE institutions ADD CONSTRAINT fk_institutions_parent
  FOREIGN KEY (parent_institution_id) REFERENCES institutions (id) ON DELETE SET NULL;

-- Parent-Teacher Meeting Scheduler
CREATE TABLE IF NOT EXISTS ptm_slots (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  teacher_id     CHAR(36)     NOT NULL,
  slot_date      DATE         NOT NULL,
  start_time     TIME         NOT NULL,
  end_time       TIME         NOT NULL,
  status         VARCHAR(20)  NOT NULL DEFAULT 'open',
  student_id     CHAR(36)     NULL,
  booked_by      CHAR(36)     NULL,
  notes          TEXT,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ptm_slots_institution_id (institution_id),
  KEY idx_ptm_slots_teacher_id (teacher_id),
  CONSTRAINT fk_ptm_slots_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_ptm_slots_teacher FOREIGN KEY (teacher_id) REFERENCES teachers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Online Quiz/Test Module
CREATE TABLE IF NOT EXISTS quizzes (
  id                 CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id     CHAR(36)     NOT NULL,
  title              VARCHAR(255) NOT NULL,
  subject            VARCHAR(100),
  class_name         VARCHAR(50),
  teacher_id         CHAR(36)     NULL,
  time_limit_minutes INT          NOT NULL DEFAULT 30,
  status             VARCHAR(20)  NOT NULL DEFAULT 'draft',
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_quizzes_institution_id (institution_id),
  CONSTRAINT fk_quizzes_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quiz_questions (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  quiz_id        CHAR(36)     NOT NULL,
  question_text  TEXT         NOT NULL,
  options        JSON         NOT NULL,
  correct_index  INT          NOT NULL DEFAULT 0,
  points         INT          NOT NULL DEFAULT 1,
  sort_order     INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_quiz_questions_quiz_id (quiz_id),
  CONSTRAINT fk_quiz_questions_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  quiz_id        CHAR(36)     NOT NULL,
  student_id     CHAR(36)     NOT NULL,
  answers        JSON         NOT NULL,
  score          INT          NOT NULL DEFAULT 0,
  max_score      INT          NOT NULL DEFAULT 0,
  submitted_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_quiz_attempts_quiz_id (quiz_id),
  KEY idx_quiz_attempts_student_id (student_id),
  UNIQUE KEY uq_quiz_attempts_quiz_student (quiz_id, student_id),
  CONSTRAINT fk_quiz_attempts_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE,
  CONSTRAINT fk_quiz_attempts_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Feedback & Survey Builder
CREATE TABLE IF NOT EXISTS surveys (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  title          VARCHAR(255) NOT NULL,
  description    TEXT,
  target_role    VARCHAR(30)  NOT NULL DEFAULT 'all',
  status         VARCHAR(20)  NOT NULL DEFAULT 'open',
  created_by     CHAR(36)     NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_surveys_institution_id (institution_id),
  CONSTRAINT fk_surveys_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS survey_questions (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  survey_id      CHAR(36)     NOT NULL,
  question_text  TEXT         NOT NULL,
  question_type  VARCHAR(20)  NOT NULL DEFAULT 'text',
  options        JSON         NULL,
  sort_order     INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_survey_questions_survey_id (survey_id),
  CONSTRAINT fk_survey_questions_survey FOREIGN KEY (survey_id) REFERENCES surveys (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS survey_responses (
  id                     CHAR(36)     NOT NULL DEFAULT (UUID()),
  survey_id              CHAR(36)     NOT NULL,
  respondent_profile_id  CHAR(36)     NULL,
  answers                JSON         NOT NULL,
  submitted_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_survey_responses_survey_id (survey_id),
  CONSTRAINT fk_survey_responses_survey FOREIGN KEY (survey_id) REFERENCES surveys (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
