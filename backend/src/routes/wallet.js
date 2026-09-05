/**
 * Canteen & Student Wallet — a per-student prepaid balance, topped up by
 * staff/parent and spent on canteen items. Every balance change goes
 * through `withTransaction` with a `FOR UPDATE` lock so a topup and a
 * purchase can never race each other into an inconsistent balance.
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db, { withTransaction } from '../lib/db.js';
import { requireAuthenticatedProfile } from '../middleware/auth.js';
import { requireInstitution } from '../middleware/tenant.js';
import { requireFeature } from '../middleware/feature.js';
import { requirePermission } from '../auth/permissions.js';
import { asyncHandler, ApiError } from '../lib/errors.js';
import { validate } from '../lib/validate.js';
import { findOwnedOrFail } from '../lib/query.js';
import { z, optionalText, idParam, money } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('canteen_wallet'));

async function getOrCreateWallet(connection, institutionId, studentId) {
  const [rows] = await connection.execute(
    'SELECT * FROM student_wallets WHERE student_id = ? AND institution_id = ? FOR UPDATE',
    [studentId, institutionId]
  );
  if (rows[0]) return rows[0];

  const id = uuidv4();
  await connection.execute(
    'INSERT INTO student_wallets (id, institution_id, student_id, balance) VALUES (?, ?, ?, 0)',
    [id, institutionId, studentId]
  );
  const [created] = await connection.execute('SELECT * FROM student_wallets WHERE id = ?', [id]);
  return created[0];
}

router.get(
  '/:studentId',
  requirePermission('students.read'),
  validate({ params: z.object({ studentId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'students', req.params.studentId, req.institutionId);
    const [rows] = await db.execute('SELECT * FROM student_wallets WHERE student_id = ? AND institution_id = ?', [
      req.params.studentId, req.institutionId,
    ]);
    const [transactions] = await db.execute(
      'SELECT * FROM wallet_transactions WHERE student_id = ? AND institution_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.params.studentId, req.institutionId]
    );
    res.json({ wallet: rows[0] || { balance: 0 }, transactions });
  })
);

router.post(
  '/:studentId/topup',
  requirePermission('students.write'),
  validate({ params: z.object({ studentId: z.string().uuid() }), body: z.object({ amount: money, description: optionalText(255) }) }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'students', req.params.studentId, req.institutionId);

    const result = await withTransaction(async (connection) => {
      const wallet = await getOrCreateWallet(connection, req.institutionId, req.params.studentId);
      const newBalance = Number(wallet.balance) + Number(req.body.amount);
      await connection.execute('UPDATE student_wallets SET balance = ? WHERE id = ?', [newBalance, wallet.id]);
      await connection.execute(
        `INSERT INTO wallet_transactions (id, institution_id, student_id, type, amount, balance_after, description, created_by)
         VALUES (?, ?, ?, 'topup', ?, ?, ?, ?)`,
        [uuidv4(), req.institutionId, req.params.studentId, req.body.amount, newBalance, req.body.description, req.auth.profile.id]
      );
      return { balance: newBalance };
    });

    res.json(result);
  })
);

router.get(
  '/items/list',
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      'SELECT * FROM canteen_items WHERE institution_id = ? AND is_available = 1 ORDER BY name',
      [req.institutionId]
    );
    res.json(rows);
  })
);

router.post(
  '/items',
  requirePermission('students.write'),
  validate({ body: z.object({ name: z.string().trim().min(1).max(200), price: money }) }),
  asyncHandler(async (req, res) => {
    const id = uuidv4();
    await db.execute(
      'INSERT INTO canteen_items (id, institution_id, name, price, is_available) VALUES (?, ?, ?, ?, 1)',
      [id, req.institutionId, req.body.name, req.body.price]
    );
    const created = await findOwnedOrFail(db, 'canteen_items', id, req.institutionId);
    res.status(201).json(created);
  })
);

router.delete(
  '/items/:id',
  requirePermission('students.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'canteen_items', req.params.id, req.institutionId);
    await db.execute('DELETE FROM canteen_items WHERE id = ? AND institution_id = ?', [req.params.id, req.institutionId]);
    res.json({ success: true });
  })
);

router.post(
  '/:studentId/purchase',
  requirePermission('students.write'),
  validate({
    params: z.object({ studentId: z.string().uuid() }),
    body: z.object({ items: z.array(z.object({ id: z.string().uuid(), name: z.string(), price: z.number(), qty: z.number().int().min(1) })).min(1) }),
  }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'students', req.params.studentId, req.institutionId);

    const total = req.body.items.reduce((sum, item) => sum + item.price * item.qty, 0);

    const result = await withTransaction(async (connection) => {
      const wallet = await getOrCreateWallet(connection, req.institutionId, req.params.studentId);
      if (Number(wallet.balance) < total) {
        throw ApiError.conflict(`Insufficient balance. Available: ${wallet.balance}, needed: ${total}`);
      }

      const newBalance = Number(wallet.balance) - total;
      await connection.execute('UPDATE student_wallets SET balance = ? WHERE id = ?', [newBalance, wallet.id]);
      await connection.execute(
        `INSERT INTO wallet_transactions (id, institution_id, student_id, type, amount, balance_after, description, created_by)
         VALUES (?, ?, ?, 'purchase', ?, ?, ?, ?)`,
        [uuidv4(), req.institutionId, req.params.studentId, total, newBalance, `Canteen order (${req.body.items.length} item(s))`, req.auth.profile.id]
      );
      const orderId = uuidv4();
      await connection.execute(
        `INSERT INTO canteen_orders (id, institution_id, student_id, items, total_amount, status, created_by)
         VALUES (?, ?, ?, ?, ?, 'completed', ?)`,
        [orderId, req.institutionId, req.params.studentId, JSON.stringify(req.body.items), total, req.auth.profile.id]
      );
      return { order_id: orderId, total, balance: newBalance };
    });

    res.status(201).json(result);
  })
);

export default router;
