import { Component, Suspense, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CameraProvider, useCamera } from '../context/CameraContext';
import { onNetwork } from '../lib/api';
import { streamView } from '../lib/lot';
import { NAV_GROUPS, PAGES, pageFor, type PageDef } from '../routes';
import Icon from './Icon';
import ThemeToggle from './ThemeToggle';
import { Empty, Note } from './ui';

/**
 * The frame of every signed-in page, with the operator console's own layout: a white menu panel and a glass top bar floating on the
 * grey canvas; on a phone, a floating tab bar with "More" pulling up the full menu. Same markup and class names as console.html, so
 * parkfnb.css styles it unchanged.
 */

const MINI_KEY = 'pf.mini';

const readMini = (): boolean => {
  try {
    return localStorage.getItem(MINI_KEY) === '1';
  } catch {
    return false;
  }
};

/** One red bar across the top once two requests in a row got no answer, until something does (the console's rule). */
function NetBar() {
  const [state, setState] = useState<{ down: boolean; since: number }>({ down: false, since: Date.now() });
  const [, tick] = useState(0);
  useEffect(() => onNetwork((reachable, lastOk) => setState({ down: !reachable, since: lastOk })), []);
  useEffect(() => {
    if (!state.down) return;
    const t = window.setInterval(() => tick((n) => n + 1), 5000);
    return () => window.clearInterval(t);
  }, [state.down]);
  if (!state.down) return null;
  return (
    <div role="alert" className="netbar">
      Cannot reach the server. What you see on this page is {Math.round((Date.now() - state.since) / 1000)} s old.
    </div>
  );
}

/** A page that crashes shows a message instead of a blank screen, and the menu still works. */
class PageBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[owner-web] page error:', error, info.componentStack);
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? <Note tone="bad">This page ran into a problem. Try another page, or reload.</Note> : this.props.children;
  }
}

function navActive(def: PageDef | undefined, item: PageDef, pathname: string): boolean {
  if (item.path === '/') return pathname === '/';
  return pathname === item.path || pathname.startsWith(`${item.path}/`) || def?.under === item.path;
}

function Shell() {
  const { user, owner, signOut } = useAuth();
  const cam = useCamera();
  const loc = useLocation();
  const navigate = useNavigate();
  const def = pageFor(loc.pathname);
  const [mini, setMiniState] = useState(readMini);
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const setMini = (on: boolean) => {
    setMiniState(on);
    try {
      localStorage.setItem(MINI_KEY, on ? '1' : '0');
    } catch {
      // private mode
    }
  };

  useEffect(() => setMenuOpen(false), [loc.pathname]);
  useEffect(() => {
    document.title = `${def?.title || 'Dashboard'} · ParkFNB`;
  }, [def?.title]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.legalName || (user?.phone ? `+91 ${user.phone}` : 'Owner');
  const initial = (name.replace(/[^A-Za-z0-9]/g, '')[0] || 'O').toUpperCase();
  const leave = () => {
    signOut();
    navigate('/login', { replace: true });
  };

  const info = cam.currentInfo;
  const [word, level] = info ? streamView({ stream_status: info.streamStatus, frozen: info.frozen, age_s: info.ageS, frame_age_s: info.frameAgeS }) : ['–', ''];
  const showCamera = Boolean(def?.camera);

  const navItems = PAGES.filter((p) => p.nav);
  const tabs = navItems.filter((p) => p.nav?.tab);
  const badge = cam.openViolations;

  const renderLink = (p: PageDef) => (
    <NavLink key={p.path} to={p.path} end={p.path === '/'} title={p.nav!.label}
      className={() => (navActive(def, p, loc.pathname) ? 'on' : undefined)}>
      <Icon name={p.nav!.icon} />
      <span className="lbl">{p.nav!.label}</span>
      {p.nav!.badge === 'violations' && badge > 0 && <span className="badge">{badge}</span>}
    </NavLink>
  );

  return (
    <div className={`app${mini ? ' mini' : ''}${menuOpen ? ' menu-open' : ''}`}>
      <NetBar />
      <aside className="side">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><Icon name="pin" /></div>
          <div className="lbl"><b>parkfnb<i>.</i></b><small>Owner dashboard</small></div>
          <button className="collapse" type="button" onClick={() => setMini(!mini)}
            title={mini ? 'Expand the menu' : 'Collapse the menu'} aria-label={mini ? 'Expand the menu' : 'Collapse the menu'}>
            <Icon name="chevronLeft" />
          </button>
        </div>
        <nav className="nav" aria-label="Main">
          {NAV_GROUPS.map((group) => (
            <div key={group} style={{ display: 'contents' }}>
              <div className="grp">{group}</div>
              {navItems.filter((p) => p.nav!.group === group).map(renderLink)}
            </div>
          ))}
          <div className="soon lbl" title="These need a backend first; the owner app keeps them on the phone only for now">
            Coming later: Promotions · Reviews · Support
          </div>
        </nav>
        <div className="side-foot">
          <div className="site-chip">
            <div className="ico">{initial}</div>
            <div><b>{name}</b><small>{owner?.businessName || (user?.phone ? `+91 ${user.phone}` : 'Parking owner')}</small></div>
          </div>
          <button className="btn side-out" type="button" onClick={leave}>Sign out</button>
        </div>
      </aside>
      <div className="menu-bg" onClick={() => setMenuOpen(false)} />

      <div className="main">
        <div className="topbar">
          <header className="top">
            <div className="brand-mark mark" aria-hidden="true"><Icon name="pin" /></div>
            <h1>{def?.title || 'Dashboard'}</h1>
            {showCamera && (
              <label className="pick" title="Camera">
                <Icon name="live" />
                <select aria-label="Camera" value={cam.current || ''} onChange={(e) => cam.setCurrent(e.target.value)} disabled={!cam.cameras.length}>
                  {cam.cameras.length === 0 && <option value="">{cam.loading ? 'Loading…' : 'No cameras yet'}</option>}
                  {cam.cameras.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
            )}
            {showCamera && info && <span className={`pill${level ? ` ${level}` : ''}`}>{word}</span>}
            <ThemeToggle />
            <div className="who">
              <span className="muted" id="clock">
                {now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} · {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </span>
              <div className="avatar" title={name}>{initial}</div>
              <button className="linkish" type="button" onClick={leave}>Sign out</button>
            </div>
          </header>
        </div>
        <main id="view" aria-live="polite">
          <PageBoundary resetKey={loc.pathname}>
            <Suspense fallback={<Empty>Loading…</Empty>}>
              <Outlet />
            </Suspense>
          </PageBoundary>
        </main>
      </div>

      <nav className="tabbar" aria-label="Quick menu">
        {tabs.map((p) => (
          <NavLink key={p.path} to={p.path} end={p.path === '/'} aria-label={p.nav!.label} title={p.nav!.label}
            className={() => (navActive(def, p, loc.pathname) ? 'on' : undefined)}>
            <span className="ic"><Icon name={p.nav!.icon} /></span>
            {p.nav!.badge === 'violations' && badge > 0 && <span className="badge">{badge}</span>}
          </NavLink>
        ))}
        <button type="button" aria-label="More: the full menu" aria-expanded={menuOpen} aria-controls="nav" title="More" onClick={() => setMenuOpen((o) => !o)}>
          <span className="ic"><Icon name="more" /></span>
        </button>
      </nav>
    </div>
  );
}

export default function AppShell() {
  return (
    <CameraProvider>
      <Shell />
    </CameraProvider>
  );
}
