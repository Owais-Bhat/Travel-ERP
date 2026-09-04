import path from 'node:path';
import fs from 'node:fs';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import express from 'express';

import { env, verifyEnv } from './lib/env.js';
import { pingDatabase } from './lib/db.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';

import adminRouter from './routes/admin.js';
import usageRouter from './routes/usage.js';
import usersRouter from './routes/users.js';
import authRouter from './routes/auth.js';
import dashboardRouter from './routes/dashboard.js';
import institutionsRouter from './routes/institutions.js';
import studentsRouter from './routes/students.js';
import teachersRouter from './routes/teachers.js';
import classesRouter from './routes/classes.js';
import attendanceRouter from './routes/attendance.js';
import feesRouter from './routes/fees.js';
import examsRouter from './routes/exams.js';
import admissionsRouter from './routes/admissions.js';
import activityRouter from './routes/activity.js';
import programsRouter from './routes/programs.js';
import certificationsRouter from './routes/certifications.js';
import scholarshipsRouter from './routes/scholarships.js';
import referralsRouter from './routes/referrals.js';
import leadsRouter from './routes/leads.js';
import documentsRouter from './routes/documents.js';
import reportsRouter from './routes/reports.js';
import notificationsRouter from './routes/notifications.js';
import communicationRouter from './routes/communication.js';
import lmsRouter from './routes/lms.js';
import transportRouter from './routes/transport.js';
import libraryRouter from './routes/library.js';
import hostelRouter from './routes/hostel.js';
import inventoryRouter from './routes/inventory.js';
import payrollRouter from './routes/payroll.js';
import videoClassesRouter from './routes/videoClasses.js';
import reportsBuilderRouter from './routes/reportsBuilder.js';
import biometricRouter from './routes/biometric.js';
import biometricWebhookRouter from './routes/biometricWebhook.js';
import timetableRouter from './routes/timetable.js';
import homeworkRouter from './routes/homework.js';
import calendarRouter from './routes/calendar.js';
import leaveRouter from './routes/leave.js';
import disciplineRouter from './routes/discipline.js';
import visitorsRouter from './routes/visitors.js';
import facilitiesRouter from './routes/facilities.js';
import alumniRouter from './routes/alumni.js';
import reportCardsRouter from './routes/reportCards.js';
import admissionsPublicRouter from './routes/admissionsPublic.js';
import ptmRouter from './routes/ptm.js';
import quizRouter from './routes/quiz.js';
import surveysRouter from './routes/surveys.js';
import branchesRouter from './routes/branches.js';

const app = express();

if (env.trustProxy) app.set('trust proxy', env.trustProxy);
app.disable('x-powered-by');

app.use(helmet({
  // The API serves JSON plus uploaded files; it never renders HTML, so the
  // default CSP would only get in the way of the separately hosted SPA.
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(compression());
app.use(morgan(env.logFormat, {
  skip: (req) => req.path === '/health',
}));

// FRONTEND_ORIGIN accepts a comma-separated list, e.g.
// "http://localhost:5173,https://school.networkingexperts.in"
app.use(cors({
  origin: (origin, callback) => {
    // Allow no-origin requests (curl, server-to-server) and any listed origin
    if (!origin || env.allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Uploaded documents. Served read-only; filenames are server-generated so a
// user-supplied name can never escape the directory.
const uploadsDir = path.resolve(process.cwd(), env.uploads.dir);
fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir, {
  index: false,
  dotfiles: 'deny',
  maxAge: '1d',
}));

const apiLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Slow down and try again shortly.' },
});

// Credential endpoints get a much tighter budget than the rest of the API.
const authLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.authMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many authentication attempts. Try again later.' },
});

app.get('/health', async (req, res) => {
  try {
    await pingDatabase();
    res.json({ ok: true, service: 'cybermilo-api', database: 'up', env: env.nodeEnv });
  } catch (error) {
    res.status(503).json({ ok: false, service: 'cybermilo-api', database: 'down', error: error.code || error.message });
  }
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/password', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);

app.use('/api/auth', authRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/institutions', institutionsRouter);
app.use('/api/students', studentsRouter);
app.use('/api/teachers', teachersRouter);
app.use('/api/classes', classesRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/fees', feesRouter);
app.use('/api/exams', examsRouter);
app.use('/api/admissions', admissionsRouter);
app.use('/api/activity', activityRouter);
app.use('/api/admin', adminRouter);
app.use('/api/usage', usageRouter);
app.use('/api/users', usersRouter);

// EIMS modules
app.use('/api/programs', programsRouter);
app.use('/api/certifications', certificationsRouter);
app.use('/api/scholarships', scholarshipsRouter);
app.use('/api/referrals', referralsRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/communication', communicationRouter);
app.use('/api/lms', lmsRouter);
app.use('/api/transport', transportRouter);
app.use('/api/library', libraryRouter);
app.use('/api/hostel', hostelRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/payroll', payrollRouter);
app.use('/api/video-classes', videoClassesRouter);
app.use('/api/reports-builder', reportsBuilderRouter);
app.use('/api/biometric', biometricRouter);
// Public — a scanner authenticates with its own device_code + api_key, not a user JWT.
app.use('/api/biometric-webhook', biometricWebhookRouter);
app.use('/api/timetable', timetableRouter);
app.use('/api/homework', homeworkRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/leave', leaveRouter);
app.use('/api/discipline', disciplineRouter);
app.use('/api/visitors', visitorsRouter);
app.use('/api/facilities', facilitiesRouter);
app.use('/api/alumni', alumniRouter);
app.use('/api/report-cards', reportCardsRouter);
app.use('/api/admissions-public', admissionsPublicRouter);
app.use('/api/ptm', ptmRouter);
app.use('/api/quizzes', quizRouter);
app.use('/api/surveys', surveysRouter);
app.use('/api/branches', branchesRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
