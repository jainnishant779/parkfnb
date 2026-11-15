import { useEffect, type ReactNode } from 'react';
import { Loader2, X } from 'lucide-react';

/**
 * Right-hand slide-over used by all three list pages to show one record in
 * full.
 *
 * A drawer rather than a route: the list keeps its page, filters and scroll
 * position underneath, which matters when an admin is working through a
 * filtered page of bookings one row at a time.
 */
export default function DetailDrawer({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  // Escape closes it, matching every other slide-over the user has met.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 bg-sidebar/30 backdrop-blur-[1px]"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl"
      >
        <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-slate-100 bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-xs text-slate-400">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="px-5 py-5">{children}</div>
      </aside>
    </div>
  );
}

/** A titled group of fields inside the drawer. */
export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6 last:mb-0">
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {title}
      </h3>
      <dl className="divide-y divide-slate-100 rounded-lg border border-slate-100">{children}</dl>
    </section>
  );
}

/**
 * One label/value pair. `value` accepts a node so a caller can drop in a badge,
 * and falls back to an em dash for anything empty — a blank row would read as
 * a rendering bug rather than as absent data.
 */
export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  const isEmpty = value === null || value === undefined || value === '';
  return (
    <div className="flex gap-4 px-3 py-2.5">
      <dt className="w-32 shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-sm text-slate-800">
        {isEmpty ? <span className="text-slate-400">—</span> : value}
      </dd>
    </div>
  );
}

/** Spinner for a drawer whose detail request is still in flight. */
export function DrawerLoading() {
  return (
    <div className="flex min-h-[200px] items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-teal" />
    </div>
  );
}

/** The detail request failed; the row data already on screen is all we have. */
export function DrawerError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
      {message}
    </div>
  );
}
