import { MdInbox, MdSearch, MdChevronLeft, MdChevronRight } from 'react-icons/md';
import Surface from './Surface';
import Button from './Button';
import { motion, AnimatePresence } from './Motion';

/**
 * Table for list screens.
 *
 * Columns are `{ key, label, render?, align?, width?, hideBelow? }`.
 * Handles its own loading, empty and error states so every module screen
 * behaves the same way, and falls back to stacked cards on small screens
 * where a wide table would just scroll off.
 */
function Skeleton({ columns, rows = 5 }) {
  return Array.from({ length: rows }, (_, rowIndex) => (
    <tr key={rowIndex}>
      {columns.map((column) => (
        <td key={column.key} className="px-4 py-3">
          <div className="neu-skeleton h-4" style={{ width: `${45 + ((rowIndex * 13 + column.key.length * 7) % 45)}%` }} />
        </td>
      ))}
    </tr>
  ));
}

export function EmptyState({ icon: Icon = MdInbox, title, description, action }) {
  return (
    <div className="py-14 px-6 text-center">
      <span
        className="w-14 h-14 rounded-2xl inline-flex items-center justify-center mb-4"
        style={{ boxShadow: 'var(--neu-inset)', color: 'var(--neu-ink-muted)' }}
      >
        <Icon className="w-7 h-7" />
      </span>
      <p className="font-semibold mb-1" style={{ color: 'var(--neu-ink)' }}>
        {title}
      </p>
      {description && (
        <p className="text-sm mb-4 max-w-sm mx-auto" style={{ color: 'var(--neu-ink-muted)' }}>
          {description}
        </p>
      )}
      {action}
    </div>
  );
}

export default function DataTable({
  columns,
  rows = [],
  loading = false,
  error = null,
  rowKey = (row) => row.id,
  onRowClick,
  empty = {},
  pagination,
  onPageChange,
  toolbar,
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
}) {
  const hasRows = rows.length > 0;

  return (
    <Surface variant="raised" className="!p-0 overflow-hidden">
      {(toolbar || onSearchChange) && (
        <div
          className="flex flex-wrap items-center gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid var(--neu-line)' }}
        >
          {onSearchChange && (
            <div className="relative flex-1 min-w-[12rem]">
              <MdSearch
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                style={{ color: 'var(--neu-ink-muted)' }}
              />
              <input
                className="neu-input"
                // Inline, for the same stylesheet-order reason as Input.jsx.
                style={{ paddingLeft: '2.4rem' }}
                value={search ?? ''}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
              />
            </div>
          )}
          {toolbar}
        </div>
      )}

      {error && (
        <div className="neu-alert neu-alert-error m-4">
          <span>{error}</span>
        </div>
      )}

      {/* Wide screens: a real table. */}
      <div className="from-md block overflow-x-auto">
        <table className="neu-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  style={{ width: column.width, textAlign: column.align || 'left' }}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && !hasRows ? (
              <Skeleton columns={columns} />
            ) : (
              <AnimatePresence initial={false}>
                {rows.map((row, index) => (
                  <motion.tr
                    key={rowKey(row)}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(index, 8) * 0.02 }}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    style={{ cursor: onRowClick ? 'pointer' : undefined }}
                  >
                    {columns.map((column) => (
                      <td key={column.key} style={{ textAlign: column.align || 'left' }}>
                        {column.render ? column.render(row) : row[column.key] ?? '—'}
                      </td>
                    ))}
                  </motion.tr>
                ))}
              </AnimatePresence>
            )}
          </tbody>
        </table>
      </div>

      {/* Narrow screens: one card per row. */}
      <div className="upto-md">
        {loading && !hasRows ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="neu-skeleton h-16" />
            ))}
          </div>
        ) : (
          rows.map((row) => (
            <button
              key={rowKey(row)}
              type="button"
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className="w-full text-left px-4 py-3"
              style={{ borderBottom: '1px solid var(--neu-line)' }}
            >
              {columns
                .filter((column) => !column.hideOnMobile)
                .map((column) => (
                  <div key={column.key} className="flex justify-between gap-3 py-0.5">
                    <span className="text-xs shrink-0" style={{ color: 'var(--neu-ink-muted)' }}>
                      {column.label}
                    </span>
                    <span className="text-sm text-right min-w-0" style={{ color: 'var(--neu-ink-soft)' }}>
                      {column.render ? column.render(row) : row[column.key] ?? '—'}
                    </span>
                  </div>
                ))}
            </button>
          ))
        )}
      </div>

      {!loading && !hasRows && !error && (
        <EmptyState
          title={empty.title || 'Nothing here yet'}
          description={empty.description}
          icon={empty.icon}
          action={empty.action}
        />
      )}

      {pagination && pagination.totalPages > 1 && (
        <div
          className="flex items-center justify-between gap-3 px-4 py-3"
          style={{ borderTop: '1px solid var(--neu-line)' }}
        >
          <p className="text-xs mb-0" style={{ color: 'var(--neu-ink-muted)' }}>
            Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
          </p>
          <div className="flex gap-2">
            <Button
              size="xs"
              variant="secondary"
              icon={MdChevronLeft}
              disabled={pagination.page <= 1}
              onClick={() => onPageChange?.(pagination.page - 1)}
            >
              Prev
            </Button>
            <Button
              size="xs"
              variant="secondary"
              iconRight={MdChevronRight}
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => onPageChange?.(pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </Surface>
  );
}
