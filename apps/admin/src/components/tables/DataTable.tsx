import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, Search } from 'lucide-react';
import type { ApiMeta } from '../../lib/api';

/* ------------------------------------------------------------------ page shell */

/** The heading every list page opens with. */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

/** White card with the panel's soft shadow — the container for every table. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-card bg-white shadow-card ${className}`}>{children}</section>
  );
}

/* ------------------------------------------------------------------- controls */

/**
 * Search box that waits for a pause in typing before reporting up, so each
 * keystroke does not fire its own request against an API that can take a
 * minute to answer on a cold start.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState(value);

  // Keep in step when the parent resets the term (e.g. clearing all filters).
  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    if (draft === value) return;
    const timer = window.setTimeout(() => onChange(draft), 350);
    return () => window.clearTimeout(timer);
  }, [draft, value, onChange]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20 sm:w-72"
      />
    </div>
  );
}

/**
 * Horizontal pills for a status filter. Preferred over a <select> because the
 * set of statuses is small, fixed, and worth having visible: an admin should
 * be able to see that "rejected" and "no show" exist without opening a menu.
 */
export function FilterPills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T | ''; label: string }[];
  value: T | '';
  onChange: (value: T | '') => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value || 'all'}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              selected
                ? 'bg-teal text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------------- states */

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center text-slate-400">
      <Loader2 className="h-6 w-6 animate-spin text-teal" />
      <p className="mt-3 text-sm">{label}</p>
      <p className="mt-1 text-xs text-slate-400">
        The API sleeps when idle and can take up to a minute to wake.
      </p>
    </div>
  );
}

/** Shown when a request failed. Never a silent empty table — that reads as "no data". */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center px-6 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-red-50">
        <AlertTriangle className="h-5 w-5 text-red-500" strokeWidth={1.75} />
      </div>
      <p className="text-sm font-medium text-slate-900">Could not load this list</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-dark"
      >
        Try again
      </button>
    </div>
  );
}

/** Genuinely nothing to show. Distinct wording for "no records" vs "no matches". */
export function EmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center px-6 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-mint">
        <Inbox className="h-5 w-5 text-teal" strokeWidth={1.75} />
      </div>
      <p className="text-sm font-medium text-slate-900">{message}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-slate-500">{hint}</p>}
    </div>
  );
}

/* ----------------------------------------------------------------- table parts */

/** Wraps a table so a wide one scrolls inside its card rather than the page. */
export function TableScroll({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

export function Th({
  children,
  align = 'left',
  className = '',
}: {
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <th
      className={`whitespace-nowrap px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-slate-400 ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  className = '',
}: {
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <td
      className={`px-4 py-3 text-sm text-slate-600 ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </td>
  );
}

/* ----------------------------------------------------------------- pagination */

/**
 * Page controls driven by the backend's `meta` block.
 *
 * Renders nothing when there is a single page — a lone "Page 1 of 1" with two
 * dead arrows is noise.
 */
export function Pagination({
  meta,
  onPageChange,
  busy,
}: {
  meta: ApiMeta | null;
  onPageChange: (page: number) => void;
  busy: boolean;
}) {
  if (!meta || meta.totalPages <= 1) return null;

  const { page, limit, total, totalPages } = meta;
  const firstOnPage = (page - 1) * limit + 1;
  const lastOnPage = Math.min(page * limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
      <p className="text-xs text-slate-500">
        Showing <span className="font-medium text-slate-700">{firstOnPage.toLocaleString()}</span>–
        <span className="font-medium text-slate-700">{lastOnPage.toLocaleString()}</span> of{' '}
        <span className="font-medium text-slate-700">{total.toLocaleString()}</span>
      </p>
      <div className="flex items-center gap-2">
        <PageButton
          onClick={() => onPageChange(page - 1)}
          disabled={busy || page <= 1}
          label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </PageButton>
        <span className="text-xs text-slate-500">
          Page {page} of {totalPages}
        </span>
        <PageButton
          onClick={() => onPageChange(page + 1)}
          disabled={busy || page >= totalPages}
          label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </PageButton>
      </div>
    </div>
  );
}

function PageButton({
  children,
  onClick,
  disabled,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-teal hover:text-teal disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-500"
    >
      {children}
    </button>
  );
}
