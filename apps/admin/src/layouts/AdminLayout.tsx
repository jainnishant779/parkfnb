import { useEffect, useRef } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Bell,
  Building2,
  CalendarCheck,
  CreditCard,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  type LucideIcon,
  ParkingSquare,
  Search,
  Settings,
  Sparkles,
  TrendingUp,
  Users,
  Car,
} from 'lucide-react';
import { getStoredUser, signOut } from '../lib/auth';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/owners', label: 'Parking Owners', icon: Building2 },
  { to: '/spaces', label: 'Parking Spaces', icon: ParkingSquare },
  { to: '/bookings', label: 'Bookings', icon: CalendarCheck },
  { to: '/payments', label: 'Payments', icon: CreditCard },
  { to: '/vehicles', label: 'Vehicles', icon: Car },
  { to: '/reports', label: 'Reports', icon: TrendingUp },
  { to: '/support', label: 'Support & Disputes', icon: LifeBuoy },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function AdminLayout() {
  const user = getStoredUser();
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Admin';

  return (
    <div className="min-h-screen bg-mint">
      <Sidebar />
      {/* Matches the sidebar's fixed 220px so content never slides underneath. */}
      <div className="ml-[220px] flex min-h-screen flex-col">
        <TopBar displayName={displayName} />
        <main className="flex-1 px-7 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 flex w-[220px] flex-col bg-sidebar">
      <div className="px-6 py-6">
        <span className="text-lg font-bold tracking-[0.18em] text-white">PARKFNB</span>
        <p className="mt-0.5 text-[11px] tracking-wide text-white/40">Admin Panel</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            // Only the dashboard needs `end`; every other path is a distinct
            // prefix, so nested routes still highlight their parent.
            end={to === '/'}
            className={({ isActive }) =>
              [
                'mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition',
                isActive
                  ? 'bg-teal font-medium text-white'
                  : 'text-white/60 hover:bg-sidebar-hover hover:text-white',
              ].join(' ')
            }
          >
            <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-3">
        <div className="rounded-card bg-gradient-to-br from-teal to-teal-dark p-4">
          <Sparkles className="h-5 w-5 text-white" strokeWidth={1.75} />
          <p className="mt-2 text-sm font-semibold leading-snug text-white">
            Smarter parking, every day
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-white/70">
            Keep listings and bookings healthy across the network.
          </p>
        </div>
      </div>
    </aside>
  );
}

function TopBar({ displayName }: { displayName: string }) {
  const searchRef = useRef<HTMLInputElement>(null);

  // The Ctrl+K hint in the search field has to actually do something, or it is
  // just decoration that trains people to distrust the UI.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-slate-200/70 bg-mint/90 px-7 py-4 backdrop-blur">
      <div className="relative max-w-xl flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={searchRef}
          type="search"
          placeholder="Search users, bookings, spaces..."
          className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-20 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal focus:ring-2 focus:ring-teal/15"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-400">
          Ctrl + K
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <NavLink
          to="/notifications"
          aria-label="Notifications"
          className="relative rounded-lg border border-slate-200 bg-white p-2.5 text-slate-500 transition hover:text-teal"
        >
          <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
        </NavLink>

        <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white py-1.5 pl-1.5 pr-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal text-xs font-semibold text-white">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="leading-tight">
            <p className="text-sm font-medium text-slate-800">{displayName}</p>
            <p className="text-[11px] text-slate-400">Super Admin</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            aria-label="Sign out"
            className="ml-1 text-slate-400 transition hover:text-red-500"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </header>
  );
}
