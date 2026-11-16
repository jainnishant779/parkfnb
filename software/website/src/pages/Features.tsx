import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bell,
  Camera,
  Car,
  CheckCircle2,
  Heart,
  History,
  MessageSquare,
  Star,
} from 'lucide-react';
import { Button, CheckList, IconCircle, Reveal, SectionHead, Segmented, Tag } from '../components/ui';
import { CtaBanner, PageHero, usePageMeta } from '../components/blocks';
import IsoCar from '../components/IsoCar';
import { inr } from '../data/site';

/* ─── Find: filters change the result count ────────────── */
const FILTERS = ['Covered', 'EV charging', 'CCTV', 'SUV-friendly', 'Under ₹40/hr'] as const;
const SPOTS = [
  { x: 22, y: 30, price: 40, tags: ['Covered', 'CCTV'] },
  { x: 62, y: 22, price: 50, tags: ['CCTV', 'SUV-friendly'] },
  { x: 78, y: 62, price: 30, tags: ['Covered', 'EV charging', 'CCTV'] },
  { x: 40, y: 70, price: 35, tags: ['SUV-friendly'] },
  { x: 50, y: 45, price: 60, tags: ['Covered', 'EV charging', 'CCTV', 'SUV-friendly'] },
  { x: 14, y: 72, price: 25, tags: [] as string[] },
];

function FindDemo() {
  const [active, setActive] = useState<string[]>(['CCTV']);
  const toggle = (f: string) => setActive((a) => (a.includes(f) ? a.filter((x) => x !== f) : [...a, f]));
  const matches = SPOTS.filter((s) =>
    active.every((f) => (f.startsWith('Under') ? s.price < 40 : s.tags.includes(f))),
  );
  return (
    <div className="card">
      <div className="mock-title">
        <span>Nearby parking</span>
        <Tag tone={matches.length ? 'ink' : 'danger'}>{matches.length} spots</Tag>
      </div>
      <div className="mini-map">
        <svg className="route" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M5 90 C 25 80, 30 60, 50 45 S 80 30, 95 10" stroke="#F6CB91" strokeWidth="1.6" fill="none" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
        </svg>
        {SPOTS.map((s, i) => {
          const on = matches.includes(s);
          return (
            <span
              key={i}
              className={`map-pin ${on ? 'on' : ''}`}
              style={{ left: `${s.x}%`, top: `${s.y}%`, opacity: on ? 1 : 0.28 }}
            >
              {inr(s.price)}
            </span>
          );
        })}
      </div>
      <div className="chip-row wrap" style={{ marginTop: 14 }}>
        {FILTERS.map((f) => (
          <button key={f} type="button" className={`chip ${active.includes(f) ? 'is-on' : ''}`} onClick={() => toggle(f)} aria-pressed={active.includes(f)}>
            {f}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Book: dates + hours update the total ─────────────── */
function BookDemo() {
  const days = useMemo(() => {
    const out: Date[] = [];
    const now = new Date();
    for (let i = 0; i < 5; i++) out.push(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i));
    return out;
  }, []);
  const [day, setDay] = useState(0);
  const [hours, setHours] = useState(3);
  const rate = 50;
  return (
    <div className="card">
      <div className="mock-title">
        <span>Select date</span>
        <span className="caption">{days[day].toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {days.map((d, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setDay(i)}
            className={`chip ${day === i ? 'is-on' : ''}`}
            style={{ height: 72, flexDirection: 'column', justifyContent: 'center', gap: 0, padding: 0, borderRadius: 18 }}
          >
            <span style={{ fontSize: 11, opacity: 0.7 }}>{i === 0 ? 'Today' : d.toLocaleDateString('en-IN', { weekday: 'short' })}</span>
            <span style={{ fontSize: 20, fontWeight: 700 }}>{d.getDate()}</span>
          </button>
        ))}
      </div>
      <p className="mock-title" style={{ marginTop: 18 }}>
        Duration
      </p>
      <div className="hour-row" style={{ marginTop: 0 }}>
        {[1, 2, 3, 4, 6, 8].map((h) => (
          <button key={h} type="button" className={`hour ${hours === h ? 'is-on' : ''}`} style={hours === h ? undefined : { background: 'var(--fill)' }} onClick={() => setHours(h)}>
            {h}h
          </button>
        ))}
      </div>
      <div className="mock-total">
        <span className="body-2">
          {inr(rate)} x {hours} {hours === 1 ? 'hour' : 'hours'}
        </span>
        <b>{inr(rate * hours)}</b>
      </div>
    </div>
  );
}

/* ─── Get in: three methods ────────────────────────────── */
type Method = 'plate' | 'qr' | 'code';
const QR = '111111101100000101101110101101110101100000101111111101000010001101011011100110011010111010101101';

function AccessDemo() {
  const [method, setMethod] = useState<Method>('plate');
  return (
    <div className="card" style={{ display: 'grid', gap: 18, justifyItems: 'center', textAlign: 'center' }}>
      <Segmented
        label="Entry method"
        options={[
          { value: 'plate', label: 'Plate' },
          { value: 'qr', label: 'QR pass' },
          { value: 'code', label: 'Code' },
        ]}
        value={method}
        onChange={setMethod}
      />
      <div style={{ minHeight: 170, display: 'grid', placeItems: 'center' }}>
        {method === 'plate' && (
          <div style={{ display: 'grid', gap: 14, justifyItems: 'center' }}>
            <IconCircle icon={Camera} variant="ink" size="lg" />
            <span className="plate" style={{ fontSize: 20, height: 46 }}>
              MP 09 AB 1234
            </span>
            <Tag tone="success">
              <CheckCircle2 size={14} /> Barrier opening
            </Tag>
          </div>
        )}
        {method === 'qr' && (
          <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
            <div className="qr-box" aria-hidden="true">
              {Array.from({ length: 81 }).map((_, i) => (
                <i key={i} className={QR[i % QR.length] === '1' ? '' : 'off'} />
              ))}
            </div>
            <span className="caption">Refreshes every 30 seconds</span>
          </div>
        )}
        {method === 'code' && (
          <div style={{ display: 'grid', gap: 14, justifyItems: 'center' }}>
            <div className="otp-row">
              {'482917'.split('').map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>
            <span className="caption">Type it on the gate keypad. Works offline.</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── While parked: live countdown + extend ────────────── */
function ParkedDemo() {
  const [left, setLeft] = useState(84 * 60 + 59);
  const [extended, setExtended] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(t);
  }, []);
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <div className="stack">
      <div className="card">
        <div className="mock-title">
          <span>Time left</span>
          <Tag tone="success">Active</Tag>
        </div>
        <p className="countdown" aria-live="off">
          {h}:{pad(m)}:{pad(s)}
        </p>
        <p className="caption" style={{ marginTop: 8 }}>
          Skyline Tower, Bay B-14{extended ? ` · extended by ${extended}h` : ''}
        </p>
        <div className="btn-row" style={{ marginTop: 16 }}>
          <Button
            size="sm"
            onClick={() => {
              setLeft((x) => x + 3600);
              setExtended((e) => e + 1);
            }}
          >
            Extend 1 hour
          </Button>
        </div>
      </div>
      <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '16px 18px' }}>
        <IconCircle icon={Bell} variant="peach" size="sm" />
        <div>
          <b style={{ fontWeight: 600 }}>15 minutes left</b>
          <p className="caption">Extend now or head back to your car.</p>
        </div>
      </div>
    </div>
  );
}

export default function Features() {
  usePageMeta('Features', 'Live availability, flexible bookings, in-app payments and automatic gate entry.');
  return (
    <>
      <PageHero
        eyebrow="Features"
        title={
          <>
            Built for the
            <br />
            whole trip.
          </>
        }
        lead="Not just a list of parking lots. Parkfnb handles the search, the booking, the payment and the gate, so the only thing left is parking."
        tone="peach"
        art={<IsoCar className="iso" />}
        actions={
          <Button to="/download" iconRight={ArrowRight}>
            Get the app
          </Button>
        }
      />

      <section className="section">
        <div className="container feature-rows">
          <div className="split">
            <Reveal className="feature-copy">
              <Tag tone="peach">Find</Tag>
              <h2 className="h1">See every open bay around you.</h2>
              <p className="lead">Search a destination or use your location. Open spots update live, and filters cut the list down to the ones that suit you.</p>
              <CheckList
                items={['Map and list views with distance and walking time', 'Filters for price, covered, EV charging, CCTV and vehicle size', 'Photos, amenities and gate instructions for every space', 'Save favourites for the places you go every week']}
              />
            </Reveal>
            <Reveal className="feature-visual tone-peach" delay={80}>
              <FindDemo />
            </Reveal>
          </div>

          <div className="split reverse">
            <Reveal className="feature-copy">
              <Tag tone="blue">Book</Tag>
              <h2 className="h1">Book exactly the time you need.</h2>
              <p className="lead">Pick a date, choose how long, and see the price before you commit. No guessing at the gate.</p>
              <CheckList
                items={['Hourly, daily, weekly and monthly bookings', 'Book now or days ahead from the calendar', 'Instant booking, or a quick approval from the owner', 'Price breakdown frozen before you pay']}
              />
            </Reveal>
            <Reveal className="feature-visual tone-blue" delay={80}>
              <BookDemo />
            </Reveal>
          </div>

          <div className="split">
            <Reveal className="feature-copy">
              <Tag tone="peach">Pay</Tag>
              <h2 className="h1">Pay before you arrive.</h2>
              <p className="lead">No cash, no touts, no arguments over the fare. You pay in the app and get a proper receipt.</p>
              <CheckList items={['UPI, debit and credit cards, and FASTag', 'Base price, fees and GST listed separately', 'Digital receipts saved with every booking', 'Refunds go straight back to how you paid']} />
            </Reveal>
            <Reveal className="feature-visual tone-cream" delay={80}>
              <div className="card">
                <div className="mock-title">
                  <span>Price breakdown</span>
                  <Tag tone="success">Paid</Tag>
                </div>
                <div className="mock-row">
                  <span>Base price ({inr(50)} x 3 hours)</span>
                  <b>{inr(150)}</b>
                </div>
                <div className="mock-row">
                  <span>Convenience fee</span>
                  <b>{inr(10)}</b>
                </div>
                <div className="mock-row">
                  <span>GST</span>
                  <b>{inr(29)}</b>
                </div>
                <div className="mock-total">
                  <span className="body-2">Total</span>
                  <b>{inr(189)}</b>
                </div>
                <div className="chip-row wrap" style={{ marginTop: 16 }}>
                  <span className="chip is-on">UPI</span>
                  <span className="chip">Card</span>
                  <span className="chip">FASTag</span>
                </div>
              </div>
            </Reveal>
          </div>

          <div className="split reverse">
            <Reveal className="feature-copy">
              <Tag tone="blue">Get in</Tag>
              <h2 className="h1">Get in without stopping.</h2>
              <p className="lead">Your booking is your key. Depending on the gate, it opens for your number plate, your phone or a six-digit code.</p>
              <CheckList items={['Number-plate cameras at larger lots', 'App unlock and a QR pass that refreshes every 30 seconds', 'A keypad code that works offline', 'Entry from 15 minutes before your start time']} />
              <div className="btn-row">
                <Button to="/smart-gates" variant="white" size="md" iconRight={ArrowRight}>
                  How smart gates work
                </Button>
              </div>
            </Reveal>
            <Reveal className="feature-visual tone-ink" delay={80}>
              <AccessDemo />
            </Reveal>
          </div>

          <div className="split">
            <Reveal className="feature-copy">
              <Tag tone="peach">Stay</Tag>
              <h2 className="h1">Stay in control while you're parked.</h2>
              <p className="lead">A live timer, a reminder before your time runs out, and a one-tap extension if the bay is still free.</p>
              <CheckList items={['Live countdown on your booking', 'Reminder 15 minutes before the end', 'Extend from the app if the bay is free', 'Directions back to the entrance']} />
            </Reveal>
            <Reveal className="feature-visual tone-grey" delay={80}>
              <ParkedDemo />
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHead eyebrow="And the little things" title="Small details that add up." />
          <div className="mini-grid">
            {[
              { icon: Car, title: 'Saved vehicles', text: 'Add every car you drive and switch between them when you book.' },
              { icon: Heart, title: 'Favourites', text: 'Keep the spots you use most one tap away.' },
              { icon: Bell, title: 'Notifications', text: 'Confirmations, reminders and owner messages, as they happen.' },
              { icon: Star, title: 'Ratings and reviews', text: 'Rate each stay and read what other drivers say before you book.' },
              { icon: MessageSquare, title: 'Help in the app', text: 'Raise a ticket from any booking and track the reply.' },
              { icon: History, title: 'Booking history', text: 'Every past booking with its receipt, ready when you need it.' },
            ].map((f, i) => (
              <Reveal className="card mini-card" key={f.title} delay={(i % 3) * 60}>
                <IconCircle icon={f.icon} variant="grey" />
                <h3 className="h3">{f.title}</h3>
                <p>{f.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CtaBanner />
    </>
  );
}
