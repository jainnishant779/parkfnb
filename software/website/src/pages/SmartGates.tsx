import {
  Activity,
  ArrowRight,
  BatteryLow,
  Bluetooth,
  Camera,
  CheckCircle2,
  ClipboardList,
  KeyRound,
  Lock,
  QrCode,
  RadioTower,
  ScanLine,
  ShieldCheck,
  Smartphone,
  WifiOff,
} from 'lucide-react';
import { Button, CheckList, IconCircle, Reveal, SectionHead, Tag, Timeline } from '../components/ui';
import { CtaBanner, PageHero, usePageMeta } from '../components/blocks';
import IsoCar from '../components/IsoCar';

const QR = '1111111011000001011011101011011101011000001011111111010000100011010110111001100110101110101011010';

export default function SmartGates() {
  usePageMeta('Smart gates', 'Number-plate recognition, app unlock, QR passes and keypad codes: how Parkfnb opens the gate.');
  return (
    <>
      <PageHero
        eyebrow="Smart gates"
        title={
          <>
            The gate knows
            <br />
            you're coming.
          </>
        }
        lead="Parkfnb links every booking to the barrier at the bay. The right car gets in at the right time, without a ticket, a guard or a cash box."
        tone="ink"
        art={
          <div className="card" style={{ width: '100%', maxWidth: 400, color: 'var(--text)' }}>
            <div className="mock-title">
              <span>Gate B, entry lane</span>
              <Tag tone="success">Online</Tag>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '6px 0 18px' }}>
              <span className="plate">MP 09 AB 1234</span>
              <Tag tone="ink">Booking #PFB-28491</Tag>
            </div>
            <Timeline
              items={[
                { title: 'Barrier opened', sub: 'Entry logged, bay B-14 occupied', time: '10:02:16', active: true },
                { title: 'Booking matched', sub: 'Confirmed, 10:00 AM - 1:00 PM', time: '10:02:15' },
                { title: 'Plate read', sub: 'Entry camera, 98% confidence', time: '10:02:14' },
              ]}
            />
          </div>
        }
        actions={
          <>
            <Button to="/contact?topic=partnership" variant="peach" iconRight={ArrowRight}>
              Automate my gate
            </Button>
            <Button to="/how-it-works" variant="white">
              See the driver journey
            </Button>
          </>
        }
      />

      <section className="section">
        <div className="container">
          <SectionHead
            eyebrow="Three ways in"
            title="One booking, whichever gate you meet."
            lead="Each site uses the method that suits its hardware. Drivers never have to think about it: the app shows the right one."
          />
          <div className="method-grid">
            <Reveal as="article" className="card method-card tone-ink">
              <div className="method-visual">
                <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
                  <IconCircle icon={Camera} variant="glass" size="lg" />
                  <span className="plate">MP 09 AB 1234</span>
                </div>
              </div>
              <h3 className="h2">Number-plate recognition</h3>
              <CheckList items={['Cameras read the plate as you pull up', 'Matched to the vehicle on your booking', 'No phone needed, hands stay on the wheel']} />
            </Reveal>
            <Reveal as="article" className="card method-card tone-peach" delay={60}>
              <div className="method-visual">
                <div className="qr-box" style={{ width: 132, height: 132 }} aria-hidden="true">
                  {Array.from({ length: 81 }).map((_, i) => (
                    <i key={i} className={QR[i] === '1' ? '' : 'off'} />
                  ))}
                </div>
              </div>
              <h3 className="h2">App unlock and QR pass</h3>
              <CheckList items={['Tap to open over Bluetooth when you are near the barrier', 'A QR pass that refreshes every 30 seconds', 'Screenshots of an old pass will not work']} />
            </Reveal>
            <Reveal as="article" className="card method-card tone-blue" delay={120}>
              <div className="method-visual">
                <div className="otp-row">
                  {'482917'.split('').map((d, i) => (
                    <span key={i} style={{ background: '#fff' }}>
                      {d}
                    </span>
                  ))}
                </div>
              </div>
              <h3 className="h2">Keypad code</h3>
              <CheckList items={['A 6-digit code on your booking', 'Typed on the barrier keypad', 'Works offline and with a dead phone']} />
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHead eyebrow="Plate recognition" title="What happens in the two seconds at the barrier." />
          <div className="flow">
            {[
              { icon: ScanLine, label: 'Step 1', title: 'Plate read', text: 'The entry camera captures the number plate as the car slows down.' },
              { icon: ClipboardList, label: 'Step 2', title: 'Booking matched', text: 'The plate is checked against confirmed bookings for that site and time window.' },
              { icon: CheckCircle2, label: 'Step 3', title: 'Barrier opens', text: 'A signed command goes to the barrier controller, which lifts the arm.' },
              { icon: Activity, label: 'Step 4', title: 'Logged and live', text: 'The entry is recorded and the owner sees the bay as occupied in real time.' },
            ].map((f, i) => (
              <Reveal className="card flow-step" key={f.title} delay={i * 60}>
                <IconCircle icon={f.icon} variant={i % 2 ? 'blue' : 'peach'} />
                <span className="step-label">{f.label}</span>
                <h3 className="h3">{f.title}</h3>
                <p>{f.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHead
            eyebrow="Hardware"
            title="The right kit for every kind of space."
            lead="From one driveway to a mall basement. Start with app and QR check-in and add hardware when you are ready."
          />
          <div className="type-grid">
            {[
              { tone: 'peach' as const, tag: '1 to 2 bays', title: 'Single space', icon: Lock, kit: 'Battery-powered smart parking lock', items: ['Bolted to the bay floor', 'Lowers for the booked driver only', 'Ideal for driveways and porches'] },
              { tone: 'blue' as const, tag: '10 to 50 bays', title: 'Private lot', icon: QrCode, kit: 'Boom barrier with a QR scanner', items: ['Solar-powered options for open plots', 'QR, app and keypad entry', 'Works alongside a guard if you have one'] },
              { tone: 'grey' as const, tag: '50+ bays', title: 'Commercial site', icon: Camera, kit: 'High-speed barriers with plate cameras', items: ['Uses your existing CCTV where possible', 'Live occupancy for every level', 'A full audit trail of every entry'] },
            ].map((t, i) => (
              <Reveal as="article" className={`card type-card tone-${t.tone === 'grey' ? 'grey' : t.tone}`} key={t.title} delay={i * 60}>
                <IsoCar tone={t.tone} className="iso" />
                <div className="type-meta">
                  <Tag tone="white">{t.tag}</Tag>
                </div>
                <h3 className="h2">{t.title}</h3>
                <p style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600, color: 'var(--text)' }}>
                  <t.icon size={18} /> {t.kit}
                </p>
                <CheckList items={t.items} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHead eyebrow="Reliability" title="Built to keep the gate working." />
          <div className="mini-grid">
            {[
              { icon: WifiOff, title: 'Works without internet', text: 'Bluetooth passes are checked by the barrier itself, so a dropped connection does not lock anyone out.' },
              { icon: BatteryLow, title: 'Dead phone fallback', text: 'The keypad code gets drivers in even when their phone is flat.' },
              { icon: ShieldCheck, title: 'Passes that cannot be copied', text: 'Every pass is cryptographically signed and only valid for its booking window.' },
              { icon: RadioTower, title: 'Live device status', text: 'Owners see each barrier’s state, signal and last check-in from the owner app.' },
              { icon: Smartphone, title: 'Remote control', text: 'Open, close or stop a barrier from the app if a guest needs help.' },
              { icon: Bluetooth, title: 'Quick pairing', text: 'Pair a new lock or barrier over Bluetooth and run an open-and-close test in minutes.' },
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

      <CtaBanner
        eyebrow="For parking operators"
        title={
          <>
            Run a lot?
            <br />
            Let's talk.
          </>
        }
        text="Tell us about your site and we will suggest the right setup, from a single smart lock to plate cameras on every lane."
        actions={
          <div className="btn-row stack-sm">
            <Button to="/contact?topic=partnership" variant="peach" icon={KeyRound}>
              Talk to our team
            </Button>
            <Button to="/owners" variant="white">
              Owner benefits
            </Button>
          </div>
        }
      />
    </>
  );
}
