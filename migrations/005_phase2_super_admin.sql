-- ============================================================
-- CyberMilo — migration 005: Phase 2 super-admin features
--
-- Adds storage for platform announcements (broadcast to tenant users)
-- and per-plan limit overrides (so pricing tiers can be tuned from the
-- admin console without a code deploy). Idempotent: safe to re-run.
-- ============================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS platform_announcements (
  id              CHAR(36)     NOT NULL DEFAULT (UUID()),
  title           VARCHAR(255) NOT NULL,
  body            TEXT         NOT NULL,
  severity        VARCHAR(20)  NOT NULL DEFAULT 'info',
  target_type     VARCHAR(20)  NOT NULL DEFAULT 'all',
  target_institution_ids JSON  NULL,
  recipient_count INT          NOT NULL DEFAULT 0,
  created_by      CHAR(36)     NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_platform_announcements_created (created_at DESC),
  CONSTRAINT fk_platform_announcements_creator FOREIGN KEY (created_by) REFERENCES user_profiles (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Platform-level admin actions (announcements, plan-limit edits, team
-- management) have no single tenant to attach to. institution_id was
-- NOT NULL, which silently dropped every such audit event (recordAuditEvent
-- no-ops when institutionId is missing) — widen it so these show up in the
-- Audit Log like everything else. NULL values aren't checked against the FK,
-- so this is safe without touching the constraint itself.
ALTER TABLE activity_log MODIFY institution_id CHAR(36) NULL;

CREATE TABLE IF NOT EXISTS plan_overrides (
  plan_key     VARCHAR(30) NOT NULL,
  max_users    INT         NULL,
  max_students INT         NULL,
  ai_credits   INT         NULL,
  updated_by   CHAR(36)    NULL,
  updated_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (plan_key),
  CONSTRAINT fk_plan_overrides_updater FOREIGN KEY (updated_by) REFERENCES user_profiles (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
