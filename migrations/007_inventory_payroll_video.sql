-- ============================================================
-- CyberMilo — migration 007: Inventory, HR & Payroll, Video Classes
--
-- Custom Report Builder needs no new tables (it queries existing data).
-- Custom Branding needs no new tables (institutions.settings.branding via
-- the existing PUT /institutions/settings route already accepts it).
-- Certificates is already covered by the existing `certifications` table.
-- Idempotent: safe to re-run.
-- ============================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS inventory_items (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  name           VARCHAR(255) NOT NULL,
  category       VARCHAR(100),
  unit           VARCHAR(30)  NOT NULL DEFAULT 'pcs',
  quantity       INT          NOT NULL DEFAULT 0,
  reorder_level  INT          NOT NULL DEFAULT 0,
  location       VARCHAR(150),
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_inventory_items_institution (institution_id),
  CONSTRAINT fk_inventory_items_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)     NOT NULL,
  item_id        CHAR(36)     NOT NULL,
  type           VARCHAR(10)  NOT NULL,
  quantity       INT          NOT NULL,
  note           VARCHAR(255),
  created_by     CHAR(36)     NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_inventory_transactions_institution (institution_id),
  KEY idx_inventory_transactions_item (item_id),
  CONSTRAINT fk_inventory_transactions_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_inventory_transactions_item FOREIGN KEY (item_id) REFERENCES inventory_items (id) ON DELETE CASCADE,
  CONSTRAINT fk_inventory_transactions_creator FOREIGN KEY (created_by) REFERENCES user_profiles (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_records (
  id             CHAR(36)      NOT NULL DEFAULT (UUID()),
  institution_id CHAR(36)      NOT NULL,
  teacher_id     CHAR(36)      NOT NULL,
  pay_month      CHAR(7)       NOT NULL,
  basic_pay      DECIMAL(10,2) NOT NULL DEFAULT 0,
  allowances     DECIMAL(10,2) NOT NULL DEFAULT 0,
  deductions     DECIMAL(10,2) NOT NULL DEFAULT 0,
  net_pay        DECIMAL(10,2) NOT NULL DEFAULT 0,
  status         VARCHAR(20)   NOT NULL DEFAULT 'pending',
  paid_on        DATE          NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_teacher_month (teacher_id, pay_month),
  KEY idx_payroll_records_institution (institution_id),
  CONSTRAINT fk_payroll_records_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_payroll_records_teacher FOREIGN KEY (teacher_id) REFERENCES teachers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS video_classes (
  id               CHAR(36)     NOT NULL DEFAULT (UUID()),
  institution_id   CHAR(36)     NOT NULL,
  title            VARCHAR(255) NOT NULL,
  subject          VARCHAR(100),
  class_name       VARCHAR(50),
  teacher_id       CHAR(36)     NULL,
  meeting_link     VARCHAR(500) NOT NULL,
  scheduled_at     DATETIME     NOT NULL,
  duration_minutes INT          NOT NULL DEFAULT 40,
  status           VARCHAR(20)  NOT NULL DEFAULT 'scheduled',
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_video_classes_institution (institution_id),
  CONSTRAINT fk_video_classes_institution FOREIGN KEY (institution_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_video_classes_teacher FOREIGN KEY (teacher_id) REFERENCES teachers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
