/**
 * Per-plan limit overrides.
 *
 * PLAN_LIMITS in features.js are the shipped defaults; this lets the admin
 * console tune a plan's seat/student/AI-credit ceilings from the DB without
 * a code deploy. Kept as a synchronous in-memory cache (refreshed on boot
 * and after every write) so `getEffectivePlanLimits` is a drop-in
 * replacement for the old synchronous `getPlanLimits` at every call site.
 */
import db from '../lib/db.js';
import { PLAN_LIMITS } from './features.js';

let cache = {};

export async function refreshPlanOverrides() {
  const [rows] = await db.query('SELECT plan_key, max_users, max_students, ai_credits FROM plan_overrides');
  const next = {};
  for (const row of rows) {
    next[row.plan_key] = {
      users: row.max_users,
      students: row.max_students,
      aiCredits: row.ai_credits,
    };
  }
  cache = next;
}

export function getEffectivePlanLimits(plan = 'free') {
  const base = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const override = cache[plan];
  if (!override) return base;
  return {
    users: override.users ?? base.users,
    students: override.students ?? base.students,
    aiCredits: override.aiCredits ?? base.aiCredits,
  };
}

export function getPlanOverride(plan) {
  return cache[plan] || { users: null, students: null, aiCredits: null };
}
