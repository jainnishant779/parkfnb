import { useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  CalendarOff,
  Clock,
  Eye,
  IndianRupee,
  ToggleRight,
  Users,
} from 'lucide-react';
import { Accordion, Button, CheckList, IconCircle, Reveal, SectionHead, Tag, Timeline } from '../components/ui';
import { CtaBanner, EarningsMock, PageHero, usePageMeta } from '../components/blocks';
import IsoCar from '../components/IsoCar';
import { faqs } from '../data/faqs';
import { inr } from '../data/site';

type Preset = 'driveway' | 'lot' | 'commercial';
const PRESETS: Record<Preset, { label: string; bays: number; rate: number; hours: number; days: number }> = {
  driveway: { label: 'Driveway', bays: 1, rate: 40, hours: 4, days: 25 },
  lot: { label: 'Private lot', bays: 25, rate: 30, hours: 6, days: 30 },
  commercial: { label: 'Commercial', bays: 80, rate: 40, hours: 8, days: 30 },
};

function Range({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format: (n: number) => string;
  onChange: (n: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="range-field">
      <div className="range-head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{format(value)}</output>
      </div>
      <input
        id={id}
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--fill-pct' as string]: `${pct}%` }}
      />
    </div>
  );
}

function Calculator() {
  const [preset, setPreset] = useState<Preset | null>('driveway');
  const [bays, setBays] = useState(PRESETS.driveway.bays);
  const [rate, setRate] = useState(PRESETS.driveway.rate);
  const [hours, setHours] = useState(PRESETS.driveway.hours);
  const [days, setDays] = useState(PRESETS.driveway.days);

  const apply = (p: Preset) => {
    const v = PRESETS[p];
    setPreset(p);
    setBays(v.bays);
    setRate(v.rate);
    setHours(v.hours);
    setDays(v.days);
  };
  const edit = (fn: (n: number) => void) => (n: number) => {
    setPreset(null);
    fn(n);
  };

  const monthly = bays * rate * hours * days;

  return (
    <div className="calc">
      <div className="card calc-controls">
        <div>
          <p className="h3" style={{ marginBottom: 12 }}>
            Start from a typical space
          </p>
          <div className="calc-presets">
            {(Object.keys(PRESETS) as Preset[]).map((p) => (
              <button key={p} type="button" className={`chip ${preset === p ? 'is-on' : ''}`} onClick={() => apply(p)} aria-pressed={preset === p}>
                {PRESETS[p].label}
              </button>
            ))}
          </div>
        </div>
        <Range id="bays" label="Number of bays" value={bays} min={1} max={150} format={(n) => `${n} ${n === 1 ? 'bay' : 'bays'}`} onChange={edit(setBays)} />
        <Range id="rate" label="Hourly rate" value={rate} min={10} max={150} step={5} format={(n) => `${inr(n)}/hr`} onChange={edit(setRate)} />
        <Range id="hours" label="Hours booked per day, per bay" value={hours} min={1} max={24} format={(n) => `${n} hrs`} onChange={edit(setHours)} />
        <Range id="days" label="Days per month" value={days} min={1} max={30} format={(n) => `${n} days`} onChange={edit(setDays)} />
      </div>
      <div className="card calc-result tone-ink" aria-live="polite">
        <span className="eyebrow light" style={{ marginBottom: 0 }}>
          Estimated monthly bookings
        </span>
        <p className="calc-big">{inr(monthly)}</p>
        <div>
          <div className="mock-row">
            <span>Per bay, per month</span>
            <b>{inr(monthly / bays)}</b>
          </div>
          <div className="mock-row">
            <span>Booked hours per month</span>
            <b>{(bays * hours * days).toLocaleString('en-IN')}</b>
          </div>
          <div className="mock-row">
            <span>Over a year</span>
            <b>{inr(monthly * 12)}</b>
          </div>
        </div>
        <p className="calc-note">
          Booking value before the platform commission and taxes. Real earnings depend on demand, location and the
          hours you open.
        </p>
        <Button to="/download" variant="peach" iconRight={ArrowRight}>
          Start listing
        </Button>
      </div>
    </div>
  );
}

export default function Owners() {
  usePageMeta('For owners', 'List your driveway, lot or building on Parkfnb, set your own prices and hours, and get paid weekly.');
  const ownerFaqs = faqs.filter((f) => f.category === 'owners');

  return (
    <>
      <PageHero
        eyebrow="For space owners"
        title={
          <>
            Your empty space
            <br />
            can earn.
          </>
        }
        lead="Driveway, office basement, open plot or mall level. List it on Parkfnb, decide when it is available and what it costs, and let verified drivers fill it."
        tone="blue"
        art={<EarningsMock />}
        actions={
          <>
            <Button to="/download" iconRight={ArrowRight}>
              Get the owner app
            </Button>
            <Button to="/owners#calculator" variant="white">
              Estimate earnings
            </Button>
          </>
        }
      />

      <section className="section">
        <div className="container">
          <SectionHead eyebrow="Who hosts on Parkfnb" title="Whatever the size, it works the same way." />
          <div className="type-grid">
            {[
              { tone: 'peach' as const, tag: '1 to 2 bays', title: 'Single space', text: 'A bungalow driveway, porch or garage that sits empty while you are at work.', items: ['Rent it out during office hours only', 'Approve each driver yourself', 'Example: ₹40/hr, 4 hrs a day, 25 days = ₹4,000 a month'] },
              { tone: 'blue' as const, tag: '10 to 50 bays', title: 'Private lot', text: 'An open plot, a gated yard or land waiting for development.', items: ['Open 24/7 or business hours', 'No more cash going missing at the gate', 'Layout help to fit more bays on your plot'] },
              { tone: 'grey' as const, tag: '50+ bays', title: 'Commercial site', text: 'Malls, hospitals, tech parks and residential societies.', items: ['Staff roles for guards and managers', 'GST-ready billing', 'Live occupancy across every level'] },
            ].map((t, i) => (
              <Reveal as="article" className={`card type-card tone-${t.tone}`} key={t.title} delay={i * 60}>
                <IsoCar tone={t.tone} className="iso" />
                <div className="type-meta">
                  <Tag tone="white">{t.tag}</Tag>
                </div>
                <h3 className="h2">{t.title}</h3>
                <p>{t.text}</p>
                <CheckList items={t.items} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="calculator">
        <div className="container">
          <SectionHead
            eyebrow="Earnings calculator"
            title="See what your space could bring in."
            lead="Move the sliders to match your space. The numbers update as you go."
          />
          <Reveal>
            <Calculator />
          </Reveal>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHead eyebrow="You stay in charge" title="Your space, your rules." />
          <div className="mini-grid">
            {[
              { icon: IndianRupee, title: 'Your prices', text: 'Set hourly and daily rates and a minimum booking length. Change them any time.' },
              { icon: Clock, title: 'Your hours', text: 'Weekly opening hours per space, so it is only booked when you are away.' },
              { icon: CalendarOff, title: 'Blackout dates', text: 'Need the space back for a day? Block it out in a couple of taps.' },
              { icon: ToggleRight, title: 'Instant or on request', text: 'Let drivers book instantly, or approve every request yourself.' },
              { icon: Users, title: 'Verified drivers only', text: 'Every driver signs up with a phone number and registered vehicle.' },
              { icon: Eye, title: 'See who is parked', text: 'Live occupancy and booking details for every bay, right in the app.' },
            ].map((f, i) => (
              <Reveal className="card mini-card" key={f.title} delay={(i % 3) * 60}>
                <IconCircle icon={f.icon} variant="blue" />
                <h3 className="h3">{f.title}</h3>
                <p>{f.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container split">
          <Reveal className="split-copy">
            <span className="eyebrow">Verification and payouts</span>
            <h2 className="h1">Verified once. Paid every week.</h2>
            <p className="lead">
              We check every owner before a listing goes live, which keeps drivers confident and your space protected.
            </p>
            <div className="card" style={{ marginTop: 28, maxWidth: 520 }}>
              <p className="h3" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                <BadgeCheck size={20} /> What you will need
              </p>
              <CheckList items={['PAN card', 'Aadhaar (front and back)', 'Property address proof, such as an electricity bill or property tax receipt', 'Bank account and IFSC for payouts']} />
            </div>
          </Reveal>
          <Reveal className="card pad-lg tone-cream" delay={80}>
            <div className="mock-title">
              <span>How a booking gets paid</span>
              <Tag tone="success">Weekly</Tag>
            </div>
            <div style={{ marginTop: 10 }}>
              <Timeline
                items={[
                  { title: 'Bank transfer', sub: 'Paid to your account every week, with a reference number', time: 'Weekly', active: true },
                  { title: 'Available balance', sub: 'Cleared earnings wait for the next payout run', time: '' },
                  { title: 'Dispute window', sub: '48 hours for the driver to report a problem', time: '48 hrs' },
                  { title: 'Booking completed', sub: 'The driver exits and your share is recorded', time: 'Day 0' },
                ]}
              />
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section">
        <div className="container faq-wrap">
          <SectionHead eyebrow="Owner questions" title="Before you list." lead="Anything else? Our partner team is happy to help.">
            <Button to="/contact?topic=list-space" variant="white" size="md" iconRight={ArrowRight}>
              Talk to us
            </Button>
          </SectionHead>
          <Reveal>
            <Accordion items={ownerFaqs.map((f) => ({ key: f.id, q: f.q, a: f.a }))} />
          </Reveal>
        </div>
      </section>

      <CtaBanner
        eyebrow="Become a host"
        title={
          <>
            List today.
            <br />
            Earn this week.
          </>
        }
        text="Download the Parkfnb Owner app, verify once and get your first space in front of drivers."
        actions={
          <div className="btn-row stack-sm">
            <Button to="/download" variant="peach" iconRight={ArrowRight}>
              Get the owner app
            </Button>
            <Button to="/contact?topic=list-space" variant="white">
              Talk to our team
            </Button>
          </div>
        }
      />
    </>
  );
}
