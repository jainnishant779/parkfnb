/**
 * Page-level building blocks shared across pages: inner-page hero, download
 * banner, store buttons, and the app-screen mockups.
 */
import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  Bookmark,
  Copy,
  Download,
  Heart,
  Home as HomeIcon,
  Search,
  Smartphone,
  User,
  Zap,
} from 'lucide-react';
import IsoCar from './IsoCar';
import { Button, IconCircle, ProgressTrack, Reveal, Tag, Timeline } from './ui';
import { site } from '../data/site';

/* ─── Page meta ────────────────────────────────────────── */
export function usePageMeta(title: string, description?: string) {
  useEffect(() => {
    document.title = title === 'Home' ? 'Parkfnb | Parking made simple' : `${title} | Parkfnb`;
    if (description) {
      document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    }
  }, [title, description]);
}

/* ─── Inner page hero ──────────────────────────────────── */
export function PageHero({
  eyebrow,
  title,
  lead,
  tone = 'plain',
  art,
  actions,
  crumb,
}: {
  eyebrow: string;
  title: ReactNode;
  lead: ReactNode;
  tone?: 'plain' | 'peach' | 'blue' | 'ink' | 'cream';
  art?: ReactNode;
  actions?: ReactNode;
  crumb?: string;
}) {
  const toneClass = tone === 'plain' ? 'plain' : `tone-${tone}`;
  return (
    <section className="page-hero">
      <div className="container">
        <Reveal className={`page-hero-card ${toneClass} ${art ? '' : 'no-art'}`}>
          <div>
            <nav className="crumbs" aria-label="Breadcrumb">
              <Link to="/">Home</Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page">{crumb ?? eyebrow}</span>
            </nav>
            <span className={`eyebrow ${tone === 'ink' ? 'light' : ''}`}>{eyebrow}</span>
            <h1 className="display-sm">{title}</h1>
            <p className="lead">{lead}</p>
            {actions ? <div className="btn-row stack-sm">{actions}</div> : null}
          </div>
          {art ? <div className="page-hero-art">{art}</div> : null}
        </Reveal>
      </div>
    </section>
  );
}

/* ─── Store buttons ────────────────────────────────────── */
export function StoreButtons({ app = 'driver', onDark }: { app?: 'driver' | 'owner'; onDark?: boolean }) {
  const links = site.stores[app];
  const ios = links.ios;
  const android = links.android;
  return (
    <div className="btn-row stack-sm">
      {ios ? (
        <Button href={ios} variant="white" icon={Smartphone}>
          App Store
        </Button>
      ) : (
        <Button to={`/contact?topic=early-access&app=${app}`} variant={onDark ? 'white' : 'grey'} icon={Smartphone}>
          App Store <Tag tone={onDark ? 'grey' : 'white'}>Soon</Tag>
        </Button>
      )}
      {android ? (
        <Button href={android} variant="peach" icon={Download}>
          Google Play
        </Button>
      ) : (
        <Button to={`/contact?topic=early-access&app=${app}`} variant="peach" icon={Download}>
          Google Play <Tag tone="white">Soon</Tag>
        </Button>
      )}
    </div>
  );
}

/* ─── Download banner ──────────────────────────────────── */
export function CtaBanner({
  eyebrow = 'Get Parkfnb',
  title = (
    <>
      Drive in.
      <br />
      Park. Relax.
    </>
  ),
  text = 'Download the app and book your first spot in under a minute.',
  actions,
}: {
  eyebrow?: string;
  title?: ReactNode;
  text?: string;
  actions?: ReactNode;
}) {
  return (
    <section className="section">
      <div className="container">
        <Reveal className="cta">
          <div className="cta-copy">
            <span className="eyebrow light">{eyebrow}</span>
            <h2 className="display light">{title}</h2>
            <p>{text}</p>
            {actions ?? (
              <div className="btn-row stack-sm">
                <Button to="/download" variant="white" icon={Smartphone}>
                  Get the driver app
                </Button>
                <Button to="/owners" variant="peach">
                  List your space
                </Button>
              </div>
            )}
          </div>
          <IsoCar className="cta-art" />
        </Reveal>
      </div>
    </section>
  );
}

/* ─── Phone: the app's Home screen ─────────────────────── */
export function PhoneHome() {
  return (
    <div className="phone" aria-hidden="true">
      <div className="phone-island" />
      <div className="phone-screen">
        <div className="status-bar">
          <span>9:41</span>
          <span className="bars">
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>
        <div className="app-top">
          <div>
            <p className="caption">Good morning</p>
            <p className="app-title">Find parking</p>
          </div>
          <IconCircle icon={Bell} size="sm" badge />
        </div>
        <div className="search-pill">
          <Search size={17} />
          <span>Where are you going?</span>
        </div>
        <div className="chip-row">
          <span className="chip is-on">Nearby</span>
          <span className="chip">Cheapest</span>
          <span className="chip">Covered</span>
          <span className="chip">EV</span>
        </div>
        <div className="section-row">
          <span>Nearby parking</span>
          <span className="muted">See all</span>
        </div>
        <div className="spot-card tone-peach">
          <div className="spot-top">
            <Tag>12 spots left</Tag>
            <span className="heart">
              <Heart size={15} />
            </span>
          </div>
          <IsoCar className="spot-art" />
          <p className="spot-name">Skyline Tower Parking</p>
          <div className="spot-meta">
            <div>
              <b>1.2 km</b>
              <span>5 min drive</span>
            </div>
            <div>
              <b>&#8377;50/hr</b>
              <span>4.5 rating</span>
            </div>
          </div>
        </div>
        <div className="spot-card tone-blue short">
          <div className="spot-top">
            <Tag>4 spots left</Tag>
            <span className="heart">
              <Heart size={15} />
            </span>
          </div>
          <IsoCar tone="blue" className="spot-art" />
          <p className="spot-name">City Centre Mall</p>
        </div>
        <div className="tab-bar">
          <span className="tab is-on">
            <HomeIcon size={19} />
          </span>
          <span className="tab">
            <Search size={19} />
          </span>
          <span className="tab">
            <Bookmark size={19} />
          </span>
          <span className="tab">
            <User size={19} />
          </span>
        </div>
      </div>
    </div>
  );
}

export function HeroFloats() {
  return (
    <>
      <div className="float-card float-confirm" aria-hidden="true">
        <div className="float-row">
          <Tag tone="success">Confirmed</Tag>
          <span className="caption">#PFB-28491</span>
        </div>
        <p className="float-title">Skyline Tower, Bay B-14</p>
        <ProgressTrack steps={4} current={2} labels={['Booked', 'Paid', 'Arriving', 'Parked']} />
      </div>
      <div className="float-card float-gate" aria-hidden="true">
        <IconCircle icon={Zap} variant="ink" size="sm" />
        <div>
          <p className="float-title">Gate opened</p>
          <p className="caption">MP 09 AB 1234 recognised</p>
        </div>
      </div>
    </>
  );
}

/* ─── Booking Details screen ───────────────────────────── */
export function DetailsMock() {
  return (
    <div className="details-mock" aria-hidden="true">
      <div className="mock-header">
        <ArrowLeft size={22} />
        <span>Details</span>
        <i />
      </div>
      <div className="summary-card">
        <IsoCar className="summary-art" />
        <div className="summary-top">
          <div>
            <p className="grid-label">Booking id</p>
            <p className="summary-ref">
              #PFB-28491 <Copy size={15} color="#8A8A8A" />
            </p>
          </div>
          <div className="right">
            <p className="grid-label">Status</p>
            <Tag>Confirmed</Tag>
          </div>
        </div>
        <dl className="info-grid">
          {[
            ['Parking', 'Skyline Tower'],
            ['Rate', '₹50/hr'],
            ['Date', '8 Sep 2026'],
            ['Time', '1:00 PM - 3:00 PM'],
            ['Duration', '2 hours'],
            ['Vehicle', 'MP 09 AB 1234'],
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="sheet">
        <i className="grabber" />
        <p className="sheet-lead">You're all set. Show up and the gate will let you in.</p>
        <Timeline
          items={[
            { title: 'Booking confirmed', sub: 'Bay B-14 is held for you', time: '12:26 PM', active: true },
            { title: 'Payment received', sub: '₹100 via UPI', time: '12:25 PM' },
            { title: 'Request sent', sub: 'Sent to the parking owner', time: '12:25 PM' },
          ]}
        />
      </div>
    </div>
  );
}

/* ─── Owner earnings card ──────────────────────────────── */
export function EarningsMock() {
  const bars = [42, 58, 36, 70, 64, 88, 76];
  return (
    <div className="owners-art" aria-hidden="true">
      <div className="card earn-card">
        <div className="earn-head">
          <div>
            <p className="caption">Earnings this month</p>
            <p className="earn-value">&#8377;24,580</p>
          </div>
          <Tag tone="success">+18%</Tag>
        </div>
        <div className="bars-chart">
          {bars.map((h, i) => (
            <i key={i} className={i === bars.length - 1 ? 'today' : ''} style={{ ['--h' as string]: `${h}%` }} />
          ))}
        </div>
        <div className="bars-labels">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="earn-stats">
          <div>
            <b>86</b>
            <span>Bookings</span>
          </div>
          <div>
            <b>72%</b>
            <span>Occupancy</span>
          </div>
          <div>
            <b>4.7</b>
            <span>Rating</span>
          </div>
        </div>
      </div>
      <div className="card request-card">
        <div className="avatar">RS</div>
        <div className="req-body">
          <b>New booking request</b>
          <span>Today, 6:00 PM - 9:00 PM</span>
        </div>
        <div className="req-actions">
          <span className="btn btn-grey btn-xs">Decline</span>
          <span className="btn btn-ink btn-xs">Approve</span>
        </div>
      </div>
    </div>
  );
}
