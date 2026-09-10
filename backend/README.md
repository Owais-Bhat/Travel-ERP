# CyberMilo Admin API

Secure backend for SaaS/platform account operations. This server uses the Supabase service-role key, so it must run server-side only.

## Setup

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Required env:

```text
PORT=5000
FRONTEND_ORIGIN=http://localhost:5173
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Never put `SUPABASE_SERVICE_ROLE_KEY` in the Vite frontend.

## Seed Demo Data

After applying `supabase_schema.sql` in Supabase and filling `.env`, run:

```bash
npm run seed:demo
```

This creates or refreshes:

- one `super_admin`
- one demo school institution
- one institution admin
- teachers
- classes
- students
- 7 days of attendance
- fee payments
- exams
- admissions
- activity logs

Default demo credentials:

```text
Super admin: superadmin@cybermilo.test / CyberMilo@123
School admin: admin@greenvalley.test / SchoolAdmin@123
```

Run the Phase 1 smoke check after seeding and while the backend is running:

```bash
npm run smoke:phase1
```

The smoke check verifies:

- backend `/health`
- super admin login
- school admin login
- expected roles in `user_profiles`
- demo institution exists
- minimum demo counts for students, teachers, classes, attendance, fees, exams, admissions, and activity logs

Override these with:

```text
DEMO_SUPER_ADMIN_EMAIL=
DEMO_SUPER_ADMIN_PASSWORD=
DEMO_SCHOOL_ADMIN_EMAIL=
DEMO_SCHOOL_ADMIN_PASSWORD=
```

## Auth

Every `/api/admin/*` endpoint requires:

```text
Authorization: Bearer <supabase-user-access-token>
```

The backend verifies the token, loads `user_profiles`, and allows only active users with:

```text
role = super_admin
```

## Endpoints

### GET `/api/admin/institutions`

Returns all institutions plus user counts.

### POST `/api/admin/institutions`

Creates an institution, creates its first `institution_admin` auth user, and inserts a linked profile.

Body:

```json
{
  "name": "Green Valley School",
  "type": "School",
  "email": "school@example.com",
  "phone": "9999999999",
  "address": "Full address",
  "subscription_plan": "free",
  "adminEmail": "admin@example.com",
  "adminPassword": "ChangeMe123",
  "adminFirstName": "School",
  "adminLastName": "Admin"
}
```

### POST `/api/admin/invite-user`

Invites a user into an institution and creates/updates their profile.

Body:

```json
{
  "institutionId": "uuid",
  "email": "teacher@example.com",
  "role": "teacher",
  "firstName": "Ayesha",
  "lastName": "Khan",
  "redirectTo": "http://localhost:5173/login"
}
```

### POST `/api/admin/change-plan`

Updates an institution subscription plan.

Body:

```json
{
  "institutionId": "uuid",
  "plan": "growth"
}
```

Allowed plans: `free`, `starter`, `growth`, `pro`, `enterprise`.

### POST `/api/admin/suspend-institution`

Stores suspension state in `institutions.settings` and activates/deactivates all tenant users.

Body:

```json
{
  "institutionId": "uuid",
  "suspended": true,
  "reason": "Payment overdue"
}
```

## Scaling past one process

A single instance is the right default and needs nothing below. Move to
more than one process (a VPS/dedicated server, not a managed Node host like
Hostinger's own app panel, which runs `npm start` itself) once traffic
outgrows one CPU core:

1. **Run multiple instances with PM2:**
   ```bash
   npm install -g pm2
   pm2 start ecosystem.config.cjs
   ```
   `PM2_INSTANCES` env var picks the worker count (defaults to one per CPU core).

2. **Point rate limiting at Redis** so every instance shares the same
   counters instead of each keeping its own (see `lib/redis.js`):
   ```text
   REDIS_URL=redis://localhost:6379
   ```

3. Put a load balancer (Nginx/HAProxy) in front of the instances, and raise
   `MYSQL_POOL_SIZE` to match — check the MySQL server's own
   `max_connections` first.
