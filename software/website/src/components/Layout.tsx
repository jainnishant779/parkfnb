import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, ChevronRight, Mail, MapPin, Menu, X } from 'lucide-react';
import { footerColumns, primaryNav, secondaryNav, site } from '../data/site';
import { Button } from './ui';

export function Brand() {
  return (
    <Link className="brand" to="/" aria-label="Parkfnb home">
      <span className="brand-mark">
        <MapPin size={20} />
      </span>
      <span className="wordmark">
        parkfnb<span className="dot">.</span>
      </span>
    </Link>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname, search } = useLocation();

  useEffect(() => setOpen(false), [pathname, search]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className={`site-header ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="container">
        <nav className="nav-pill" aria-label="Main">
          <Brand />
          <ul className="nav-links">
            {primaryNav.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to}>{item.label}</NavLink>
              </li>
            ))}
          </ul>
          <div className="nav-actions">
            <Button to="/download" size="sm" className="nav-cta" iconRight={ArrowRight}>
              Get the app
            </Button>
            <button
              type="button"
              className="icon-circle menu-toggle"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
        </nav>

        {open ? (
          <div className="mobile-menu" id="mobile-menu">
            {primaryNav.map((item) => (
              <NavLink key={item.to} to={item.to} className="list-row">
                <b>{item.label}</b>
                <ChevronRight className="chev" size={18} />
              </NavLink>
            ))}
            <p className="mobile-menu-group">Company</p>
            {secondaryNav.map((item) => (
              <NavLink key={item.to} to={item.to} className="list-row">
                <b>{item.label}</b>
                <ChevronRight className="chev" size={18} />
              </NavLink>
            ))}
            <Button to="/download" block>
              Get the app
            </Button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-card">
          <div className="footer-brand">
            <Brand />
            <p>{site.tagline}</p>
            <a className="footer-mail" href={`mailto:${site.supportEmail}`}>
              <Mail size={17} />
              {site.supportEmail}
            </a>
          </div>
          <div className="footer-cols">
            {footerColumns.map((col) => (
              <div key={col.title}>
                <h4>{col.title}</h4>
                {col.links.map((l) => (
                  <Link key={l.to + l.label} to={l.to}>
                    {l.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            &copy; {new Date().getFullYear()} {site.name}. All rights reserved.
          </span>
          <button type="button" className="to-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            Back to top <ArrowUpRight size={16} />
          </button>
        </div>
      </div>
    </footer>
  );
}

/** Scroll to the top on a new page, or to #hash targets once they render. */
function ScrollManager() {
  const { pathname, hash, search } = useLocation();
  useEffect(() => {
    if (hash) {
      const id = decodeURIComponent(hash.slice(1));
      let tries = 0;
      const tick = () => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else if (tries++ < 10) window.setTimeout(tick, 60);
      };
      tick();
      return;
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname, hash, search]);
  return null;
}

export default function Layout() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <ScrollManager />
      <Header />
      <main id="main">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
