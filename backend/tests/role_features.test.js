/**
 * Per-role feature restriction and the plan seat-limit hard block.
 *
 * The subtlety worth testing directly: "no override" and "override that
 * happens to list everything" must NOT be the same as "restricted to
 * nothing" — an empty array is a real, intentional choice (block this role
 * from everything), while an absent key means "inherit the plan".
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sanitizeRoleFeatures, getEffectiveFeatureMap, isFeatureEnabledForRole,
  RESTRICTABLE_ROLES, getPlanFeatureMap,
} from '../src/saas/features.js';

const growthInstitution = { subscription_plan: 'growth', settings: {} };

test('a role with no override inherits every feature the plan enables', () => {
  const effective = getEffectiveFeatureMap(growthInstitution, 'teacher');
  const planMap = getPlanFeatureMap('growth');
  assert.deepEqual(effective, planMap);
});

test('a role override narrows the plan, never widens it', () => {
  const institution = {
    ...growthInstitution,
    settings: { role_features: { teacher: ['students', 'attendance', 'scholarships'] } },
  };
  const effective = getEffectiveFeatureMap(institution, 'teacher');

  assert.equal(effective.students, true);
  assert.equal(effective.attendance, true);
  // 'scholarships' is not in the growth plan at all — listing it in the
  // override must not grant something the plan never included.
  assert.equal(effective.scholarships, false);
  // Everything else the plan has, but the admin didn't list, is blocked.
  assert.equal(effective.fees, false);
  assert.equal(effective.exams, false);
});

test('an explicit empty list blocks the role from everything', () => {
  const institution = { ...growthInstitution, settings: { role_features: { teacher: [] } } };
  const effective = getEffectiveFeatureMap(institution, 'teacher');
  assert.ok(Object.values(effective).every((enabled) => enabled === false));
});

test('institution_admin and principal are never restricted', () => {
  const institution = { ...growthInstitution, settings: { role_features: { teacher: [] } } };
  for (const role of ['institution_admin', 'principal', 'super_admin']) {
    const effective = getEffectiveFeatureMap(institution, role);
    assert.deepEqual(effective, getPlanFeatureMap('growth'));
  }
});

test('isFeatureEnabledForRole matches the effective map', () => {
  const institution = {
    ...growthInstitution,
    settings: { role_features: { staff: ['leads', 'admissions'] } },
  };
  assert.equal(isFeatureEnabledForRole(institution, 'staff', 'leads'), true);
  assert.equal(isFeatureEnabledForRole(institution, 'staff', 'fees'), false);
  assert.equal(isFeatureEnabledForRole(institution, 'teacher', 'fees'), true); // untouched role
});

test('a role restriction cannot resurrect a feature the plan dropped', () => {
  // Downgrade from growth to starter after the admin already restricted
  // teacher to a set that included a growth-only feature.
  const institution = {
    subscription_plan: 'starter',
    settings: { role_features: { teacher: ['students', 'programs'] } }, // 'programs' isn't in starter
  };
  assert.equal(isFeatureEnabledForRole(institution, 'teacher', 'programs'), false);
  assert.equal(isFeatureEnabledForRole(institution, 'teacher', 'students'), true);
});

test('sanitizeRoleFeatures drops unknown roles and unknown/planned feature keys', () => {
  const clean = sanitizeRoleFeatures({
    teacher: ['students', 'not_a_real_feature', 'payments'], // payments is 'planned', not live
    principal: ['students'], // not a restrictable role — dropped entirely
    not_a_role: ['students'],
  });
  assert.deepEqual(Object.keys(clean), ['teacher']);
  assert.deepEqual(clean.teacher, ['students']);
});

test('sanitizeRoleFeatures ignores a non-array value instead of throwing', () => {
  const clean = sanitizeRoleFeatures({ teacher: 'not-an-array', staff: null });
  assert.deepEqual(clean, {});
});

test('sanitizeRoleFeatures de-duplicates', () => {
  const clean = sanitizeRoleFeatures({ teacher: ['students', 'students', 'fees'] });
  assert.deepEqual(clean.teacher.sort(), ['fees', 'students']);
});

test('RESTRICTABLE_ROLES excludes both admin tiers', () => {
  assert.ok(!RESTRICTABLE_ROLES.includes('institution_admin'));
  assert.ok(!RESTRICTABLE_ROLES.includes('principal'));
  assert.ok(!RESTRICTABLE_ROLES.includes('super_admin'));
});
