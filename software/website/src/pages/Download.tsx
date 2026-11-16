import { ArrowRight, Building2, Car, Smartphone, UserPlus, CarFront, MapPin } from 'lucide-react';
import { Button, CheckList, IconCircle, Reveal, SectionHead, Tag } from '../components/ui';
import { PageHero, StoreButtons, usePageMeta } from '../components/blocks';
import IsoCar from '../components/IsoCar';
import { site } from '../data/site';

export default function Download() {
  usePageMeta('Download', 'Get the Parkfnb app for drivers or the Parkfnb Owner app for space owners.');
  const live = Boolean(site.stores.driver.ios || site.stores.driver.android);

  return (
    <>
      <PageHero
        eyebrow="Download"
        crumb="Download"
        title={
          <>
            Two apps.
            <br />
            One for each side.
          </>
        }
        lead={
          live
            ? 'Drivers book with Parkfnb. Space owners host with Parkfnb Owner. Both are free to download.'
            : 'Drivers book with Parkfnb. Space owners host with Parkfnb Owner. Both are launching on the App Store and Google Play soon: request early access and we will send you the link.'
        }
      />

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container app-grid">
          <Reveal as="article" className="card app-card tone-peach" id="driver">
            <IsoCar className="iso" />
            <div className="app-head">
              <span className="app-icon">
                <Car size={30} />
              </span>
              <div>
                <h2 className="h2">Parkfnb</h2>
                <p className="body-2">For drivers</p>
              </div>
            </div>
            <p className="body-2">Find, book and pay for parking, then get in at the gate without a ticket.</p>
            <CheckList items={['Live availability on a map', 'Hourly to monthly bookings', 'UPI, cards and FASTag', 'Plate, app, QR or keypad entry']} />
            <StoreButtons app="driver" />
            {!live ? <p className="store-note">Not in the stores yet. Tapping a button asks for early access.</p> : null}
          </Reveal>

          <Reveal as="article" className="card app-card tone-blue" id="owner" delay={80}>
            <IsoCar tone="blue" className="iso" />
            <div className="app-head">
              <span className="app-icon" style={{ color: '#DCE6FA' }}>
                <Building2 size={30} />
              </span>
              <div>
                <h2 className="h2">Parkfnb Owner</h2>
                <p className="body-2">For space owners</p>
              </div>
            </div>
            <p className="body-2">List your spaces, set prices and hours, approve bookings and track payouts.</p>
            <CheckList items={['Verification in the app', 'Pricing and availability controls', 'Live occupancy and bookings', 'Weekly payouts to your bank']} />
            <StoreButtons app="owner" />
            {!live ? <p className="store-note">Not in the stores yet. Tapping a button asks for early access.</p> : null}
          </Reveal>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHead eyebrow="Getting started" title="Up and parking in three minutes." />
          <div className="mini-grid">
            {[
              { icon: UserPlus, tag: 'Step 1', title: 'Sign up with your number', text: 'Enter your mobile number and the code we text you. No password.' },
              { icon: CarFront, tag: 'Step 2', title: 'Add your vehicle', text: 'Your plate number lets camera gates recognise your car.' },
              { icon: MapPin, tag: 'Step 3', title: 'Book your first spot', text: 'Search where you are going, pick a time and pay. Done.' },
            ].map((s, i) => (
              <Reveal className="card mini-card" key={s.title} delay={i * 60}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <IconCircle icon={s.icon} variant={i === 1 ? 'blue' : 'peach'} />
                  <Tag tone="grey">{s.tag}</Tag>
                </div>
                <h3 className="h3">{s.title}</h3>
                <p>{s.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <Reveal className="card pad-lg tone-ink" style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <IconCircle icon={Smartphone} variant="glass" size="lg" />
              <div>
                <h2 className="h2">Run a parking site?</h2>
                <p>Talk to us about onboarding many bays at once, with smart gates.</p>
              </div>
            </div>
            <Button to="/contact?topic=partnership" variant="peach" iconRight={ArrowRight}>
              Talk to our team
            </Button>
          </Reveal>
        </div>
      </section>
    </>
  );
}
