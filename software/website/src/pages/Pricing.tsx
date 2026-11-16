import { useState } from 'react';
import { ArrowRight, Car, Building2 } from 'lucide-react';
import { Accordion, Button, CheckList, IconCircle, Reveal, SectionHead, Segmented } from '../components/ui';
import { CtaBanner, PageHero, usePageMeta } from '../components/blocks';
import { faqs } from '../data/faqs';
import { inr } from '../data/site';

// Illustration only: the real convenience fee comes from the server quote and
// is shown in the app before payment.
const EXAMPLE_FEE = 10;
const GST_RATE = 0.18;

type Unit = 'hours' | 'days';

function FareCalculator() {
  const [unit, setUnit] = useState<Unit>('hours');
  const [rate, setRate] = useState(50);
  const [qty, setQty] = useState(3);

  const max = unit === 'hours' ? 12 : 7;
  const qtyClamped = Math.min(qty, max);
  const base = rate * qtyClamped;
  const gst = (base + EXAMPLE_FEE) * GST_RATE;
  const total = base + EXAMPLE_FEE + gst;
  const ratePct = ((rate - 10) / (unit === 'hours' ? 140 : 990)) * 100;
  const qtyPct = ((qtyClamped - 1) / (max - 1)) * 100;

  const switchUnit = (u: Unit) => {
    setUnit(u);
    setRate(u === 'hours' ? 50 : 300);
    setQty(u === 'hours' ? 3 : 1);
  };

  return (
    <div className="calc">
      <div className="card calc-controls">
        <div>
          <p className="h3" style={{ marginBottom: 12 }}>
            How are you booking?
          </p>
          <Segmented
            label="Booking unit"
            options={[
              { value: 'hours', label: 'By the hour' },
              { value: 'days', label: 'By the day' },
            ]}
            value={unit}
            onChange={switchUnit}
          />
        </div>
        <div className="range-field">
          <div className="range-head">
            <label htmlFor="fare-rate">{unit === 'hours' ? 'Hourly rate' : 'Daily rate'}</label>
            <output htmlFor="fare-rate">
              {inr(rate)}/{unit === 'hours' ? 'hr' : 'day'}
            </output>
          </div>
          <input
            id="fare-rate"
            className="range"
            type="range"
            min={10}
            max={unit === 'hours' ? 150 : 1000}
            step={unit === 'hours' ? 5 : 10}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            style={{ ['--fill-pct' as string]: `${ratePct}%` }}
          />
        </div>
        <div className="range-field">
          <div className="range-head">
            <label htmlFor="fare-qty">{unit === 'hours' ? 'Hours' : 'Days'}</label>
            <output htmlFor="fare-qty">
              {qtyClamped} {unit === 'hours' ? (qtyClamped === 1 ? 'hour' : 'hours') : qtyClamped === 1 ? 'day' : 'days'}
            </output>
          </div>
          <input
            id="fare-qty"
            className="range"
            type="range"
            min={1}
            max={max}
            value={qtyClamped}
            onChange={(e) => setQty(Number(e.target.value))}
            style={{ ['--fill-pct' as string]: `${qtyPct}%` }}
          />
        </div>
      </div>
      <div className="card calc-result tone-ink" aria-live="polite">
        <span className="eyebrow light" style={{ marginBottom: 0 }}>
          You pay
        </span>
        <p className="calc-big">{'₹' + total.toFixed(2)}</p>
        <div>
          <div className="mock-row">
            <span>
              Base price ({inr(rate)} x {qtyClamped})
            </span>
            <b>{'₹' + base.toFixed(2)}</b>
          </div>
          <div className="mock-row">
            <span>Convenience fee (example)</span>
            <b>{'₹' + EXAMPLE_FEE.toFixed(2)}</b>
          </div>
          <div className="mock-row">
            <span>GST (18%)</span>
            <b>{'₹' + gst.toFixed(2)}</b>
          </div>
        </div>
        <p className="calc-note">
          An illustration. The owner sets the rate and the exact fee and tax are shown in the app before you pay.
        </p>
      </div>
    </div>
  );
}

export default function Pricing() {
  usePageMeta('Pricing', 'How Parkfnb pricing works for drivers and space owners, with a fare calculator.');
  const payFaqs = faqs.filter((f) => ['fees', 'methods', 'receipt', 'overstay', 'cancel', 'refund-time', 'payouts'].includes(f.id));

  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title={
          <>
            Upfront prices.
            <br />
            No surprises.
          </>
        }
        lead="Drivers see the full price before they pay. Owners list for free and keep control of their rates. Nobody haggles at the gate."
      />

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <div className="plan-grid">
            <Reveal as="article" className="card plan-card tone-peach">
              <IconCircle icon={Car} />
              <div>
                <span className="eyebrow">For drivers</span>
                <p className="plan-price">
                  Pay per booking
                </p>
              </div>
              <p className="body-2">The owner's rate for the time you book, a small convenience fee and GST. That's it.</p>
              <CheckList items={['No subscription or sign-up fee', 'Full breakdown before you pay', 'UPI, cards and FASTag', 'Receipt with every booking']} />
              <Button to="/download" iconRight={ArrowRight}>
                Get the app
              </Button>
            </Reveal>
            <Reveal as="article" className="card plan-card tone-ink" delay={80}>
              <IconCircle icon={Building2} variant="glass" />
              <div>
                <span className="eyebrow light">For owners</span>
                <p className="plan-price">
                  Free to list<small>commission on completed bookings</small>
                </p>
              </div>
              <p>You set the price. Parkfnb only earns when you do, through a commission on bookings that complete.</p>
              <CheckList items={['No listing or monthly fee', 'You choose rates, hours and minimum duration', 'Weekly payouts to your bank', 'Commission rate shown in the owner app before you go live']} />
              <Button to="/owners" variant="peach" iconRight={ArrowRight}>
                Start hosting
              </Button>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHead
            eyebrow="Fare calculator"
            title="Work out a booking before you book."
            lead="Pick a rate and a duration to see how the total is put together."
          />
          <Reveal>
            <FareCalculator />
          </Reveal>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHead eyebrow="Booking types" title="Pick the length that fits the trip." />
          <Reveal className="card table-card">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Best for</th>
                  <th>How it works</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Hourly', 'Shopping, dining, a meeting across town', 'Book from one hour up. Extend from the app if the bay is free.'],
                  ['Daily', 'Day trips, events, airport drop-offs', 'Full-day access at the daily rate, in and out as often as you need.'],
                  ['Weekly', 'Project work, short stays, visiting family', 'Seven days at one price, usually lower than paying daily.'],
                  ['Monthly', 'Daily office commute, residents', 'A bay held for you all month. The best rate per day.'],
                ].map(([t, b, h]) => (
                  <tr key={t}>
                    <td>
                      <b style={{ color: 'var(--text)' }}>{t}</b>
                    </td>
                    <td>{b}</td>
                    <td>{h}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
        </div>
      </section>

      <section className="section">
        <div className="container faq-wrap">
          <SectionHead eyebrow="Payments FAQ" title="Money questions." lead="How charges, receipts, refunds and payouts work.">
            <Button to="/faq" variant="white" size="md" iconRight={ArrowRight}>
              All questions
            </Button>
          </SectionHead>
          <Reveal>
            <Accordion items={payFaqs.map((f) => ({ key: f.id, q: f.q, a: f.a }))} />
          </Reveal>
        </div>
      </section>

      <CtaBanner />
    </>
  );
}
