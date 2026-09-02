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
