/**
 * Demo seed.
 *
 * Creates a platform super admin plus one fully populated institution, so
 * every screen — including the EIMS modules — has something real to show.
 * Idempotent: re-running skips anything that already exists.
 *
 *   npm run seed
 *   npm run seed -- --reset   drop the demo tenant first
 */
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import db from '../src/lib/db.js';

const RESET = process.argv.includes('--reset');
const BCRYPT_ROUNDS = 12;

const DEMO = {
  superAdmin: {
    email: process.env.DEMO_SUPER_ADMIN_EMAIL || 'superadmin@cybermilo.test',
    password: process.env.DEMO_SUPER_ADMIN_PASSWORD || 'CyberMilo@123',
  },
  admin: {
    email: process.env.DEMO_SCHOOL_ADMIN_EMAIL || 'admin@greenvalley.test',
    password: process.env.DEMO_SCHOOL_ADMIN_PASSWORD || 'SchoolAdmin@123',
  },
  teacher: { email: 'teacher@greenvalley.test', password: 'Teacher@123' },
  staff: { email: 'staff@greenvalley.test', password: 'Staff@123' },
  institution: { name: 'Green Valley Institute of Technology' },
};

const daysAgo = (count) => {
  const date = new Date();
  date.setDate(date.getDate() - count);
  return date.toISOString().slice(0, 10);
};

const pick = (list, index) => list[index % list.length];

async function createUser({ email, password, role, firstName, lastName, institutionId }) {
  const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length > 0) {
    const [profiles] = await db.execute('SELECT * FROM user_profiles WHERE user_id = ?', [existing[0].id]);
    return { userId: existing[0].id, profileId: profiles[0]?.id, created: false };
  }

  const userId = uuidv4();
  const profileId = uuidv4();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await db.execute(
    'INSERT INTO users (id, email, password_hash, email_verified_at, password_changed_at) VALUES (?, ?, ?, NOW(), NOW())',
    [userId, email, passwordHash]
  );
  await db.execute(
    `INSERT INTO user_profiles (id, user_id, institution_id, role, first_name, last_name, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [profileId, userId, institutionId, role, firstName, lastName]
  );

  return { userId, profileId, created: true };
}

async function seed() {
  console.log(RESET ? 'Reseeding demo data…' : 'Seeding demo data…');

  if (RESET) {
    const [rows] = await db.execute('SELECT id FROM institutions WHERE name = ?', [DEMO.institution.name]);
    if (rows[0]) {
      // Cascades take care of every child table.
      await db.execute('DELETE FROM users WHERE email IN (?, ?, ?)', [
        DEMO.admin.email, DEMO.teacher.email, DEMO.staff.email,
      ]);
      await db.execute('DELETE FROM institutions WHERE id = ?', [rows[0].id]);
      console.log('  removed the previous demo tenant');
    }
  }

  // ── platform super admin ────────────────────────────────────────
  const superAdmin = await createUser({
    ...DEMO.superAdmin,
    role: 'super_admin',
    firstName: 'CyberMilo',
    lastName: 'Admin',
    institutionId: null,
  });
  console.log(`  super admin ${superAdmin.created ? 'created' : 'already present'}: ${DEMO.superAdmin.email}`);

  // ── tenant ──────────────────────────────────────────────────────
  const [existingInstitution] = await db.execute(
    'SELECT id FROM institutions WHERE name = ?',
    [DEMO.institution.name]
  );

  if (existingInstitution.length > 0) {
    console.log('  demo institution already present — pass --reset to rebuild it');
    return;
  }

  const institutionId = uuidv4();
  await db.execute(
    `INSERT INTO institutions
       (id, name, type, address, phone, email, city, state, country, website,
        billing_email, subscription_plan, subscription_status, trial_ends_at,
        verification_status, established_year, accreditation, settings)
     VALUES (?, ?, 'college', ?, ?, ?, ?, ?, 'India', ?, ?, 'pro', 'active',
             DATE_ADD(NOW(), INTERVAL 30 DAY), 'verified', 2004, 'NAAC A+',
             JSON_OBJECT('suspended', false))`,
    [
      institutionId, DEMO.institution.name, '14 Ring Road, Hinjewadi',
      '+912041234567', 'office@greenvalley.test', 'Pune', 'Maharashtra',
      'https://greenvalley.test', 'billing@greenvalley.test',
    ]
  );

  const admin = await createUser({
    ...DEMO.admin, role: 'institution_admin', firstName: 'Meera', lastName: 'Nair', institutionId,
  });
  await createUser({
    ...DEMO.teacher, role: 'teacher', firstName: 'Rahul', lastName: 'Sharma', institutionId,
  });
  const staff = await createUser({
    ...DEMO.staff, role: 'staff', firstName: 'Anita', lastName: 'Desai', institutionId,
  });

  // ── faculty ─────────────────────────────────────────────────────
  const facultyIds = [];
  const faculty = [
    ['EMP-001', 'Rahul', 'Sharma', 'Computer Science', 'Associate Professor', 11.5],
    ['EMP-002', 'Priya', 'Iyer', 'Management', 'Professor', 16],
    ['EMP-003', 'Vikram', 'Rao', 'Data Science', 'Assistant Professor', 6],
  ];
  for (const [employeeId, first, last, department, designation, years] of faculty) {
    const id = uuidv4();
    facultyIds.push(id);
    await db.execute(
      `INSERT INTO teachers
         (id, institution_id, employee_id, first_name, last_name, email, phone,
          subjects, qualification, status, department, designation, joining_date, experience_years)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
      [
        id, institutionId, employeeId, first, last,
        `${first.toLowerCase()}@greenvalley.test`, '+919812345670',
        JSON.stringify([department]), 'Ph.D.', department, designation,
        daysAgo(1200), years,
      ]
    );
  }

  // ── programs + courses ──────────────────────────────────────────
  const programSpecs = [
    ['B.Sc. Computer Science', 'BSC-CS', 'undergraduate', 'Computer Science', 36, 180000, 120],
    ['MBA in Analytics', 'MBA-AN', 'postgraduate', 'Management', 24, 450000, 60],
    ['Diploma in Data Science', 'DIP-DS', 'diploma', 'Data Science', 12, 95000, 80],
    ['Certificate in Web Development', 'CERT-WD', 'certificate', 'Computer Science', 6, 35000, 150],
  ];

  const programIds = [];
  for (const [index, [name, code, level, department, months, fee, seats]] of programSpecs.entries()) {
    const id = uuidv4();
    programIds.push(id);
    await db.execute(
      `INSERT INTO programs
         (id, institution_id, name, code, level, department, mode, duration_months,
          tuition_fee, seats_total, seats_filled, eligibility, description, coordinator_id, status)
       VALUES (?, ?, ?, ?, ?, ?, 'full_time', ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        id, institutionId, name, code, level, department, months, fee, seats,
        Math.floor(seats * 0.45),
        'Higher secondary with 55% or above',
        `${name} at ${DEMO.institution.name}.`,
        pick(facultyIds, index),
      ]
    );

    for (let semester = 1; semester <= 2; semester += 1) {
      await db.execute(
        `INSERT INTO courses
           (id, institution_id, program_id, title, code, subject, description,
            credits, semester, teacher_id, is_published)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          uuidv4(), institutionId, id,
          `${name} — Semester ${semester}`,
          `${code}-S${semester}`,
          department,
          `Core coursework for semester ${semester}.`,
          4, semester, pick(facultyIds, index + semester),
        ]
      );
    }
  }

  // ── students ────────────────────────────────────────────────────
  const firstNames = ['Aarav', 'Diya', 'Ishaan', 'Kavya', 'Rohan', 'Sara', 'Vivaan', 'Ananya', 'Arjun', 'Meher'];
  const lastNames = ['Patel', 'Sharma', 'Reddy', 'Khan', 'Menon', 'Gupta', 'Joshi', 'Bose'];
  const studentIds = [];

  for (let index = 0; index < 24; index += 1) {
    const id = uuidv4();
    studentIds.push(id);
    const first = pick(firstNames, index);
    const last = pick(lastNames, index * 3);

    await db.execute(
      `INSERT INTO students
         (id, institution_id, admission_no, first_name, last_name, email, phone,
          dob, gender, address, class_name, section, parent_name, parent_phone, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        id, institutionId, `GV-2026-${String(index + 1).padStart(4, '0')}`,
        first, last,
        `${first.toLowerCase()}.${last.toLowerCase()}${index}@student.test`,
        `+9198${String(76543210 + index).slice(0, 8)}`,
        daysAgo(7300 + index * 30),
        index % 2 === 0 ? 'male' : 'female',
        'Pune, Maharashtra',
        pick(['Year 1', 'Year 2', 'Year 3'], index),
        pick(['A', 'B'], index),
        `${pick(lastNames, index)} Parent`,
        `+9199${String(87654321 + index).slice(0, 8)}`,
      ]
    );
  }

  // ── attendance for the last 10 school days ──────────────────────
  for (let day = 1; day <= 10; day += 1) {
    const date = daysAgo(day);
    for (const [index, studentId] of studentIds.entries()) {
      // A believable ~88% attendance rate.
      const status = (index + day) % 8 === 0 ? 'absent' : (index + day) % 17 === 0 ? 'late' : 'present';
      await db.execute(
        `INSERT INTO attendance (id, institution_id, student_id, class_name, date, status, marked_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status)`,
        [uuidv4(), institutionId, studentId, pick(['Year 1', 'Year 2', 'Year 3'], index), date, status, admin.profileId]
      );
    }
  }

  // ── fees ────────────────────────────────────────────────────────
  for (const [index, studentId] of studentIds.entries()) {
    const total = pick([35000, 95000, 180000, 450000], index);
    const paid = index % 4 === 0 ? 0 : index % 3 === 0 ? Math.round(total / 2) : total;
    const status = paid === 0 ? 'pending' : paid < total ? 'partial' : 'paid';

    await db.execute(
      `INSERT INTO fee_payments
         (id, institution_id, student_id, fee_type, total_amount, paid_amount,
          due_date, payment_date, status, receipt_no)
       VALUES (?, ?, ?, 'Tuition', ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(), institutionId, studentId, total, paid,
        daysAgo(index % 3 === 0 ? -20 : 15),
        paid > 0 ? daysAgo(index + 2) : null,
        status,
        paid > 0 ? `RCP-2026-${String(index + 1).padStart(4, '0')}` : null,
      ]
    );
  }

  // ── exams + results ─────────────────────────────────────────────
  const examId = uuidv4();
  await db.execute(
    `INSERT INTO exams (id, institution_id, title, subject, class_name, exam_date, total_marks, pass_marks, status)
     VALUES (?, ?, 'Mid-term Assessment', 'Computer Science', 'Year 1', ?, 100, 40, 'completed')`,
    [examId, institutionId, daysAgo(20)]
  );
  for (const [index, studentId] of studentIds.slice(0, 12).entries()) {
    const marks = 42 + ((index * 7) % 55);
    await db.execute(
      'INSERT INTO exam_results (id, exam_id, student_id, marks_obtained, grade, remarks) VALUES (?, ?, ?, ?, ?, ?)',
      [uuidv4(), examId, studentId, marks, marks >= 75 ? 'A' : marks >= 60 ? 'B' : 'C', marks >= 40 ? 'Pass' : 'Fail']
    );
  }

  await db.execute(
    `INSERT INTO exams (id, institution_id, title, subject, class_name, exam_date, total_marks, pass_marks, status)
     VALUES (?, ?, 'End-term Examination', 'Data Science', 'Year 2', ?, 100, 40, 'upcoming')`,
    [uuidv4(), institutionId, daysAgo(-25)]
  );

  // ── referral partners ───────────────────────────────────────────
  const partnerSpecs = [
    ['Bright Futures Consultancy', 'agent', 'percentage', 8, 'BRIG-KX7M'],
    ['Nikhil Verma', 'alumni', 'fixed', 5000, 'NIKH-P3QR'],
    ['EduPath Advisors', 'consultant', 'percentage', 6, 'EDUP-T9WZ'],
  ];
  const partnerIds = [];
  for (const [name, type, commissionType, rate, code] of partnerSpecs) {
    const id = uuidv4();
    partnerIds.push(id);
    await db.execute(
      `INSERT INTO referral_partners
         (id, institution_id, name, type, email, phone, company, city,
          referral_code, commission_type, commission_rate, status)
       VALUES (?, ?, ?, ?, ?, '+919800011122', ?, 'Pune', ?, ?, ?, 'active')`,
      [id, institutionId, name, type, `${code.toLowerCase()}@partner.test`, name, code, commissionType, rate]
    );
  }

  // ── leads ───────────────────────────────────────────────────────
  const leadStages = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];
  const leadIds = [];
  for (let index = 0; index < 18; index += 1) {
    const id = uuidv4();
    leadIds.push(id);
    const stage = pick(leadStages, index);

    await db.execute(
      `INSERT INTO leads
         (id, institution_id, name, email, phone, city, source, program_id,
          interest, stage, score, budget, assigned_to, referral_partner_id,
          next_follow_up_at, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, 'Pune', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
      [
        id, institutionId,
        `${pick(firstNames, index + 3)} ${pick(lastNames, index + 5)}`,
        `lead${index}@enquiry.test`,
        `+9197${String(65432100 + index).slice(0, 8)}`,
        pick(['website', 'referral', 'walk_in', 'campaign', 'social'], index),
        pick(programIds, index),
        'Admission enquiry for the 2026 intake',
        stage,
        40 + ((index * 11) % 55),
        pick([35000, 95000, 180000, 450000], index),
        index % 2 === 0 ? staff.profileId : admin.profileId,
        index % 5 === 0 ? pick(partnerIds, index) : null,
        daysAgo(index % 4 === 0 ? 3 : -index - 1),
        admin.profileId,
        index * 5,
      ]
    );

    await db.execute(
      `INSERT INTO lead_activities (id, institution_id, lead_id, type, subject, body, performed_by)
       VALUES (?, ?, ?, 'call', 'Initial enquiry call', 'Explained the fee structure and intake dates.', ?)`,
      [uuidv4(), institutionId, id, staff.profileId]
    );
  }

  // ── admissions ──────────────────────────────────────────────────
  const admissionStatuses = ['pending', 'under_review', 'shortlisted', 'offered', 'approved', 'rejected'];
  for (let index = 0; index < 14; index += 1) {
    const admissionId = uuidv4();
    const status = pick(admissionStatuses, index);

    await db.execute(
      `INSERT INTO admissions
         (id, institution_id, application_no, applicant_name, email, phone, dob,
          class_applying, parent_name, parent_phone, address, status, program_id,
          assigned_to, source, intake_year, intake_term, documents_verified, applied_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Year 1', ?, '+919900112233', 'Pune, Maharashtra',
               ?, ?, ?, ?, 2026, 'Autumn', ?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
      [
        admissionId, institutionId, `APP-2026-${String(index + 1).padStart(4, '0')}`,
        `${pick(firstNames, index + 6)} ${pick(lastNames, index + 2)}`,
        `applicant${index}@intake.test`,
        `+9196${String(54321000 + index).slice(0, 8)}`,
        daysAgo(6600 + index * 20),
        `${pick(lastNames, index)} Parent`,
        status, pick(programIds, index),
        admin.profileId,
        pick(['website', 'walk_in', 'referral', 'direct'], index),
        index % 3 === 0 ? 1 : 0,
        index * 3,
      ]
    );

    await db.execute(
      `INSERT INTO admission_status_history
         (id, admission_id, institution_id, from_status, to_status, note, changed_by)
       VALUES (?, ?, ?, 'pending', ?, 'Seeded demo data', ?)`,
      [uuidv4(), admissionId, institutionId, status, admin.profileId]
    );
  }

  // ── scholarships ────────────────────────────────────────────────
  const schemeSpecs = [
    ['Merit Excellence 2026', 'MERIT-26', 'merit', 'percentage', 50, 10, 900000, 75, null],
    ['Need-Based Support', 'NEED-26', 'need', 'fixed', 40000, 20, 800000, null, 400000],
    ['Sports Achievers', 'SPORT-26', 'sports', 'percentage', 25, 5, 250000, 55, null],
  ];
  const schemeIds = [];
  for (const [name, code, type, awardType, awardValue, maxAwards, budget, minPct, maxIncome] of schemeSpecs) {
    const id = uuidv4();
    schemeIds.push(id);
    await db.execute(
      `INSERT INTO scholarship_schemes
         (id, institution_id, name, code, type, award_type, award_value, max_awards,
          budget_total, min_percentage, max_family_income, eligibility_notes,
          description, opens_at, closes_at, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      [
        id, institutionId, name, code, type, awardType, awardValue, maxAwards,
        budget, minPct, maxIncome,
        'Supporting documents must be verified before disbursement.',
        `${name} for the 2026 intake.`,
        daysAgo(60), daysAgo(-60), admin.profileId,
      ]
    );
  }

  const applicationStatuses = ['submitted', 'under_review', 'approved', 'rejected'];
  for (let index = 0; index < 10; index += 1) {
    const academic = 60 + ((index * 6) % 38);
    const income = 200000 + ((index * 90000) % 700000);
    const status = pick(applicationStatuses, index);
    const awarded = status === 'approved' ? 40000 : 0;

    await db.execute(
      `INSERT INTO scholarship_applications
         (id, institution_id, scheme_id, student_id, application_no, applicant_name,
          email, phone, academic_percentage, family_income, category, statement,
          eligibility_score, requested_amount, awarded_amount, status, reviewed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(), institutionId, pick(schemeIds, index), pick(studentIds, index),
        `SCH-2026-${String(index + 1).padStart(4, '0')}`,
        `${pick(firstNames, index)} ${pick(lastNames, index)}`,
        `scholar${index}@student.test`, '+919700112233',
        academic, income,
        pick(['General', 'OBC', 'SC', 'ST'], index),
        'Requesting support to continue full-time study.',
        Math.min(100, Math.round(academic * 0.6 + 20)),
        50000, awarded, status,
        status === 'submitted' ? null : admin.profileId,
      ]
    );
  }

  // ── certifications ──────────────────────────────────────────────
  for (let index = 0; index < 6; index += 1) {
    await db.execute(
      `INSERT INTO certifications
         (id, institution_id, student_id, program_id, title, certificate_no, grade,
          issued_on, file_url, issued_by, status, verification_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'issued', ?)`,
      [
        uuidv4(), institutionId, pick(studentIds, index), pick(programIds, index),
        `${pick(programSpecs, index)[0]} — Completion`,
        `CERT-2026-${String(index + 1).padStart(4, '0')}`,
        pick(['A', 'A+', 'B'], index),
        daysAgo(30 + index * 10),
        admin.profileId,
        `DEMO-${String(index + 1).padStart(4, '0')}-CERT`,
      ]
    );
  }

  // ── announcements ───────────────────────────────────────────────
  await db.execute(
    `INSERT INTO announcements (id, institution_id, title, content, priority, target_audience, created_by)
     VALUES (?, ?, 'Autumn 2026 intake now open',
             'Applications for all programs are open until the end of next month.',
             'high', 'all', ?)`,
    [uuidv4(), institutionId, admin.profileId]
  );

  console.log(`
Demo data ready.

  Platform console   ${DEMO.superAdmin.email} / ${DEMO.superAdmin.password}
  Institution admin  ${DEMO.admin.email} / ${DEMO.admin.password}
  Teacher            ${DEMO.teacher.email} / ${DEMO.teacher.password}
  Staff              ${DEMO.staff.email} / ${DEMO.staff.password}

  Change these before exposing the deployment to anyone.
`);
}

seed()
  .then(() => db.end())
  .catch((error) => {
    console.error('Seeding failed:', error.message);
    db.end().finally(() => process.exit(1));
  });
