import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ChevronRight, Loader2, Search } from 'lucide-react';
import KycStatusBadge from '../components/owners/KycStatusBadge';
import { fetchOwners, OWNERS_PAGE_SIZE } from '../components/owners/ownersApi';
import {
  kycStatusOf,
  OWNER_TYPE_LABEL,
  ownerDisplayName,
  ownerEmail,
  ownerPhone,
  type KycStatus,
  type Owner,
} from '../components/owners/types';
import { ApiError, type ApiMeta } from '../lib/api';

/**
 * The tabs an admin filters the queue by. 'draft' is folded in under
 * "Not started" rather than given its own tab: from a reviewer's point of view
 * a draft and an untouched account are the same thing — nothing to review yet.
 */
type Tab = 'all' | 'submitted' | 'verified' | 'rejected' | 'pending';

const TABS: { key: Tab; label: string; matches: (status: KycStatus) => boolean }[] = [
  { key: 'all', label: 'All', matches: () => true },
  { key: 'submitted', label: 'Submitted', matches: (s) => s === 'submitted' },
  { key: 'verified', label: 'Verified', matches: (s) => s === 'verified' },
  { key: 'rejected', label: 'Rejected', matches: (s) => s === 'rejected' },
  { key: 'pending', label: 'Not started', matches: (s) => s === 'not_started' || s === 'draft' },
];

const formatDate = (value?: string): string => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function Owners() {
  const navigate = useNavigate();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [meta, setMeta] = useState<ApiMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  // The default tab is chosen once, from the first page that loads. Re-running
  // it on later pages would yank the admin off a tab they picked themselves.
  const [tabDefaulted, setTabDefaulted] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchOwners(page, controller.signal)
      .then(({ data, meta: pageMeta }) => {
        const rows = data.owners ?? [];
        setOwners(rows);
        setMeta(pageMeta);
        if (!tabDefaulted) {
          // The submitted queue is where a reviewer spends their time, so open
          // straight into it when there is anything waiting.
          if (rows.some((owner) => kycStatusOf(owner) === 'submitted')) setTab('submitted');
          setTabDefaulted(true);
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof ApiError ? err.message : 'Could not load owners.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // tabDefaulted is read but deliberately not a dependency: including it
    // would refetch the list the moment the default is applied.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const counts = useMemo(() => {
    const result = {} as Record<Tab, number>;
    for (const { key, matches } of TABS) {
      result[key] = owners.filter((owner) => matches(kycStatusOf(owner))).length;
    }
    return result;
  }, [owners]);

  const visible = useMemo(() => {
    const activeTab = TABS.find((entry) => entry.key === tab);
    const term = search.trim().toLowerCase();
    return owners.filter((owner) => {
      if (activeTab && !activeTab.matches(kycStatusOf(owner))) return false;
      if (!term) return true;
      return [ownerDisplayName(owner), ownerPhone(owner), ownerEmail(owner), owner.businessName]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term));
    });
  }, [owners, search, tab]);

  const totalPages = meta?.totalPages ?? 1;

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900">Parking Owners</h1>
        <p className="mt-1 text-sm text-slate-500">
          Review KYC submissions and manage owner accounts.
        </p>
      </header>

      <div className="rounded-card bg-white shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex flex-wrap gap-1.5">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  tab === key ? 'bg-teal text-white' : 'text-slate-600 hover:bg-mint hover:text-teal'
                }`}
              >
                {label}
                <span className={`ml-1.5 text-xs ${tab === key ? 'text-white/70' : 'text-slate-400'}`}>
                  {counts[key] ?? 0}
                </span>
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, phone or email"
              aria-label="Search owners on this page"
              className="w-64 rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
            />
          </div>
        </div>

        {/*
          The API paginates before it filters, and offers no kyc_status filter at
          all, so the tabs and the search both apply to the loaded page only. Say
          so — otherwise a count of 0 reads as "no such owners exist" when the
          matches are simply on another page.
        */}
        <p className="border-b border-slate-100 px-5 py-2 text-xs text-slate-500">
          Filters and search apply to this page of results only.
        </p>

        {loading ? (
          <Centered>
            <Loader2 className="h-5 w-5 animate-spin text-teal" />
            <span className="text-sm text-slate-500">Loading owners…</span>
          </Centered>
        ) : error ? (
          <Centered>
            <AlertCircle className="h-5 w-5 text-red-500" strokeWidth={1.75} />
            <span className="text-sm text-red-700">{error}</span>
          </Centered>
        ) : visible.length === 0 ? (
          <Centered>
            <span className="text-sm text-slate-500">
              {owners.length === 0
                ? 'No owners have registered yet.'
                : 'No owners on this page match the current filters.'}
            </span>
          </Centered>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                  <Th>Owner</Th>
                  <Th>Phone</Th>
                  <Th>Type</Th>
                  <Th>KYC status</Th>
                  <Th>Listings</Th>
                  <Th>Joined</Th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((owner) => (
                  <tr
                    key={owner.id}
                    onClick={() => navigate(`/owners/${owner.id}`)}
                    className="cursor-pointer border-b border-slate-50 transition last:border-0 hover:bg-mint"
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900">{ownerDisplayName(owner)}</p>
                      {owner.businessName && (
                        <p className="text-xs text-slate-500">{owner.businessName}</p>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{ownerPhone(owner) ?? '—'}</td>
                    <td className="px-5 py-3.5 text-slate-600">
                      {OWNER_TYPE_LABEL[owner.ownerType] ?? owner.ownerType}
                    </td>
                    <td className="px-5 py-3.5">
                      <KycStatusBadge status={kycStatusOf(owner)} />
                    </td>
                    {/*
                      The list endpoint returns no space count and fetching
                      /stats per row would be one request per owner per page.
                      An em dash is honest; a 0 would not be. The detail page
                      shows the real number.
                    */}
                    <td className="px-5 py-3.5 text-slate-400">—</td>
                    <td className="px-5 py-3.5 text-slate-600">{formatDate(owner.createdAt)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <ChevronRight className="ml-auto h-4 w-4 text-slate-300" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta && meta.total > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3.5">
            <p className="text-xs text-slate-500">
              Page {meta.page} of {totalPages} · {meta.total} owner{meta.total === 1 ? '' : 's'} total ·{' '}
              {OWNERS_PAGE_SIZE} per page
            </p>
            <div className="flex gap-2">
              <PageButton disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>
                Previous
              </PageButton>
              <PageButton
                disabled={page >= totalPages || loading}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </PageButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-5 py-3 font-medium">{children}</th>;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-center justify-center gap-2 px-5 py-16">{children}</div>;
}

function PageButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-teal hover:text-teal disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-600"
    >
      {children}
    </button>
  );
}
