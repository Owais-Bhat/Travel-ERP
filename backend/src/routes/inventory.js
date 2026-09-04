/**
 * Inventory — stock items and in/out transactions.
 *
 * `quantity` on the item is a running total kept in sync by every
 * transaction inside one connection, the same "adjust the balance where it
 * lives" pattern library.js uses for available_copies.
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
import { findOwnedOrFail, buildUpdate } from '../lib/query.js';
import { z, optionalText, idParam, partialUpdate } from '../validation/common.js';

const router = express.Router();

router.use(requireAuthenticatedProfile);
router.use(requireInstitution);
router.use(requireFeature('inventory'));

const ITEM_UPDATABLE = ['name', 'category', 'unit', 'reorder_level', 'location'];

const itemSchema = z.object({
  name: z.string().trim().min(1).max(255),
  category: optionalText(100),
  unit: z.string().trim().min(1).max(30).default('pcs'),
  reorder_level: z.coerce.number().int().min(0).max(100000).default(0),
  location: optionalText(150),
});

router.get(
  '/items',
  requirePermission('students.read'),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      'SELECT * FROM inventory_items WHERE institution_id = ? ORDER BY name',
      [req.institutionId]
    );
    res.json(rows);
  })
);

router.post(
  '/items',
  requirePermission('students.write'),
  validate({ body: itemSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const id = uuidv4();
    await db.execute(
      `INSERT INTO inventory_items (id, institution_id, name, category, unit, quantity, reorder_level, location)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [id, req.institutionId, body.name, body.category, body.unit, body.reorder_level, body.location]
    );
    const item = await findOwnedOrFail(db, 'inventory_items', id, req.institutionId);
    res.status(201).json(item);
  })
);

router.put(
  '/items/:id',
  requirePermission('students.write'),
  validate({ params: idParam, body: partialUpdate(itemSchema) }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'inventory_items', req.params.id, req.institutionId);
    const update = buildUpdate(req.body, ITEM_UPDATABLE);
    if (!update) throw ApiError.badRequest('No updatable fields provided');
    await db.execute(
      `UPDATE inventory_items SET ${update.sql} WHERE id = ? AND institution_id = ?`,
      [...update.params, req.params.id, req.institutionId]
    );
    const item = await findOwnedOrFail(db, 'inventory_items', req.params.id, req.institutionId);
    res.json(item);
  })
);

router.delete(
  '/items/:id',
  requirePermission('students.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'inventory_items', req.params.id, req.institutionId);
    await db.execute('DELETE FROM inventory_items WHERE id = ? AND institution_id = ?', [req.params.id, req.institutionId]);
    res.json({ success: true });
  })
);

// -------------------------------------------------------- transactions
router.get(
  '/transactions',
  requirePermission('students.read'),
  validate({ query: z.object({ item_id: z.string().uuid().optional() }) }),
  asyncHandler(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT t.*, i.name AS item_name, i.unit
         FROM inventory_transactions t
         JOIN inventory_items i ON i.id = t.item_id
        WHERE t.institution_id = ? AND (? IS NULL OR t.item_id = ?)
        ORDER BY t.created_at DESC
        LIMIT 200`,
      [req.institutionId, req.query.item_id || null, req.query.item_id || null]
    );
    res.json(rows);
  })
);

router.post(
  '/transactions',
  requirePermission('students.write'),
  validate({
    body: z.object({
      item_id: z.string().uuid(),
      type: z.enum(['in', 'out']),
      quantity: z.coerce.number().int().min(1).max(1000000),
      note: optionalText(255),
    }),
  }),
  asyncHandler(async (req, res) => {
    const institutionId = req.institutionId;

    const transaction = await withTransaction(async (connection) => {
      const [itemRows] = await connection.execute(
        'SELECT * FROM inventory_items WHERE id = ? AND institution_id = ? FOR UPDATE',
        [req.body.item_id, institutionId]
      );
      const item = itemRows[0];
      if (!item) throw ApiError.notFound('Item not found');

      const delta = req.body.type === 'in' ? req.body.quantity : -req.body.quantity;
      const nextQuantity = item.quantity + delta;
      if (nextQuantity < 0) {
        throw ApiError.conflict(`Only ${item.quantity} ${item.unit} of "${item.name}" in stock.`);
      }

      await connection.execute('UPDATE inventory_items SET quantity = ? WHERE id = ?', [nextQuantity, item.id]);

      const id = uuidv4();
      await connection.execute(
        `INSERT INTO inventory_transactions (id, institution_id, item_id, type, quantity, note, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, institutionId, item.id, req.body.type, req.body.quantity, req.body.note, req.auth?.profile?.id || null]
      );

      const [created] = await connection.execute('SELECT * FROM inventory_transactions WHERE id = ?', [id]);
      return { ...created[0], newQuantity: nextQuantity };
    });

    res.status(201).json(transaction);
  })
);

export default router;
