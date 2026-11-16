import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { IconName } from './components/Icon';

/**
 * Every page of the dashboard, in one table: its path, title, and where it sits in the menu.
 *
 * The groups and their order follow the operator console's menu (Operations, Analytics, Setup) with a Business group for what the
 * owner app does (properties, bookings, earnings). A page with `camera: true` shows the camera picker and status pill in the top
 * bar and works on the camera chosen there. Pages are loaded on demand, so each is its own file with a default export.
 */
export type NavGroup = 'Operations' | 'Business' | 'Analytics' | 'Setup';

export interface PageDef {
  path: string;
  title: string;
  element: LazyExoticComponent<ComponentType>;
  camera?: boolean;
  nav?: { group: NavGroup; label: string; icon: IconName; badge?: 'violations'; tab?: boolean };
  /** the menu entry this page belongs under (for a detail page: its list) */
  under?: string;
}

const page = (loader: () => Promise<{ default: ComponentType }>) => lazy(loader);

export const PAGES: PageDef[] = [
  // Operations
  { path: '/', title: 'Dashboard', camera: true, element: page(() => import('./pages/Dashboard')),
    nav: { group: 'Operations', label: 'Dashboard', icon: 'home', tab: true } },
  { path: '/live', title: 'Live Operations', camera: true, element: page(() => import('./pages/Live')),
    nav: { group: 'Operations', label: 'Live Operations', icon: 'live', tab: true } },
  { path: '/vehicles', title: 'Vehicles / ANPR', camera: true, element: page(() => import('./pages/Vehicles')),
    nav: { group: 'Operations', label: 'Vehicles / ANPR', icon: 'car' } },
  { path: '/violations', title: 'Violations', camera: true, element: page(() => import('./pages/Violations')),
    nav: { group: 'Operations', label: 'Violations', icon: 'warn', badge: 'violations', tab: true } },

  // Business
  { path: '/properties', title: 'Properties & spaces', element: page(() => import('./pages/Properties')),
    nav: { group: 'Business', label: 'Properties & spaces', icon: 'building' } },
  { path: '/properties/new', title: 'New property', element: page(() => import('./pages/PropertyForm')), under: '/properties' },
  { path: '/properties/:id', title: 'Property', element: page(() => import('./pages/PropertyDetail')), under: '/properties' },
  { path: '/properties/:id/edit', title: 'Edit property', element: page(() => import('./pages/PropertyForm')), under: '/properties' },
  { path: '/properties/:id/spaces/new', title: 'New space', element: page(() => import('./pages/SpaceForm')), under: '/properties' },
  { path: '/spaces/:id', title: 'Space', element: page(() => import('./pages/SpaceDetail')), under: '/properties' },
  { path: '/spaces/:id/edit', title: 'Edit space', element: page(() => import('./pages/SpaceForm')), under: '/properties' },
  { path: '/bookings', title: 'Bookings', element: page(() => import('./pages/Bookings')),
    nav: { group: 'Business', label: 'Bookings', icon: 'calendar', tab: true } },
  { path: '/bookings/:id', title: 'Booking', element: page(() => import('./pages/BookingDetail')), under: '/bookings' },
  { path: '/earnings', title: 'Earnings', element: page(() => import('./pages/Earnings')),
    nav: { group: 'Business', label: 'Earnings', icon: 'rupee' } },
  { path: '/payouts', title: 'Payouts', element: page(() => import('./pages/Payouts')),
    nav: { group: 'Business', label: 'Payouts', icon: 'wallet' } },

  // Analytics
  { path: '/sessions', title: 'Sessions', camera: true, element: page(() => import('./pages/Sessions')),
    nav: { group: 'Analytics', label: 'Sessions', icon: 'clock' } },
  { path: '/reports', title: 'Reports', camera: true, element: page(() => import('./pages/Reports')),
    nav: { group: 'Analytics', label: 'Reports', icon: 'chart' } },

  // Setup
  { path: '/cameras', title: 'Cameras', element: page(() => import('./pages/Cameras')),
    nav: { group: 'Setup', label: 'Cameras', icon: 'monitor' } },
  { path: '/barriers', title: 'Barriers', element: page(() => import('./pages/Barriers')),
    nav: { group: 'Setup', label: 'Barriers', icon: 'barrier' } },
  { path: '/log', title: 'Activity log', camera: true, element: page(() => import('./pages/ActivityLog')),
    nav: { group: 'Setup', label: 'Activity log', icon: 'list' } },
  { path: '/profile', title: 'Profile & KYC', element: page(() => import('./pages/Profile')),
    nav: { group: 'Setup', label: 'Profile & KYC', icon: 'user' } },
];

export const NAV_GROUPS: NavGroup[] = ['Operations', 'Business', 'Analytics', 'Setup'];

/** The page whose path matches `pathname` (pattern segments start with ":"), the most specific first. */
export function pageFor(pathname: string): PageDef | undefined {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const parts = clean.split('/');
  const hits = PAGES.filter((p) => {
    const q = p.path.split('/');
    return q.length === parts.length && q.every((seg, i) => seg.startsWith(':') || seg === parts[i]);
  });
  // a literal path ("/properties/new") beats a pattern ("/properties/:id")
  return hits.sort((a, b) => (a.path.match(/:/g)?.length || 0) - (b.path.match(/:/g)?.length || 0))[0];
}
