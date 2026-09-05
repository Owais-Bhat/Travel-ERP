SET NAMES utf8mb4;

-- Live GPS Bus Tracking — a driver's phone pushes its location to a
-- per-route tracking_token (no login required, same public-device pattern
-- as biometricWebhook.js), the route row itself holds the latest fix.
ALTER TABLE transport_routes ADD COLUMN tracking_token CHAR(36) NULL AFTER stops;
ALTER TABLE transport_routes ADD COLUMN last_lat DECIMAL(10,7) NULL AFTER tracking_token;
ALTER TABLE transport_routes ADD COLUMN last_lng DECIMAL(10,7) NULL AFTER last_lat;
ALTER TABLE transport_routes ADD COLUMN last_ping_at TIMESTAMP NULL AFTER last_lng;
ALTER TABLE transport_routes ADD UNIQUE KEY uq_transport_routes_tracking_token (tracking_token);

-- Canteen & Student Wallet
CREATE TABLE IF NOT EXISTS student_wallets (
  id             CHAR(36)      NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)      NOT NULL,
  student_id     CHAR(36)      NOT NULL,
  balance        DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_student_wallets_student (student_id),
  KEY idx_student_wallets_institution_id (institution_id),
  CONSTRAINT fk_student_wallets_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_student_wallets_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id             CHAR(36)      NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)      NOT NULL,
  student_id     CHAR(36)      NOT NULL,
  type           VARCHAR(20)   NOT NULL,
  amount         DECIMAL(10,2) NOT NULL,
  balance_after  DECIMAL(10,2) NOT NULL,
  description    VARCHAR(255),
  created_by     CHAR(36)      NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wallet_transactions_institution_id (institution_id),
  KEY idx_wallet_transactions_student_id (student_id),
  CONSTRAINT fk_wallet_transactions_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_wallet_transactions_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS canteen_items (
  id             CHAR(36)      NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)      NOT NULL,
  name           VARCHAR(200)  NOT NULL,
  price          DECIMAL(10,2) NOT NULL,
  is_available   TINYINT(1)    NOT NULL DEFAULT 1,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_canteen_items_institution_id (institution_id),
  CONSTRAINT fk_canteen_items_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS canteen_orders (
  id             CHAR(36)      NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)      NOT NULL,
  student_id     CHAR(36)      NOT NULL,
  items          JSON          NOT NULL,
  total_amount   DECIMAL(10,2) NOT NULL,
  status         VARCHAR(20)   NOT NULL DEFAULT 'completed',
  created_by     CHAR(36)      NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_canteen_orders_institution_id (institution_id),
  KEY idx_canteen_orders_student_id (student_id),
  CONSTRAINT fk_canteen_orders_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_canteen_orders_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Substitute Teacher Management
CREATE TABLE IF NOT EXISTS substitute_assignments (
  id                  CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id      CHAR(36)     NOT NULL,
  timetable_slot_id   CHAR(36)     NOT NULL,
  original_teacher_id CHAR(36)     NULL,
  substitute_teacher_id CHAR(36)   NOT NULL,
  assignment_date     DATE         NOT NULL,
  reason              VARCHAR(255),
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_substitute_slot_date (timetable_slot_id, assignment_date),
  KEY idx_substitute_institution_id (institution_id),
  CONSTRAINT fk_substitute_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_substitute_slot FOREIGN KEY (timetable_slot_id) REFERENCES timetable_slots (id) ON DELETE CASCADE,
  CONSTRAINT fk_substitute_teacher FOREIGN KEY (substitute_teacher_id) REFERENCES teachers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Health / Nurse Records
CREATE TABLE IF NOT EXISTS health_records (
  id                     CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id         CHAR(36)     NOT NULL,
  student_id             CHAR(36)     NOT NULL,
  blood_group            VARCHAR(10),
  allergies              TEXT,
  medical_conditions     TEXT,
  emergency_contact_name VARCHAR(200),
  emergency_contact_phone VARCHAR(30),
  notes                  TEXT,
  updated_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_health_records_student (student_id),
  KEY idx_health_records_institution_id (institution_id),
  CONSTRAINT fk_health_records_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_health_records_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS infirmary_visits (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  student_id     CHAR(36)     NOT NULL,
  visit_date     DATE         NOT NULL,
  reason         VARCHAR(255) NOT NULL,
  treatment      TEXT,
  notes          TEXT,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_infirmary_visits_institution_id (institution_id),
  KEY idx_infirmary_visits_student_id (student_id),
  CONSTRAINT fk_infirmary_visits_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_infirmary_visits_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
