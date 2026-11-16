import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Ban,
  BadgeCheck,
  Building2,
  CalendarClock,
  Camera,
  Car,
  CreditCard,
  FileText,
  Landmark,
  LayoutGrid,
  Navigation,
  Receipt,
  Search,
  ShieldCheck,
  Smartphone,
  Timer,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Button, IconCircle, Reveal, SectionHead, Segmented, Tag, type TagTone } from '../components/ui';
import { CtaBanner, PageHero, PhoneHome, usePageMeta } from '../components/blocks';

type Audience = 'drivers' | 'owners';
type Step = { icon: LucideIcon; title: string; text: string; chips?: string[] };

const driverSteps: Step[] = [
  { icon: Smartphone, title: 'Sign up with your phone', text: 'Enter your mobile number and the one-time code we send. No password to remember.', chips: ['Phone OTP', 'Name and photo'] },
  { icon: Car, title: 'Add your vehicle', text: 'Make, model, number plate and type. The plate is what lets camera gates recognise you.', chips: ['Car', 'SUV', 'Two-wheeler', 'Van'] },
  { icon: Search, title: 'Search where you are going', text: 'Type a destination or tap "Near me". Switch between map and list and filter for what matters.', chips: ['Price', 'Distance', 'Covered', 'EV charging', 'CCTV'] },
  { icon: CalendarClock, title: 'Pick your time', text: 'Choose a date and a duration. The price breakdown is shown and frozen before you pay.', chips: ['Hourly', 'Daily', 'Weekly', 'Monthly'] },
  { icon: CreditCard, title: 'Pay in the app', text: 'Pay with UPI, card or FASTag. Your booking ID and entry pass are ready the moment payment goes through.', chips: ['UPI', 'Cards', 'FASTag'] },
  { icon: Navigation, title: 'Navigate to the bay', text: 'One tap opens turn-by-turn directions to the entrance, with photos and gate instructions from the owner.' },
  { icon: Camera, title: 'Get in at the gate', text: 'Plate cameras open the barrier on their own. Elsewhere, unlock from the app, show your QR pass or type your 6-digit code.', chips: ['Plate recognition', 'App unlock', 'QR pass', 'Keypad code'] },
  { icon: Timer, title: 'Park and relax', text: 'A live timer counts down your booking. We remind you 15 minutes before it ends, and you can extend if the bay is free.' },
  { icon: Receipt, title: 'Drive out and rate', text: 'The barrier opens on your way out, the booking closes and your receipt lands in the app. Leave a rating to help the next driver.' },
];

const ownerSteps: Step[] = [
  { icon: Smartphone, title: 'Sign up in the owner app', text: 'Use your phone number and choose your type: a single space, a private lot or a commercial site.', chips: ['Single space', 'Private lot', 'Commercial'] },
  { icon: FileText, title: 'Verify your identity', text: 'Upload PAN, Aadhaar, a property address proof and your bank details. Our team reviews them, usually within a few hours.', chips: ['PAN', 'Aadhaar', 'Address proof', 'Bank account'] },
  { icon: Building2, title: 'Add your property', text: 'Address, an entrance pin on the map, street photos and simple gate instructions for drivers.' },
  { icon: LayoutGrid, title: 'Add your spaces', text: 'Bay size, vehicle types, covered or open, and the amenities you offer.', chips: ['Covered', 'CCTV', 'EV charging', 'Guarded'] },
  { icon: Wallet, title: 'Set prices and hours', text: 'Hourly and daily rates, a minimum duration, weekly opening hours and blackout dates whenever you need the space back.' },
  { icon: ShieldCheck, title: 'Connect gate hardware (optional)', text: 'Pair a smart lock or boom barrier and run a quick open-and-close test, or start with QR and app check-in.' },
  { icon: BadgeCheck, title: 'Go live', text: 'We check the location and photos, then your listing appears to drivers nearby.' },
  { icon: CalendarClock, title: 'Manage bookings', text: 'Turn on instant booking or approve each request yourself. Live occupancy shows who is parked right now.' },
  { icon: Landmark, title: 'Get paid weekly', text: 'Earnings from completed bookings clear a 48-hour dispute window and are paid to your bank account every week.' },
];

const lifecycle: { tag: string; tone: TagTone; title: string; text: string }[] = [
  { tag: 'Pending', tone: 'warning', title: 'Request sent', text: 'You have paid and the request is with the owner. Instant-book spots skip this step.' },
  { tag: 'Confirmed', tone: 'ink', title: 'Bay held for you', text: 'Your entry pass is active from 15 minutes before your start time.' },
  { tag: 'Active', tone: 'success', title: 'Parked', text: 'You are checked in. The timer runs and the exit reminder is set.' },
  { tag: 'Completed', tone: 'grey', title: 'Done', text: 'You have driven out. Your receipt is in the app and the owner is paid.' },
];

const outcomes: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Ban, title: 'Cancelled', text: 'You cancelled from the app. Any refund follows the policy shown when you booked.' },
  { icon: AlertCircle, title: 'Rejected', text: 'The owner could not take the request. You are refunded in full.' },
  { icon: Timer, title: 'No-show', text: 'Nobody checked in within 60 minutes of the start, so the bay was released.' },
];

export default function HowItWorks() {
  usePageMeta('How it works', 'The full Parkfnb journey for drivers and space owners, from sign-up to payout.');
  const [params, setParams] = useSearchParams();
  const audience: Audience = params.get('for') === 'owners' ? 'owners' : 'drivers';
  const steps = audience === 'drivers' ? driverSteps : ownerSteps;

  const setAudience = (a: Audience) => {
    const next = new URLSearchParams(params);
    if (a === 'owners') next.set('for', 'owners');
    else next.delete('for');
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHero
        eyebrow="How it works"
        title={
          <>
            Every step,
            <br />
            start to finish.
          </>
        }
        lead="Parkfnb closes the loop between finding a spot and actually getting in. Here is exactly what happens, whether you are parking or hosting."
        tone="cream"
        art={<PhoneHome />}
        actions={
          <>
            <Button to="/download" variant="ink" iconRight={ArrowRight}>
              Get the app
            </Button>
            <Button to="/owners" variant="white">
              List your space
            </Button>
          </>
        }
      />

      <section className="section">
        <div className="container narrow">
          <div className="tabs-bar">
            <Reveal>
              <span className="eyebrow">The journey</span>
              <h2 className="h1">{audience === 'drivers' ? 'For drivers' : 'For space owners'}</h2>
            </Reveal>
            <Segmented
              label="Choose journey"
              options={[
                { value: 'drivers', label: 'Drivers' },
                { value: 'owners', label: 'Owners' },
              ]}
              value={audience}
              onChange={setAudience}
            />
          </div>

          <ol className="journey" key={audience}>
            {steps.map((s, i) => (
              <Reveal as="li" className="journey-step" key={s.title} delay={Math.min(i, 3) * 40}>
                <span className="journey-num">{i + 1}</span>
                <div className="card journey-card">
                  <div>
                    <h3 className="h3">{s.title}</h3>
                    <p style={{ marginTop: 6 }}>{s.text}</p>
                  </div>
                  <div className="journey-side">
                    <IconCircle icon={s.icon} variant={i % 2 ? 'blue' : 'peach'} size="lg" />
                  </div>
                  {s.chips ? (
                    <div className="chip-row wrap">
                      {s.chips.map((c) => (
                        <span className="chip" key={c}>
                          {c}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHead
            eyebrow="Booking lifecycle"
            title="What your booking status means."
            lead="Every booking moves through the same four stages, and the app always shows which one you are in."
          />
          <div className="lifecycle">
            {lifecycle.map((l, i) => (
              <Reveal as="article" className="card status-card" key={l.tag} delay={i * 60}>
                <Tag tone={l.tone}>{l.tag}</Tag>
                <h3 className="h3">{l.title}</h3>
                <p>{l.text}</p>
              </Reveal>
            ))}
          </div>
          <div className="lifecycle-side">
            {outcomes.map((o) => (
              <Reveal className="card" key={o.title}>
                <IconCircle icon={o.icon} variant="grey" size="sm" />
                <div>
                  <b>{o.title}</b>
                  <p>{o.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHead eyebrow="Timing rules" title="The windows that keep every bay fair." />
          <div className="rules-grid">
            <Reveal className="card rule-card tone-peach">
              <span className="rule-num">
                15<small>min</small>
              </span>
              <h3 className="h3">Early arrival</h3>
              <p>Your pass works from 15 minutes before your start time, at no extra cost.</p>
            </Reveal>
            <Reveal className="card rule-card tone-blue" delay={60}>
              <span className="rule-num">
                60<small>min</small>
              </span>
              <h3 className="h3">Check-in grace</h3>
              <p>Running late? Your bay is held for an hour after your start time before it is released.</p>
            </Reveal>
            <Reveal className="card rule-card tone-ink" delay={120}>
              <span className="rule-num">
                15<small>min</small>
              </span>
              <h3 className="h3">Exit grace</h3>
              <p>You have 15 minutes after your booking ends to drive out before extra time is charged.</p>
            </Reveal>
          </div>
        </div>
      </section>

      <CtaBanner
        title={
          <>
            Ready when
            <br />
            you are.
          </>
        }
        text="Download Parkfnb, add your vehicle and book your first spot."
      />
    </>
  );
}
