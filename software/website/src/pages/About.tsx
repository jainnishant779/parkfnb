import { ArrowRight, Banknote, Building2, Car, ChevronRight, DoorOpen, Hourglass, Lock, Receipt, Scale, ShieldCheck, Smartphone, WifiOff } from 'lucide-react';
import { Button, IconCircle, Reveal, SectionHead } from '../components/ui';
import { CtaBanner, PageHero, usePageMeta } from '../components/blocks';
import IsoCar from '../components/IsoCar';

const pipeline = ['Demand', 'Verified spaces', 'Reservation', 'Gate access', 'Live occupancy', 'Settlement'];

export default function About() {
  usePageMeta('About', 'Parkfnb connects drivers who need parking with owners who have space, and opens the gate between them.');
  return (
    <>
      <PageHero
        eyebrow="About Parkfnb"
        crumb="About"
        title="Parking that works like it should."
        lead="Parkfnb connects drivers looking for a spot with owners who have one to spare, then handles everything in between: the booking, the payment and the gate."
        tone="cream"
        art={<IsoCar className="iso" />}
      />

      <section className="section">
        <div className="container">
          <SectionHead
            eyebrow="The problem"
            title="Cities have parking. It's just hard to find and harder to get into."
          />
          <div className="problem-grid">
            {[
              { icon: Hourglass, tone: 'peach', title: 'Circling the block', text: 'Drivers spend twenty minutes hunting for a spot near the office or the market, and still end up on the street.' },
              { icon: Banknote, tone: 'blue', title: 'Cash and no receipts', text: 'Informal attendants charge whatever they like in cash, with no receipt and no one to complain to.' },
              { icon: DoorOpen, tone: 'grey', title: 'Empty spaces everywhere', text: 'Driveways, plots and basements sit empty for hours a day while the road outside is jammed.' },
            ].map((p, i) => (
              <Reveal as="article" className={`card problem-card tone-${p.tone}`} key={p.title} delay={i * 60}>
                <IconCircle icon={p.icon} />
                <h3 className="h2">{p.title}</h3>
                <p>{p.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <Reveal className="mission tone-ink">
            <span className="eyebrow light">Our mission</span>
            <blockquote>
              We are building the layer that turns scattered parking into one reliable network, from the first search to
              the barrier lifting.
            </blockquote>
            <div className="pipeline" aria-label="How Parkfnb closes the loop">
              {pipeline.map((step, i) => (
                <span key={step} style={{ display: 'contents' }}>
                  <span className="chip">{step}</span>
                  {i < pipeline.length - 1 ? <ChevronRight size={16} /> : null}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHead
            eyebrow="One platform"
            title="Three apps and the hardware at the gate."
            lead="Each side of a booking has its own tools, all running on the same system."
          />
          <div className="mini-grid">
            {[
              { icon: Car, title: 'The driver app', text: 'Search, book, pay and get in. Everything a driver needs from home to bay.', to: '/features' },
              { icon: Building2, title: 'The owner app', text: 'List spaces, set prices and hours, manage bookings and track payouts.', to: '/owners' },
              { icon: ShieldCheck, title: 'The operations console', text: 'Our team verifies owners and listings, watches live operations and resolves disputes.', to: '/how-it-works' },
            ].map((c, i) => (
              <Reveal className="card mini-card" key={c.title} delay={i * 60}>
                <IconCircle icon={c.icon} variant="peach" />
                <h3 className="h3">{c.title}</h3>
                <p>{c.text}</p>
                <Button to={c.to} variant="ghost" size="sm" iconRight={ArrowRight}>
                  Learn more
                </Button>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHead eyebrow="What we believe" title="The principles behind every decision." />
          <div className="mini-grid">
            {[
              { icon: Lock, title: 'Access, not just listings', text: 'A booking only matters if the gate opens. We connect the two, every time.' },
              { icon: Scale, title: 'Fair to both sides', text: 'Drivers see the full price upfront. Owners set their own rates and rules.' },
              { icon: Receipt, title: 'Cash-free and receipted', text: 'Every rupee is paid in the app and every booking has a proper receipt.' },
              { icon: ShieldCheck, title: 'Verified by default', text: 'Owners are verified before they list, and drivers sign up with a phone and vehicle.' },
              { icon: WifiOff, title: 'Works when things fail', text: 'Offline passes and keypad codes mean a bad network never strands a driver.' },
              { icon: Smartphone, title: 'Simple first', text: 'Two taps to book. If it needs explaining, we have not finished designing it.' },
            ].map((v, i) => (
              <Reveal className="card mini-card" key={v.title} delay={(i % 3) * 60}>
                <IconCircle icon={v.icon} variant="grey" />
                <h3 className="h3">{v.title}</h3>
                <p>{v.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CtaBanner
        eyebrow="Say hello"
        title={
          <>
            Let's fix parking
            <br />
            together.
          </>
        }
        text="Drivers, space owners, parking operators and city partners: we would love to hear from you."
        actions={
          <div className="btn-row stack-sm">
            <Button to="/contact" variant="peach" iconRight={ArrowRight}>
              Contact us
            </Button>
            <Button to="/download" variant="white">
              Get the app
            </Button>
          </div>
        }
      />
    </>
  );
}
