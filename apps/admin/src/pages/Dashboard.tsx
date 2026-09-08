import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  Building2,
  CalendarCheck,
  CheckCircle2,
  CirclePlus,
  Database,
  HelpCircle,
  Loader2,
  type LucideIcon,
  ParkingSquare,
  Server,
  TicketPercent,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  BOOKINGS_WINDOW_DAYS,
  loadDashboard,
  type BookingRow,
  type Count,
  type DashboardData,
  type HealthStatus,
  type Slice,
  type UserRow,
} from '../lib/dashboard';

/** Donut colours, ordered so the largest slice takes the strongest teal. */
const DONUT_COLORS = ['#0D7377', '#14A0A5', '#41C4C0', '#8FDBD8', '#CBEDEB'];

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    loadDashboard()
      .then((result) => {
        // The component may have unmounted during the (possibly 60s) request.
        if (active) setData(result);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center text-slate-400">
        <Loader2 className="h-7 w-7 animate-spin text-teal" />
        <p className="mt-3 text-sm">Loading dashboard…</p>
        <p className="mt-1 text-xs text-slate-400">
          The API sleeps when idle and can take up to a minute to wake.
        </p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-5">
      <WelcomeBanner />

      {data.errors.length > 0 && <LoadErrors errors={data.errors} />}

      <StatCards data={data} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <BookingsOverview points={data.bookingsByDay} className="xl:col-span-2" />
        <SpaceUtilization slices={data.spaceStatusBreakdown} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <RecentBookings bookings={data.recentBookings} className="xl:col-span-2" />
        <div className="space-y-5">
          <SystemStatus health={data.health} />
          <QuickActions />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <RecentUsers users={data.recentUsers} className="xl:col-span-2" />
        <UserDistribution slices={data.userTypeBreakdown} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- primitives */

function Card({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-card bg-white p-5 shadow-card ${className}`}>
      {title && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** Shown wherever there is genuinely no data — never a placeholder curve. */
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[180px] items-center justify-center rounded-lg bg-mint/60 px-4 text-center">
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  );
}

function WelcomeBanner() {
  return (
    <section className="overflow-hidden rounded-card bg-sidebar px-8 py-7">
      <p className="text-xs font-medium tracking-[0.22em] text-white/50">WELCOME BACK</p>
      <h1 className="mt-2 text-2xl font-bold leading-snug text-white sm:text-[28px]">
        Manage Today for a <span className="text-teal-light">Smoother Tomorrow</span>
      </h1>
    </section>
  );
}

function LoadErrors({ errors }: { errors: string[] }) {
  return (
    <div className="rounded-card border border-amber-200 bg-amber-50 p-4">
      <div className="flex gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-medium text-amber-900">Some data could not be loaded</p>
          <ul className="mt-1 space-y-0.5 text-xs text-amber-800">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- stat cards */

interface StatDefinition {
  label: string;
  value: Count;
  icon: LucideIcon;
  tint: string;
  /** Set for money so it renders with a currency symbol. */
  currency?: string | null;
  note?: string;
}

function StatCards({ data }: { data: DashboardData }) {
  const stats: StatDefinition[] = [
    { label: 'Total Users', value: data.counts.users, icon: Users, tint: 'bg-teal/10 text-teal' },
    {
      label: 'Parking Owners',
      value: data.counts.owners,
      icon: Building2,
      tint: 'bg-indigo-50 text-indigo-600',
    },
    {
      label: 'Parking Spaces',
      value: data.counts.spaces,
      icon: ParkingSquare,
      tint: 'bg-amber-50 text-amber-600',
    },
    {
      label: 'Total Bookings',
      value: data.counts.bookings,
      icon: CalendarCheck,
      tint: 'bg-sky-50 text-sky-600',
    },
    {
      label: 'Revenue',
      value: data.counts.revenue,
      icon: Wallet,
      tint: 'bg-emerald-50 text-emerald-600',
      currency: data.revenueCurrency,
      // The API offers no revenue total, so this is summed from the most recent
      // payments only. Saying so beats implying it is lifetime revenue.
      note: 'Recent payments',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {stats.map((stat) => (
        <StatCard key={stat.label} {...stat} />
      ))}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tint, currency, note }: StatDefinition) {
  return (
    <div className="rounded-card bg-white p-5 shadow-card">
      <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${tint}`}>
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <p className="text-2xl font-bold text-slate-900">
        {value === null ? (
          <span className="text-base font-medium text-slate-400">Unavailable</span>
        ) : currency !== undefined ? (
          formatMoney(value, currency)
        ) : (
          value.toLocaleString()
        )}
      </p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
      {/* The mockup shows a "+12% vs last month" line here. The backend keeps no
          historical snapshots, so there is nothing to compute it from; the row
          below holds the space for when that data exists. */}
      <p className="mt-2 min-h-[16px] text-xs text-slate-400">{note ?? ''}</p>
    </div>
  );
}

function formatMoney(amount: number, currency: string | null | undefined): string {
  const code = (currency ?? 'INR').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // Intl throws on a currency code it does not recognise.
    return `${code} ${amount.toLocaleString()}`;
  }
}

/* -------------------------------------------------------------------- charts */

function BookingsOverview({
  points,
  className = '',
}: {
  points: { label: string; confirmed: number; pending: number }[];
  className?: string;
}) {
  const hasActivity = points.some((point) => point.confirmed > 0 || point.pending > 0);

  return (
    <Card
      title="Bookings Overview"
      subtitle={`Confirmed vs pending, last ${BOOKINGS_WINDOW_DAYS} days`}
      className={className}
    >
      {hasActivity ? (
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="#EEF3F2" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#94A3B8' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#94A3B8' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 10,
                  border: '1px solid #E2E8F0',
                  fontSize: 12,
                }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Line
                type="monotone"
                dataKey="confirmed"
                name="Confirmed"
                stroke="#0D7377"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="pending"
                name="Pending"
                stroke="#F0A93B"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState message="No bookings yet" />
      )}
    </Card>
  );
}

function Donut({ slices, centerLabel }: { slices: Slice[]; centerLabel: string }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <div className="relative h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="88%"
            paddingAngle={2}
            stroke="none"
          >
            {slices.map((slice, index) => (
              <Cell key={slice.name} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12 }}
            formatter={(value: number, name: string) => [value, humanize(name)]}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Absolutely centred over the ring so the total reads inside the hole. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-slate-900">{total.toLocaleString()}</span>
        <span className="text-[11px] text-slate-400">{centerLabel}</span>
      </div>
    </div>
  );
}

function DonutLegend({ slices }: { slices: Slice[] }) {
  return (
    <ul className="mt-3 space-y-1.5">
      {slices.map((slice, index) => (
        <li key={slice.name} className="flex items-center gap-2 text-xs">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }}
          />
          <span className="text-slate-600">{humanize(slice.name)}</span>
          <span className="ml-auto font-medium text-slate-900">{slice.value}</span>
        </li>
      ))}
    </ul>
  );
}

function SpaceUtilization({ slices }: { slices: Slice[] }) {
  return (
    <Card title="Parking Space Utilization" subtitle="By listing status">
      {slices.length > 0 ? (
        <>
          <Donut slices={slices} centerLabel="spaces" />
          <DonutLegend slices={slices} />
        </>
      ) : (
        <EmptyState message="No parking spaces yet" />
      )}
    </Card>
  );
}

function UserDistribution({ slices }: { slices: Slice[] }) {
  return (
    <Card title="User Distribution" subtitle="By account type">
      {slices.length > 0 ? (
        <>
          <Donut slices={slices} centerLabel="users" />
          <DonutLegend slices={slices} />
        </>
      ) : (
        <EmptyState message="No users yet" />
      )}
    </Card>
  );
}

/* --------------------------------------------------------------- status list */

/**
 * Only rows we can genuinely verify.
 *
 * The mockup also lists "Payment Gateway" and "Maps & Location". Nothing in the
 * backend reports on either, so they are omitted rather than shown as
 * "Operational" on no evidence.
 */
function SystemStatus({ health }: { health: HealthStatus }) {
  const rows = [
    {
      icon: Server,
      label: 'API',
      ok: health.apiReachable,
      text: health.apiReachable ? 'Reachable' : 'Unreachable',
    },
    {
      icon: Database,
      label: 'Database',
      ok: health.database === 'connected' ? true : health.database === 'unknown' ? null : false,
      text:
        health.database === 'connected'
          ? 'Connected'
          : health.database === 'disconnected'
            ? 'Disconnected'
            : 'Unknown',
    },
  ];

  return (
    <Card title="System Status" subtitle="Checks reported by /health">
      <ul className="space-y-2.5">
        {rows.map(({ icon: Icon, label, ok, text }) => (
          <li key={label} className="flex items-center gap-3">
            <Icon className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.75} />
            <span className="text-sm text-slate-700">{label}</span>
            <span className="ml-auto flex items-center gap-1.5 text-xs font-medium">
              {ok === true && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
              {ok === false && <XCircle className="h-3.5 w-3.5 text-red-500" />}
              {ok === null && <HelpCircle className="h-3.5 w-3.5 text-slate-400" />}
              <span
                className={
                  ok === true ? 'text-emerald-600' : ok === false ? 'text-red-600' : 'text-slate-400'
                }
              >
                {text}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------------------------------------------------------------- data lists */

const STATUS_STYLES: Record<string, string> = {
  confirmed: 'bg-emerald-50 text-emerald-700',
  active: 'bg-teal/10 text-teal',
  completed: 'bg-slate-100 text-slate-600',
  pending: 'bg-amber-50 text-amber-700',
  cancelled: 'bg-red-50 text-red-700',
  rejected: 'bg-red-50 text-red-700',
  no_show: 'bg-orange-50 text-orange-700',
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
        STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600'
      }`}
    >
      {humanize(status)}
    </span>
  );
}

/** Turns snake_case API enums into readable labels ("no_show" -> "No show"). */
function humanize(value: string): string {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Populated relations arrive as objects; unpopulated ones as bare id strings. */
function nameOf(relation: BookingRow['userId']): string {
  if (!relation || typeof relation === 'string') return '—';
  const full = [relation.firstName, relation.lastName].filter(Boolean).join(' ');
  return full || relation.email || '—';
}

function spaceNameOf(relation: BookingRow['spaceId']): string {
  if (!relation || typeof relation === 'string') return '—';
  return relation.title || relation.name || '—';
}

function RecentBookings({
  bookings,
  className = '',
}: {
  bookings: BookingRow[];
  className?: string;
}) {
  return (
    <Card
      title="Recent Bookings"
      action={
        <Link to="/bookings" className="text-xs font-medium text-teal hover:underline">
          View all
        </Link>
      }
      className={className}
    >
      {bookings.length > 0 ? (
        // Narrow viewports scroll the table rather than the page.
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-400">
                <th className="pb-2 pl-1 font-medium">Booking</th>
                <th className="pb-2 font-medium">User</th>
                <th className="pb-2 font-medium">Space</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 pr-1 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bookings.map((booking) => (
                <tr key={booking.id}>
                  <td className="py-2.5 pl-1 font-medium text-slate-800">
                    {booking.bookingNumber ?? booking.id.slice(-6)}
                  </td>
                  <td className="py-2.5 text-slate-600">{nameOf(booking.userId)}</td>
                  <td className="max-w-[160px] truncate py-2.5 text-slate-600">
                    {spaceNameOf(booking.spaceId)}
                  </td>
                  <td className="py-2.5">
                    <StatusPill status={booking.status} />
                  </td>
                  <td className="py-2.5 pr-1 text-right font-medium text-slate-800">
                    {booking.totalAmount === undefined
                      ? '—'
                      : formatMoney(booking.totalAmount, booking.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState message="No bookings yet" />
      )}
    </Card>
  );
}

function RecentUsers({ users, className = '' }: { users: UserRow[]; className?: string }) {
  return (
    <Card
      title="Recent Users"
      action={
        <Link to="/users" className="text-xs font-medium text-teal hover:underline">
          View all
        </Link>
      }
      className={className}
    >
      {users.length > 0 ? (
        <ul className="divide-y divide-slate-100">
          {users.map((user) => {
            const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
            return (
              <li key={user.id} className="flex items-center gap-3 py-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint text-xs font-semibold text-teal">
                  {(name || user.email || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {name || 'Unnamed user'}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {user.email ?? user.phoneNumber ?? '—'}
                  </p>
                </div>
                {user.userType && (
                  <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                    {humanize(user.userType)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState message="No users yet" />
      )}
    </Card>
  );
}

/* -------------------------------------------------------------- quick actions */

function QuickActions() {
  const actions = [
    { to: '/owners', label: 'Review owner KYC', icon: Building2 },
    { to: '/spaces', label: 'Manage parking spaces', icon: CirclePlus },
    { to: '/support', label: 'Open support tickets', icon: TicketPercent },
  ];

  return (
    <Card title="Quick Actions">
      <div className="space-y-2">
        {actions.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 transition hover:border-teal hover:text-teal"
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            {label}
          </Link>
        ))}
      </div>
    </Card>
  );
}
