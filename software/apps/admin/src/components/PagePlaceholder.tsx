import { Construction } from 'lucide-react';

/**
 * Stands in for routes whose pages are still being built, so the sidebar's
 * links all resolve instead of dead-ending on a blank screen. Each is replaced
 * by its real page as that page lands.
 */
export default function PagePlaceholder({ title }: { title: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-card bg-white p-10 text-center shadow-card">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-mint">
        <Construction className="h-6 w-6 text-teal" strokeWidth={1.75} />
      </div>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        This section is not built yet.
      </p>
    </div>
  );
}
