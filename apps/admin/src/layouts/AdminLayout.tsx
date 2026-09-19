import { useState, useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
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
  Menu,
  X,
  Radio,
} from "lucide-react";
import { getStoredUser, signOut } from "../lib/auth";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/users", label: "Users", icon: Users },
  { to: "/owners", label: "Parking Owners", icon: Building2 },
  { to: "/spaces", label: "Parking Spaces", icon: ParkingSquare },
  { to: "/bookings", label: "Bookings", icon: CalendarCheck },
  { to: "/payments", label: "Payments", icon: CreditCard },
  { to: "/vehicles", label: "Vehicles", icon: Car },
  { to: "/ota", label: "OTA Updates", icon: Radio },
  { to: "/reports", label: "Reports", icon: TrendingUp },
  { to: "/support", label: "Support & Disputes", icon: LifeBuoy },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function AdminLayout() {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const location = useLocation();
  const user = getStoredUser();
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Admin";

  // Automatically close mobile sidebar on navigation
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-mint text-slate-800">
      {/* Mobile backdrop overlay */}
      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm transition-opacity lg:hidden"
          aria-hidden="true"
        />
      )}

      {/* Sidebar (docked on desktop lg+, drawer on mobile/tablet) */}
      <Sidebar isOpen={isMobileOpen} onClose={() => setIsMobileOpen(false)} />

      {/* Main Content Area */}
      <div className="flex min-h-screen flex-col lg:ml-[230px] transition-all duration-200">
        <TopBar
          displayName={displayName}
          onToggleSidebar={() => setIsMobileOpen((prev) => !prev)}
        />
        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Sidebar({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 flex w-[230px] flex-col bg-sidebar transition-transform duration-300 ease-in-out lg:translate-x-0 ${
        isOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
      }`}
    >
      <div className="flex items-center justify-between px-5 py-5 sm:px-6">
        <div>
          <span className="text-lg font-extrabold tracking-[0.18em] text-white">
            PARKFNB
          </span>
          <p className="mt-0.5 text-[11px] tracking-wide text-white/40">
            Admin Panel
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sidebar"
          className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              [
                "mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition",
                isActive
                  ? "bg-teal font-semibold text-white shadow-sm"
                  : "text-white/65 hover:bg-sidebar-hover hover:text-white",
              ].join(" ")
            }
          >
            <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-3">
        <div className="rounded-card bg-gradient-to-br from-teal to-teal-dark p-3.5 sm:p-4 text-white">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span className="text-xs font-bold uppercase tracking-wider text-white/80">
              Smart Lock OS
            </span>
          </div>
          <p className="mt-1.5 text-xs font-medium leading-snug">
            Smarter parking, live barriers & ANPR.
          </p>
        </div>
      </div>
    </aside>
  );
}

function TopBar({
  displayName,
  onToggleSidebar,
}: {
  displayName: string;
  onToggleSidebar: () => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200/70 bg-mint/95 px-4 py-3 sm:px-6 sm:py-3.5 backdrop-blur">
      {/* Mobile Hamburger Button */}
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="Open sidebar"
        className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition hover:border-teal hover:text-teal lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Brand icon on mobile */}
      <div className="font-bold text-teal text-base tracking-wider lg:hidden">
        PARKFNB
      </div>

      {/* Search Input */}
      <div className="relative hidden max-w-md flex-1 sm:block">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={searchRef}
          type="search"
          placeholder="Search bookings, spaces, plates..."
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-16 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal focus:ring-2 focus:ring-teal/15"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
          Ctrl K
        </kbd>
      </div>

      {/* Right Controls */}
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <NavLink
          to="/notifications"
          aria-label="Notifications"
          className="relative rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:text-teal"
        >
          <Bell
            className="h-4 w-4 sm:h-[18px] sm:w-[18px]"
            strokeWidth={1.75}
          />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
        </NavLink>

        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white py-1 pl-1 pr-2.5 sm:py-1.5 sm:pl-1.5 sm:pr-3">
          <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-teal text-xs font-semibold text-white">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="hidden leading-tight sm:block">
            <p className="text-xs sm:text-sm font-medium text-slate-800 truncate max-w-[120px]">
              {displayName}
            </p>
            <p className="text-[10px] text-slate-400">Super Admin</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            title="Sign out"
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
