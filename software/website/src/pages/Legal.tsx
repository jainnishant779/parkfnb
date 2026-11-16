import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Reveal } from '../components/ui';
import { PageHero, usePageMeta } from '../components/blocks';
import { site } from '../data/site';

type Section = { id: string; title: string; body: ReactNode };

function LegalPage({ eyebrow, title, lead, sections }: { eyebrow: string; title: string; lead: string; sections: Section[] }) {
  return (
    <>
      <PageHero eyebrow={eyebrow} crumb={eyebrow} title={title} lead={lead} />
      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container legal">
          <nav className="card legal-toc" aria-label="On this page">
            {sections.map((s, i) => (
              <a key={s.id} href={`#${s.id}`}>
                {i + 1}. {s.title}
              </a>
            ))}
          </nav>
          <Reveal className="card legal-body">
            <div className="prose">
              <p className="caption">Last updated {site.legalUpdated}</p>
              {sections.map((s, i) => (
                <section key={s.id} style={{ display: 'grid', gap: 12 }}>
                  <h2 id={s.id}>
                    {i + 1}. {s.title}
                  </h2>
                  {s.body}
                </section>
              ))}
              <div className="legal-note">
                <Info size={18} style={{ flex: 'none', marginTop: 1 }} />
                <span>
                  Questions about this page? Email <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>.
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

export function Privacy() {
  usePageMeta('Privacy policy', 'What Parkfnb collects, why, and the choices you have.');
  const sections: Section[] = [
    {
      id: 'scope',
      title: 'Who we are and what this covers',
      body: (
        <p>
          This policy explains how Parkfnb ("we", "us") handles personal information when you use the Parkfnb app, the
          Parkfnb Owner app, our website and the gate hardware at Parkfnb locations.
        </p>
      ),
    },
    {
      id: 'collect',
      title: 'Information we collect',
      body: (
        <>
          <ul>
            <li>
              <strong>Account details:</strong> your mobile number, name, and optionally your email and profile photo.
            </li>
            <li>
              <strong>Vehicle details:</strong> make, model, type and number plate for each vehicle you add.
            </li>
            <li>
              <strong>Location:</strong> your device location while you use the app, to show parking near you and give
              directions. We do not track you in the background.
            </li>
            <li>
              <strong>Bookings and payments:</strong> the spaces you book, times, amounts and payment status. Card and
              UPI details are handled by our payment partner; we do not store full card numbers.
            </li>
            <li>
              <strong>Gate events:</strong> at locations with number-plate cameras, the plate read and the time of entry
              and exit, used to match your booking.
            </li>
            <li>
              <strong>Owner verification:</strong> for space owners, PAN, Aadhaar, property address proof and bank
              details.
            </li>
            <li>
              <strong>Support and reviews:</strong> messages you send us and ratings you leave.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'use',
      title: 'How we use it',
      body: (
        <ul>
          <li>To create your account, show available parking and process bookings and payments.</li>
          <li>To open the gate for your booking and record entry and exit.</li>
          <li>To verify owners and listings and pay owners for completed bookings.</li>
          <li>To send booking confirmations, reminders and service messages.</li>
          <li>To handle support requests, disputes and refunds, and to prevent fraud.</li>
          <li>To improve the service using aggregated, non-identifying usage data.</li>
        </ul>
      ),
    },
    {
      id: 'share',
      title: 'Who we share it with',
      body: (
        <>
          <p>We share only what is needed:</p>
          <ul>
            <li>
              <strong>The space owner</strong> sees your name, vehicle and booking times for bookings at their space.
            </li>
            <li>
              <strong>Service providers</strong> such as payment processors, SMS providers and cloud hosting, under
              contract and only for the services they provide to us.
            </li>
            <li>
              <strong>Authorities</strong> when the law requires it.
            </li>
          </ul>
          <p>We do not sell your personal information.</p>
        </>
      ),
    },
    {
      id: 'retention',
      title: 'How long we keep it',
      body: (
        <p>
          We keep account information while your account is open. Booking and payment records are kept for as long as
          tax and accounting rules require. Gate camera reads are kept only as long as needed to resolve disputes and
          meet legal obligations.
        </p>
      ),
    },
    {
      id: 'rights',
      title: 'Your choices and rights',
      body: (
        <ul>
          <li>Update your profile and vehicles in the app at any time.</li>
          <li>Turn off location access in your phone settings; you can still search by typing an address.</li>
          <li>Ask for a copy of your data, a correction, or deletion of your account by emailing us.</li>
          <li>Withdraw consent for optional messages from the notification settings in the app.</li>
        </ul>
      ),
    },
    {
      id: 'security',
      title: 'Security',
      body: (
        <p>
          Data is encrypted in transit, gate passes are cryptographically signed, and access to personal information is
          limited to staff who need it for their work.
        </p>
      ),
    },
    {
      id: 'changes',
      title: 'Changes to this policy',
      body: <p>If we make significant changes, we will tell you in the app before they take effect.</p>,
    },
  ];
  return (
    <LegalPage
      eyebrow="Privacy policy"
      title="Your data, plainly explained."
      lead="What we collect, why we need it, who sees it and what you can do about it."
      sections={sections}
    />
  );
}

export function Terms() {
  usePageMeta('Terms of service', 'The terms that apply when you use Parkfnb as a driver or a space owner.');
  const sections: Section[] = [
    {
      id: 'agreement',
      title: 'Agreement',
      body: (
        <p>
          By creating an account or using Parkfnb you agree to these terms. Parkfnb is a platform that connects drivers
          with owners of parking spaces; the space itself is provided by the owner.
        </p>
      ),
    },
    {
      id: 'accounts',
      title: 'Your account',
      body: (
        <ul>
          <li>You must be 18 or older and give accurate details, including your vehicle's number plate.</li>
          <li>You are responsible for activity on your account. Keep your phone and one-time codes to yourself.</li>
          <li>We may suspend accounts that break these terms or put other users at risk.</li>
        </ul>
      ),
    },
    {
      id: 'bookings',
      title: 'Bookings',
      body: (
        <ul>
          <li>A booking is confirmed when it shows as Confirmed in the app. Some owners approve requests first.</li>
          <li>Your entry pass works from 15 minutes before the start time.</li>
          <li>If you do not check in within 60 minutes of the start time, the booking may be marked as a no-show and the bay released.</li>
          <li>You must leave within 15 minutes of the end time. Extra time may be charged at the space rate.</li>
          <li>Park only in the bay booked, follow the owner's gate instructions and site rules.</li>
        </ul>
      ),
    },
    {
      id: 'payments',
      title: 'Prices and payment',
      body: (
        <p>
          The owner sets the rate. The total you pay, including any convenience fee and taxes, is shown before you
          confirm. Payments are processed in the app; cash payments to anyone at the site are not part of a Parkfnb
          booking.
        </p>
      ),
    },
    {
      id: 'cancellations',
      title: 'Cancellations and refunds',
      body: (
        <p>
          You can cancel from the booking details screen. Refunds follow the cancellation policy shown for that space at
          the time of booking. If an owner rejects a request or the space is unavailable when you arrive, you are entitled
          to a full refund. Refunds are returned to your original payment method.
        </p>
      ),
    },
    {
      id: 'owners',
      title: 'Space owners',
      body: (
        <ul>
          <li>Owners must complete verification and have the right to rent out the space they list.</li>
          <li>Listings must be accurate, including size, vehicle types, amenities and photos.</li>
          <li>Owners must honour confirmed bookings and keep access hardware in working order.</li>
          <li>
            Earnings from completed bookings, less the platform commission shown in the Owner app, are paid out after a
            48-hour dispute window.
          </li>
        </ul>
      ),
    },
    {
      id: 'liability',
      title: 'Liability',
      body: (
        <p>
          Vehicles are parked at the driver's own risk unless the owner states otherwise. To the extent permitted by
          law, Parkfnb is not liable for loss of or damage to vehicles or their contents. Nothing in these terms limits
          rights you have under consumer protection law.
        </p>
      ),
    },
    {
      id: 'disputes',
      title: 'Disputes and governing law',
      body: (
        <p>
          Report any problem from the booking screen and we will try to resolve it with both sides. These terms are
          governed by the laws of India.
        </p>
      ),
    },
  ];
  return (
    <LegalPage
      eyebrow="Terms of service"
      title="The rules of the road."
      lead="What you can expect from Parkfnb, and what we expect from drivers and space owners."
      sections={sections}
    />
  );
}
