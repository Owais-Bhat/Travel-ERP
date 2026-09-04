SET NAMES utf8mb4;

-- Staff Leave Management
CREATE TABLE IF NOT EXISTS leave_requests (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  profile_id     CHAR(36)     NOT NULL,
  leave_type     VARCHAR(50)  NOT NULL DEFAULT 'casual',
  start_date     DATE         NOT NULL,
  end_date       DATE         NOT NULL,
  reason         TEXT,
  status         VARCHAR(30)  NOT NULL DEFAULT 'pending',
  reviewed_by    CHAR(36)     NULL,
  reviewed_at    TIMESTAMP    NULL,
  review_note    TEXT,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_leave_requests_institution_id (institution_id),
  KEY idx_leave_requests_profile_id (profile_id),
  CONSTRAINT fk_leave_requests_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_leave_requests_profile FOREIGN KEY (profile_id) REFERENCES user_profiles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Discipline / Behavior Tracking
CREATE TABLE IF NOT EXISTS discipline_records (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  student_id     CHAR(36)     NOT NULL,
  record_type    VARCHAR(20)  NOT NULL DEFAULT 'demerit',
  points         INT          NOT NULL DEFAULT 0,
  reason         TEXT,
  recorded_by    CHAR(36)     NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_discipline_institution_id (institution_id),
  KEY idx_discipline_student_id (student_id),
  CONSTRAINT fk_discipline_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_discipline_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Visitor & Gate Pass Management
CREATE TABLE IF NOT EXISTS visitors (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  visitor_name   VARCHAR(200) NOT NULL,
  phone          VARCHAR(30),
  purpose        VARCHAR(255),
  whom_to_meet   VARCHAR(200),
  check_in       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  check_out      TIMESTAMP    NULL,
  status         VARCHAR(30)  NOT NULL DEFAULT 'checked_in',
  created_by     CHAR(36)     NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_visitors_institution_id (institution_id),
  CONSTRAINT fk_visitors_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Room / Facility Booking
CREATE TABLE IF NOT EXISTS facilities (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  name           VARCHAR(200) NOT NULL,
  facility_type  VARCHAR(50),
  capacity       INT,
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_facilities_institution_id (institution_id),
  CONSTRAINT fk_facilities_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS facility_bookings (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  facility_id    CHAR(36)     NOT NULL,
  booked_by      CHAR(36)     NULL,
  purpose        VARCHAR(255),
  start_time     DATETIME     NOT NULL,
  end_time       DATETIME     NOT NULL,
  status         VARCHAR(30)  NOT NULL DEFAULT 'confirmed',
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_facility_bookings_institution_id (institution_id),
  KEY idx_facility_bookings_facility_id (facility_id),
  CONSTRAINT fk_facility_bookings_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_facility_bookings_facility FOREIGN KEY (facility_id) REFERENCES facilities (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Alumni Network
CREATE TABLE IF NOT EXISTS alumni (
  id                CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id    CHAR(36)     NOT NULL,
  first_name        VARCHAR(100) NOT NULL,
  last_name         VARCHAR(100),
  batch_year        INT,
  class_name        VARCHAR(50),
  email             VARCHAR(255),
  phone             VARCHAR(30),
  occupation        VARCHAR(200),
  company           VARCHAR(200),
  linkedin_url      VARCHAR(500),
  notes             TEXT,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_alumni_institution_id (institution_id),
  CONSTRAINT fk_alumni_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
