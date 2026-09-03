/**
 * Library — book catalog and issue/return workflow.
 *
 * A book's `available_copies` is the source of truth for whether it can be
 * issued; issuing and returning both adjust it inside a transaction so two
 * concurrent issues can never oversell the last copy.
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
router.use(requireFeature('library'));

const FINE_PER_DAY = 5;
const BOOK_UPDATABLE = ['title', 'author', 'isbn', 'category', 'publisher', 'total_copies', 'shelf_location'];

const bookSchema = z.object({
  title: z.string().trim().min(1).max(255),
  author: optionalText(255),
  isbn: optionalText(50),
  category: optionalText(100),
  publisher: optionalText(255),
  total_copies: z.coerce.number().int().min(1).max(1000).default(1),
  shelf_location: optionalText(100),
});

router.get(
  '/books',
  requirePermission('students.read'),
  asyncHandler(async (req, res) => {
    const search = req.query.search ? `%${req.query.search}%` : null;
    const [rows] = await db.execute(
      `SELECT * FROM library_books
        WHERE institution_id = ?
          AND (? IS NULL OR title LIKE ? OR author LIKE ? OR isbn LIKE ?)
        ORDER BY title`,
      [req.institutionId, search, search, search, search]
    );
    res.json(rows);
  })
);

router.post(
  '/books',
  requirePermission('students.write'),
  validate({ body: bookSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const id = uuidv4();
    await db.execute(
      `INSERT INTO library_books
         (id, institution_id, title, author, isbn, category, publisher, total_copies, available_copies, shelf_location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, req.institutionId, body.title, body.author, body.isbn, body.category,
        body.publisher, body.total_copies, body.total_copies, body.shelf_location,
      ]
    );
    const book = await findOwnedOrFail(db, 'library_books', id, req.institutionId);
    res.status(201).json(book);
  })
);

router.put(
  '/books/:id',
  requirePermission('students.write'),
  validate({ params: idParam, body: partialUpdate(bookSchema) }),
  asyncHandler(async (req, res) => {
    const existing = await findOwnedOrFail(db, 'library_books', req.params.id, req.institutionId);

    const payload = { ...req.body };
    if (payload.total_copies !== undefined) {
      // Copies added/removed from the shelf move available_copies by the
      // same delta, so an already-issued copy is never silently un-issued.
      const delta = payload.total_copies - existing.total_copies;
      const nextAvailable = existing.available_copies + delta;
      if (nextAvailable < 0) {
        throw ApiError.conflict('Cannot reduce total copies below the number currently issued.');
      }
      await db.execute('UPDATE library_books SET available_copies = ? WHERE id = ?', [nextAvailable, req.params.id]);
    }

    const update = buildUpdate(payload, BOOK_UPDATABLE);
    if (update) {
      await db.execute(
        `UPDATE library_books SET ${update.sql} WHERE id = ? AND institution_id = ?`,
        [...update.params, req.params.id, req.institutionId]
      );
    }

    const book = await findOwnedOrFail(db, 'library_books', req.params.id, req.institutionId);
    res.json(book);
  })
);

router.delete(
  '/books/:id',
  requirePermission('students.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await findOwnedOrFail(db, 'library_books', req.params.id, req.institutionId);
    const [[{ activeIssues }]] = await db.execute(
      `SELECT COUNT(*) AS activeIssues FROM library_issues WHERE book_id = ? AND status = 'issued'`,
      [req.params.id]
    );
    if (Number(activeIssues) > 0) {
      throw ApiError.conflict('Cannot delete a book with copies currently issued.');
    }
    await db.execute('DELETE FROM library_books WHERE id = ? AND institution_id = ?', [req.params.id, req.institutionId]);
    res.json({ success: true });
  })
);

// -------------------------------------------------------- issues
router.get(
  '/issues',
  requirePermission('students.read'),
  asyncHandler(async (req, res) => {
    const status = ['issued', 'returned'].includes(req.query.status) ? req.query.status : null;
    const [rows] = await db.execute(
      `SELECT li.*, b.title AS book_title, b.author AS book_author,
              s.first_name, s.last_name, s.admission_no, s.class_name
         FROM library_issues li
         JOIN library_books b ON b.id = li.book_id
         JOIN students s ON s.id = li.student_id
        WHERE li.institution_id = ? AND (? IS NULL OR li.status = ?)
        ORDER BY li.status = 'issued' DESC, li.due_date ASC`,
      [req.institutionId, status, status]
    );
    res.json(rows);
  })
);

router.post(
  '/issues',
  requirePermission('students.write'),
  validate({
    body: z.object({
      book_id: z.string().uuid(),
      student_id: z.string().uuid(),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
    }),
  }),
  asyncHandler(async (req, res) => {
    const institutionId = req.institutionId;

    const issue = await withTransaction(async (connection) => {
      const [bookRows] = await connection.execute(
        'SELECT * FROM library_books WHERE id = ? AND institution_id = ? FOR UPDATE',
        [req.body.book_id, institutionId]
      );
      const book = bookRows[0];
      if (!book) throw ApiError.notFound('Book not found');
      if (book.available_copies < 1) throw ApiError.conflict(`"${book.title}" has no copies available.`);

      const [studentRows] = await connection.execute(
        'SELECT id FROM students WHERE id = ? AND institution_id = ?',
        [req.body.student_id, institutionId]
      );
      if (studentRows.length === 0) throw ApiError.notFound('Student not found in this institution');

      await connection.execute('UPDATE library_books SET available_copies = available_copies - 1 WHERE id = ?', [book.id]);

      const id = uuidv4();
      await connection.execute(
        `INSERT INTO library_issues (id, institution_id, book_id, student_id, issued_at, due_date, status)
         VALUES (?, ?, ?, ?, CURDATE(), ?, 'issued')`,
        [id, institutionId, book.id, req.body.student_id, req.body.due_date]
      );

      const [created] = await connection.execute('SELECT * FROM library_issues WHERE id = ?', [id]);
      return created[0];
    });

    res.status(201).json(issue);
  })
);

router.post(
  '/issues/:id/return',
  requirePermission('students.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const institutionId = req.institutionId;

    const result = await withTransaction(async (connection) => {
      const [issueRows] = await connection.execute(
        'SELECT * FROM library_issues WHERE id = ? AND institution_id = ? FOR UPDATE',
        [req.params.id, institutionId]
      );
      const issue = issueRows[0];
      if (!issue) throw ApiError.notFound('Issue record not found');
      if (issue.status === 'returned') throw ApiError.conflict('This book was already returned.');

      const overdueDays = Math.max(0, Math.floor((Date.now() - new Date(issue.due_date).getTime()) / 86400000));
      const fine = overdueDays * FINE_PER_DAY;

      await connection.execute(
        `UPDATE library_issues SET status = 'returned', returned_at = CURDATE(), fine_amount = ? WHERE id = ?`,
        [fine, issue.id]
      );
      await connection.execute('UPDATE library_books SET available_copies = available_copies + 1 WHERE id = ?', [issue.book_id]);

      const [updated] = await connection.execute('SELECT * FROM library_issues WHERE id = ?', [issue.id]);
      return updated[0];
    });

    res.json(result);
  })
);

export default router;
