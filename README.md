# CyberMilo — Education Institution Management System (EIMS)

A multi-tenant SaaS platform for universities, colleges, schools, training
institutes, consultancies and certification centres. Each institution runs in
its own tenant with plan-based feature gating, role-aware dashboards and an AI
assistance layer.

The feature set follows the EIMS domain model: institutions and verification,
admissions, students, academics, scholarships and cashback, referrals and
commissions, lead CRM, communication, and reporting.

## Repository structure

| Path | What it is |
|------|-----------|
| `src/`, `index.html`, `vite.config.js` | React 18 + Vite web app — lives at the repo root so hosts that build from the root (e.g. Hostinger) find `package.json` directly |
| `backend/` | Express (Node.js) API — every module, tenant isolation, RBAC, uploads |
| `migrations/` | Numbered, idempotent SQL migrations applied by `backend/scripts/migrate.js` |
| `mysql_schema.sql` | Base MySQL/MariaDB schema — run once on a fresh database, then apply migrations |
| `docs/` | Master plan, roadmaps, phase tracker, API and setup references |
| `assets/` | Brand assets |

## Stack

- **Frontend:** React 18, Vite 5, Tailwind CSS 4, Framer Motion, Recharts
- **Backend:** Express, MySQL (mysql2), JWT auth, zod validation, helmet, rate limiting
- **AI:** OpenRouter (multi-model LLM access)

## Design system

The UI is **neumorphic with real CSS 3D**. Everything is extruded from one
canvas colour using a paired light/shadow with a fixed top-left light source;
raised surfaces are actions, carved surfaces are inputs and state.

- `src/styles/neumorphism.css` — tokens, surfaces, controls, light/dark palettes
- `src/styles/depth3d.css` — perspective scenes, Z planes, tilt, ambient motion
- `src/hooks/useTilt3d.js` — pointer-driven tilt that writes CSS variables directly, so a pointer move never re-renders React
- `src/components/Common/Motion.jsx` — one shared spring, page transitions, scroll reveals, counters

Everything degrades to a flat, still layout under `prefers-reduced-motion`,
and heavy shadows and ambient animation are dropped below 768px.

## Quick start

### 1. Database

The quickest path is the bundled compose file, which starts MySQL 8 on port
3307 and applies `mysql_schema.sql` on first boot:

```bash
docker compose up -d
```

Using your own MySQL instead? Create the database and load the base schema:

```bash
mysql -u root -p -e "CREATE DATABASE cybermilo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
```

```bash
mysql -u root -p cybermilo < mysql_schema.sql
```

### 2. Backend

```bash
cd backend && cp .env.example .env && npm install
```

Set `JWT_SECRET` (`openssl rand -hex 32`), `MYSQL_PASSWORD` and
`FRONTEND_ORIGIN` in `backend/.env`, then:

```bash
cd backend && npm run migrate && npm run seed && npm run dev
```

### 3. Web app

```bash
cp .env.example .env && npm install && npm run dev
```

### Demo logins

`npm run seed` creates a platform admin and one fully populated institution
(programs, students, attendance, fees, exams, leads, admissions, scholarships,
referrals, certificates). Credentials are printed by the seed and configurable
in `backend/.env`. **Change them before exposing the deployment.**

## Migrations

```bash
cd backend && npm run migrate
```

- `npm run migrate -- --status` lists applied and pending migrations.
- Files are applied once, in lexical order, and recorded in `schema_migrations`
  with a checksum. An already-applied file that has been edited is skipped with
  a warning — add a new migration instead of changing history.
- Every migration is idempotent, so re-running against a partially migrated
  database is safe.
- The files also import cleanly through phpMyAdmin, which is what Hostinger
  gives you: the runner understands `DELIMITER` blocks the same way the
  phpMyAdmin importer does.

## Testing

Two layers. The unit suite needs nothing but Node:

```bash
cd backend && npm test
```

It covers the scholarship eligibility and award maths, commission
calculation, lead scoring, the SQL statement splitter, query-builder
allow-listing, the permission matrix, migration DDL (parsed against a MySQL
grammar), and the HTTP layer — auth rejection, validation, CORS, security
headers and rate limiting. The HTTP tests mount the real app without a
database, so they run anywhere.

The smoke suite drives the running API against a real database and covers the
paths that only break in integration — money accounting, multi-step
conversions, and the two security regressions below. Start the API and seed
first, then:

```bash
cd backend && npm run smoke
```

It is safe to re-run: assertions are written as deltas, not absolutes.

## Security notes

Fixed in this pass, worth knowing about if you are upgrading an existing
deployment:

- **SQL injection** in the `PUT` handlers for students, fees, admissions,
  exams and teachers. They built the `SET` clause from `Object.keys(req.body)`,
  so a request key became a raw SQL fragment. All updates now go through a
  column allow-list (`buildUpdate`).
- **Privilege escalation** via `PUT /api/institutions/settings`, which replaced
  the whole settings JSON from any authenticated account — letting a tenant
  enable every paid module and clear its own `suspended` flag. Writes are now
  permission-gated and merged into an allow-list of tenant-owned keys.
- **Dead audit logging.** `recordAuditEvent` still wrote through the Supabase
  client after the MySQL migration, so every audit event was silently dropped.
- **Silent column resets on update.** Zod keeps `.default()` on a field even
  after `.partial()`, so a `PUT` that mentioned none of the defaulted fields
  still parsed to `{ status: 'active' }` and reset that column. Update bodies
  now go through `partialUpdate()`, which strips defaults so an omitted field
  stays omitted.
- **Optional fields crashed inserts.** mysql2 rejects an `undefined` bind
  parameter instead of treating it as NULL, so omitting any optional field
  returned a 500. The pool now normalises `undefined` to SQL NULL centrally.
- Auth hardening: bcrypt cost 12, lockout after repeated failures, a password
  policy, uniform responses so login cannot enumerate accounts, forced rotation
  for admin-issued temporary passwords, and database-backed reset tokens.

### Email (optional)

Set `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` (and the rest of the `SMTP_*`
block) in `backend/.env` and inviting a user emails them their temporary
password and a sign-in link. Leave any of those unset and the app falls back
to its original behaviour — the invite endpoint still returns the temporary
password once, for the admin to hand over some other way — so this is a
drop-in upgrade, not a hard dependency.

For Gmail: create an [App Password](https://myaccount.google.com/apppasswords)
(regular account passwords are rejected over SMTP) and use port 587 with
`SMTP_HOST=smtp.gmail.com`. `backend/src/lib/mailer.js` never throws — a
bounced or misconfigured send is logged and reported back as
`emailSent: false` in the invite response, it never fails the invite itself.

Password reset (`/auth/forgot-password`) still returns its token directly
rather than emailing it — that's a separate, smaller wire-up left for later.

Still outstanding before you take payments — see `docs/PRODUCTION_ROADMAP.md`:

- AI calls still go direct from the browser with a `VITE_`-prefixed key. Move
  them behind the backend before production.
- No payment gateway; subscription status is set manually from the console.
- Error monitoring (Sentry) and automated backups are not wired up.

## Key docs

- Master plan: `docs/ERP_MASTER_PLAN.md`
- Production roadmap: `docs/PRODUCTION_ROADMAP.md`, `docs/FEATURE_ROADMAP_2026.md`
- API reference: `docs/WEBAPP_API_REFERENCE.md`
- Setup guide: `docs/WEBAPP_SETUP_GUIDE.md`
