import { useState } from 'react';
import {
  ArrowRight,
  Bell,
  Briefcase,
  Calendar,
  Camera,
  Check,
  Clock,
  CreditCard,
  Download,
  KeyRound,
  Navigation,
  QrCode,
  Shield,
  ShoppingBag,
  Star,
  Truck,
  Compass,
} from 'lucide-react';
import IsoCar from '../components/IsoCar';
import { Accordion, Button, IconCircle, Reveal, SectionHead, Segmented, Tag } from '../components/ui';
import { CtaBanner, DetailsMock, EarningsMock, HeroFloats, PhoneHome, usePageMeta } from '../components/blocks';
import { faqs } from '../data/faqs';

const durations = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
] as const;
type Duration = (typeof durations)[number]['value'];

const hours = ['1h', '2h', '3h', '4h', '6h', '8h'];

export default function Home() {
  usePageMeta('Home', 'Find parking near you, reserve it in two taps and get in at the gate without a ticket.');
  const [duration, setDuration] = useState<Duration>('hourly');
  const [hour, setHour] = useState('3h');
  const homeFaqs = ['how-book', 'gate', 'durations', 'methods', 'cancel', 'list'];

  return (
    <>
      {/* Hero */}
      <section className="hero">
        <div className="container hero-grid">
          <Reveal>
            <span className="eyebrow-chip">
              <span className="live-dot" />
              Your city. Smarter parking.
            </span>
            <h1 className="display">
              Parking
              <br />
              made simple.
            </h1>
            <p className="lead">
              Find a spot near you, reserve it in two taps and get in at the gate without a ticket. No circling
              the block, no cash at the barrier.
            </p>
            <div className="btn-row stack-sm">
              <Button to="/download" variant="peach" icon={Download}>
                Download the app
              </Button>
              <Button to="/owners" variant="white">
                List your space
              </Button>
            </div>
            <ul className="hero-points">
              {['Hourly, daily or monthly', 'UPI and FASTag', 'Automatic gate entry'].map((t) => (
                <li key={t}>
                  <span className="tick" aria-hidden="true">
                    <Check size={12} strokeWidth={3} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal className="hero-art" delay={120}>
            <div className="halo halo-peach" />
            <div className="halo halo-blue" />
            <PhoneHome />
            <HeroFloats />
          </Reveal>
        </div>
      </section>

      {/* Who it's for */}
      <section className="section">
        <div className="container">
          <SectionHead eyebrow="Made for every trip" title="Wherever you're headed, there's a bay waiting." />
          <div className="audience">
            {[
              { icon: Briefcase, tone: 'peach', title: 'Daily commuters', text: 'A monthly pass near the office, so 9:30 is never a hunt.' },
              { icon: ShoppingBag, tone: 'blue', title: 'Shoppers and diners', text: 'Book 15 minutes before you arrive and pay by UPI.' },
              { icon: Compass, tone: 'grey', title: 'Travellers', text: 'Gated, CCTV-watched bays with photo directions in a new city.' },
              { icon: Truck, tone: 'white', title: 'Fleets and vans', text: 'Bays that fit larger vehicles, booked for the hours you need.' },
            ].map((a, i) => (
              <Reveal key={a.title} className={`card tone-${a.tone}`} delay={i * 60}>
                <IconCircle icon={a.icon} variant={a.tone === 'white' ? 'grey' : 'white'} />
                <b>{a.title}</b>
                <p>{a.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="section" id="how">
        <div className="container">
          <div className="section-head-row">
            <SectionHead eyebrow="How it works" title="From search to parked in three steps." />
            <Button to="/how-it-works" variant="white" size="md" iconRight={ArrowRight}>
              See the full journey
            </Button>
          </div>
          <div className="steps">
            {[
              { img: 'onboarding-1.jpg', title: 'Find a spot\nnear you', text: 'See live availability on the map and compare price, distance and amenities.' },
              { img: 'onboarding-2.jpg', title: 'Reserve in\ntwo taps', text: 'Pick your time, pay in the app and lock the slot before you even leave home.' },
              { img: 'onboarding-3.jpg', title: 'Drive in.\nPark. Relax.', text: 'The gate recognises your booking and lifts the barrier. We handle the rest.' },
            ].map((s, i) => (
              <Reveal
                as="article"
                key={s.img}
                className="step-card"
                delay={i * 80}
                style={{ ['--img' as string]: `url('/images/${s.img}')` }}
              >
                <div className="story">
                  {[0, 1, 2].map((n) => (
                    <i key={n} className={n <= i ? 'on' : ''} />
                  ))}
                </div>
                <span className="step-num">0{i + 1}</span>
                <div className="step-body">
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section" id="features">
        <div className="container">
          <div className="section-head-row">
            <SectionHead eyebrow="Features" title="Everything a driver needs, nothing they don't." />
            <Button to="/features" variant="white" size="md" iconRight={ArrowRight}>
              All features
            </Button>
          </div>
          <div className="bento">
            <Reveal as="article" className="card tone-peach b-live">
              <Tag>Live</Tag>
              <h3 className="h2">Real-time availability</h3>
              <p>Open bays update as cars come and go, so the spot you see is the spot you get.</p>
              <IsoCar className="bento-art" />
            </Reveal>
            <Reveal as="article" className="card tone-blue b-duration" delay={60}>
              <IconCircle icon={Clock} />
              <h3 className="h2">Book for as long as you need</h3>
              <p>Pay for an hour or keep a bay for the whole month.</p>
              <Segmented label="Booking duration" options={[...durations]} value={duration} onChange={setDuration} onTint />
              {duration === 'hourly' ? (
                <div className="hour-row" role="group" aria-label="Hours">
                  {hours.map((h) => (
                    <button key={h} type="button" className={`hour ${hour === h ? 'is-on' : ''}`} onClick={() => setHour(h)}>
                      {h}
                    </button>
                  ))}
                </div>
              ) : (
                <p style={{ marginTop: 14 }} className="caption">
                  {duration === 'daily' && 'Full-day access, in and out as often as you like.'}
                  {duration === 'weekly' && 'Seven days of guaranteed parking at a lower rate.'}
                  {duration === 'monthly' && 'A dedicated bay for the month, perfect for the office.'}
                </p>
              )}
            </Reveal>
            <Reveal as="article" className="card b-pay">
              <IconCircle icon={CreditCard} variant="grey" />
              <h3 className="h3">Pay your way</h3>
              <p>UPI, cards or FASTag, with an instant receipt for every booking.</p>
              <div className="chip-row wrap">
                <span className="chip">UPI</span>
                <span className="chip">FASTag</span>
                <span className="chip">Cards</span>
              </div>
            </Reveal>
            <Reveal as="article" className="card b-reviews" delay={60}>
              <IconCircle icon={Star} variant="grey" />
              <h3 className="h3">Reviews you can trust</h3>
              <p>Ratings and photos from drivers who actually parked there.</p>
              <div className="rating">
                <b>4.5</b>
                <span className="stars">
                  {[0, 1, 2, 3, 4].map((n) => (
                    <Star key={n} size={17} fill={n < 4 ? 'currentColor' : 'none'} />
                  ))}
                </span>
                <span className="caption">120 reviews</span>
              </div>
            </Reveal>
            <Reveal as="article" className="card tone-ink b-gate" delay={120}>
              <IconCircle icon={Camera} variant="glass" />
              <h3 className="h3">The gate opens itself</h3>
              <p>Number-plate cameras match your booking and lift the barrier. No ticket, no attendant.</p>
              <div className="plate-row">
                <span className="plate">MP 09 AB 1234</span>
                <Tag tone="success">Access granted</Tag>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Bookings */}
      <section className="section">
        <div className="container split">
          <Reveal className="split-copy">
            <span className="eyebrow">Your bookings</span>
            <h2 className="h1">Every booking, tracked from request to exit.</h2>
            <p className="lead">Status, directions, timings and payment for each booking, on one screen.</p>
            <div className="card list-card">
              {[
                { icon: Bell, t: 'Live status', s: 'Know the moment your booking is confirmed' },
                { icon: Navigation, t: 'Directions to the gate', s: 'One tap opens the route in your maps app' },
                { icon: Shield, t: 'Secure payments', s: 'Receipts saved against every booking' },
                { icon: Calendar, t: 'Change of plans', s: 'Extend, modify or cancel from the booking screen' },
              ].map((r) => (
                <div className="list-row" key={r.t}>
                  <span className="row-icon">
                    <r.icon size={18} />
                  </span>
                  <div>
                    <b>{r.t}</b>
                    <span className="sub">{r.s}</span>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal delay={100} style={{ display: 'flex', justifyContent: 'center' }}>
            <DetailsMock />
          </Reveal>
        </div>
      </section>

      {/* Smart gates teaser */}
      <section className="section">
        <div className="container">
          <Reveal className="gate-band tone-ink">
            <div>
              <span className="eyebrow light">Smart gates</span>
              <h2 className="h1">Three ways in. No ticket, no attendant.</h2>
              <p className="lead">
                Parkfnb connects your booking to the barrier itself, so the gate knows you are coming and lets you in on
                time, every time.
              </p>
              <div className="btn-row">
                <Button to="/smart-gates" variant="peach" iconRight={ArrowRight}>
                  How smart gates work
                </Button>
              </div>
            </div>
            <div className="access-grid">
              {[
                { icon: Camera, t: 'Number-plate recognition', s: 'Cameras read your plate and open the barrier for your booked vehicle.' },
                { icon: QrCode, t: 'App unlock and QR pass', s: 'Tap to open from the app, or show a pass that refreshes every 30 seconds.' },
                { icon: KeyRound, t: '6-digit keypad code', s: 'A backup code that works even if your phone battery has died.' },
              ].map((a) => (
                <div className="access-item" key={a.t}>
                  <IconCircle icon={a.icon} variant="glass" />
                  <div>
                    <b>{a.t}</b>
                    <p>{a.s}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Owners */}
      <section className="section">
        <div className="container">
          <Reveal className="owners">
            <div>
              <span className="eyebrow">For space owners</span>
              <h2 className="h1">Turn an empty space into steady income.</h2>
              <p className="lead">
                Driveway, office basement or a full lot. List it on Parkfnb and choose when it is available and what it
                costs.
              </p>
              <ol className="owner-steps">
                {[
                  ['List your space', 'Add photos, set the location and describe the spot.'],
                  ['Set your pricing', 'Hourly, daily or monthly rates on your own schedule.'],
                  ['Approve bookings', 'Only verified drivers can book your space.'],
                  ['Get paid', 'Track earnings, bookings and occupancy in one dashboard.'],
                ].map(([t, s], i) => (
                  <li key={t}>
                    <span className="num-dot">{i + 1}</span>
                    <div>
                      <b>{t}</b>
                      <p>{s}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="btn-row stack-sm">
                <Button to="/owners" iconRight={ArrowRight}>
                  Become a host
                </Button>
                <Button to="/owners#calculator" variant="white">
                  Estimate earnings
                </Button>
              </div>
            </div>
            <EarningsMock />
          </Reveal>
        </div>
      </section>

      {/* FAQ preview */}
      <section className="section" id="faq">
        <div className="container faq-wrap">
          <SectionHead eyebrow="FAQ" title="Questions, answered." lead="The short version. There are plenty more on the FAQ page.">
            <Button to="/faq" variant="white" size="md" iconRight={ArrowRight}>
              All questions
            </Button>
          </SectionHead>
          <Reveal>
            <Accordion
              items={homeFaqs
                .map((id) => faqs.find((f) => f.id === id)!)
                .map((f) => ({ key: f.id, q: f.q, a: f.a }))}
            />
          </Reveal>
        </div>
      </section>

      <CtaBanner />
    </>
  );
}
