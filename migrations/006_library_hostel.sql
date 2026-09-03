-- ============================================================
-- CyberMilo — migration 006: Library and Hostel modules
--
-- Both were listed as "planned" features with checkboxes in the admin
-- console but no tables/routes/pages behind them. This builds the core
-- workflows: library catalog + issue/return, and hostel/room/allocation
-- management. Idempotent: safe to re-run.
-- ============================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS library_books (
  id               CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id   CHAR(36)     NOT NULL,
  title            VARCHAR(255) NOT NULL,
  author           VARCHAR(255),
  isbn             VARCHAR(50),
  category         VARCHAR(100),
  publisher        VARCHAR(255),
  total_copies     INT          NOT NULL DEFAULT 1,
  available_copies INT          NOT NULL DEFAULT 1,
  shelf_location   VARCHAR(100),
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_library_books_institution (institution_id),
  CONSTRAINT fk_library_books_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS library_issues (
  id             CHAR(36)      NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)      NOT NULL,
  book_id        CHAR(36)      NOT NULL,
  student_id     CHAR(36)      NOT NULL,
  issued_at      DATE          NOT NULL,
  due_date       DATE          NOT NULL,
  returned_at    DATE          NULL,
  fine_amount    DECIMAL(10,2) NOT NULL DEFAULT 0,
  status         VARCHAR(20)   NOT NULL DEFAULT 'issued',
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_library_issues_institution (institution_id),
  KEY idx_library_issues_book (book_id),
  KEY idx_library_issues_student (student_id),
  CONSTRAINT fk_library_issues_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_library_issues_book FOREIGN KEY (book_id) REFERENCES library_books (id) ON DELETE CASCADE,
  CONSTRAINT fk_library_issues_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hostels (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  name           VARCHAR(255) NOT NULL,
  warden_name    VARCHAR(200),
  warden_phone   VARCHAR(30),
  address        TEXT,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hostels_institution (institution_id),
  CONSTRAINT fk_hostels_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hostel_rooms (
  id             CHAR(36)    NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)    NOT NULL,
  hostel_id      CHAR(36)    NOT NULL,
  room_number    VARCHAR(50) NOT NULL,
  room_type      VARCHAR(50),
  capacity       INT         NOT NULL DEFAULT 1,
  created_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hostel_rooms_institution (institution_id),
  KEY idx_hostel_rooms_hostel (hostel_id),
  CONSTRAINT fk_hostel_rooms_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_hostel_rooms_hostel FOREIGN KEY (hostel_id) REFERENCES hostels (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hostel_allocations (
  id             CHAR(36)    NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)    NOT NULL,
  room_id        CHAR(36)    NOT NULL,
  student_id     CHAR(36)    NOT NULL,
  allocated_at   DATE        NOT NULL,
  vacated_at     DATE        NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hostel_allocations_institution (institution_id),
  KEY idx_hostel_allocations_room (room_id),
  KEY idx_hostel_allocations_student (student_id),
  CONSTRAINT fk_hostel_allocations_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_hostel_allocations_room FOREIGN KEY (room_id) REFERENCES hostel_rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_hostel_allocations_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
