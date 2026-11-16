import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, Building2, Check, Copy, LifeBuoy, Mail, MessageSquare, Send } from 'lucide-react';
import { Button, IconCircle, Reveal, Tag } from '../components/ui';
import { PageHero, usePageMeta } from '../components/blocks';
import { site } from '../data/site';

const TOPICS = [
  { value: 'driver-help', label: 'Help with a booking', to: site.supportEmail },
  { value: 'list-space', label: 'List my space', to: site.partnersEmail },
  { value: 'partnership', label: 'Smart gates and operators', to: site.partnersEmail },
  { value: 'early-access', label: 'Early access to the app', to: site.supportEmail },
  { value: 'other', label: 'Something else', to: site.supportEmail },
] as const;
type Topic = (typeof TOPICS)[number]['value'];

type Fields = { name: string; email: string; phone: string; message: string };
type Errors = Partial<Record<keyof Fields, string>>;

const isTopic = (v: string | null): v is Topic => TOPICS.some((t) => t.value === v);

function validate(f: Fields): Errors {
  const e: Errors = {};
  if (f.name.trim().length < 2) e.name = 'Please enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = 'Please enter a valid email address.';
  const digits = f.phone.replace(/\D/g, '');
  if (f.phone.trim() && (digits.length < 10 || digits.length > 12)) e.phone = 'Please enter a valid mobile number.';
  if (f.message.trim().length < 10) e.message = 'Tell us a little more (at least 10 characters).';
  return e;
}

export default function Contact() {
  usePageMeta('Contact', 'Get in touch with Parkfnb for booking help, listing a space, smart gates or early access.');
  const [params] = useSearchParams();
  const initialTopic: Topic = isTopic(params.get('topic')) ? (params.get('topic') as Topic) : 'driver-help';
  const app = params.get('app') === 'owner' ? 'Owner' : 'driver';

  const [topic, setTopic] = useState<Topic>(initialTopic);
  const [fields, setFields] = useState<Fields>({
    name: '',
    email: '',
    phone: '',
    message: initialTopic === 'early-access' ? `I'd like early access to the Parkfnb ${app} app.` : '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState(false);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);

  // Links like /contact?topic=partnership can arrive while this page is open.
  useEffect(() => {
    const t = params.get('topic');
    if (isTopic(t)) setTopic(t);
  }, [params]);

  const topicInfo = TOPICS.find((t) => t.value === topic)!;

  const mail = useMemo(() => {
    const subject = `${topicInfo.label} - ${fields.name.trim() || 'Website enquiry'}`;
    const body = [
      fields.message.trim(),
      '',
      '---',
      `Name: ${fields.name.trim()}`,
      `Email: ${fields.email.trim()}`,
      fields.phone.trim() ? `Phone: ${fields.phone.trim()}` : null,
      `Topic: ${topicInfo.label}`,
    ]
      .filter((l) => l !== null)
      .join('\n');
    return { to: topicInfo.to, subject, body };
  }, [fields, topicInfo]);

  const set = (k: keyof Fields) => (v: string) => {
    const next = { ...fields, [k]: v };
    setFields(next);
    if (touched) setErrors(validate(next));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    const errs = validate(fields);
    setErrors(errs);
    if (Object.keys(errs).length) {
      const first = Object.keys(errs)[0];
      document.getElementById(`c-${first}`)?.focus();
      return;
    }
    window.location.href = `mailto:${mail.to}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`;
    setSent(true);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`To: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.body}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const reset = () => {
    setFields({ name: '', email: '', phone: '', message: '' });
    setErrors({});
    setTouched(false);
    setSent(false);
  };

  return (
    <>
      <PageHero
        eyebrow="Contact"
        title={
          <>
            Talk to
            <br />
            a human.
          </>
        }
        lead="Questions about a booking, listing your space or putting smart gates on your lot. Send us a note and the right team will reply."
      />

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container contact-grid">
          <Reveal>
            {sent ? (
              <div className="card success-card">
                <IconCircle icon={Check} variant="ink" size="lg" />
                <h2 className="h2">Your message is ready to send.</h2>
                <p className="body-2">
                  We opened your email app with everything filled in, addressed to <b>{mail.to}</b>. Just press send. If
                  nothing opened, copy the message and email it to us.
                </p>
                <div className="btn-row">
                  <Button onClick={copy} variant="grey" size="md" icon={copied ? Check : Copy}>
                    {copied ? 'Copied' : 'Copy message'}
                  </Button>
                  <Button href={`mailto:${mail.to}`} variant="white" size="md" icon={Mail}>
                    Open email again
                  </Button>
                  <Button onClick={reset} variant="ghost" size="md">
                    Send another
                  </Button>
                </div>
              </div>
            ) : (
              <form className="card contact-form" onSubmit={onSubmit} noValidate>
                <div className="field">
                  <label id="topic-label">What is it about?</label>
                  <div className="topic-chips" role="radiogroup" aria-labelledby="topic-label">
                    {TOPICS.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        role="radio"
                        aria-checked={topic === t.value}
                        className={`chip ${topic === t.value ? 'is-on' : ''}`}
                        onClick={() => setTopic(t.value)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-row">
                  <div className={`field ${errors.name ? 'has-error' : ''}`}>
                    <label htmlFor="c-name">Your name</label>
                    <input id="c-name" className="input" autoComplete="name" value={fields.name} onChange={(e) => set('name')(e.target.value)} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'e-name' : undefined} placeholder="Priya Sharma" />
                    {errors.name ? <span className="field-error" id="e-name">{errors.name}</span> : null}
                  </div>
                  <div className={`field ${errors.email ? 'has-error' : ''}`}>
                    <label htmlFor="c-email">Email</label>
                    <input id="c-email" className="input" type="email" autoComplete="email" value={fields.email} onChange={(e) => set('email')(e.target.value)} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'e-email' : undefined} placeholder="you@example.com" />
                    {errors.email ? <span className="field-error" id="e-email">{errors.email}</span> : null}
                  </div>
                </div>

                <div className={`field ${errors.phone ? 'has-error' : ''}`}>
                  <label htmlFor="c-phone">Mobile number (optional)</label>
                  <input id="c-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" value={fields.phone} onChange={(e) => set('phone')(e.target.value)} aria-invalid={!!errors.phone} aria-describedby={errors.phone ? 'e-phone' : undefined} placeholder="+91 98765 43210" />
                  {errors.phone ? <span className="field-error" id="e-phone">{errors.phone}</span> : null}
                </div>

                <div className={`field ${errors.message ? 'has-error' : ''}`}>
                  <label htmlFor="c-message">Message</label>
                  <textarea id="c-message" className="textarea" value={fields.message} onChange={(e) => set('message')(e.target.value)} aria-invalid={!!errors.message} aria-describedby={errors.message ? 'e-message' : undefined} placeholder={topic === 'driver-help' ? 'Your booking ID and what went wrong' : 'How can we help?'} />
                  {errors.message ? <span className="field-error" id="e-message">{errors.message}</span> : null}
                </div>

                <div className="form-foot">
                  <p>
                    Goes to <b>{topicInfo.to}</b> through your email app.
                  </p>
                  <Button type="submit" iconRight={Send}>
                    Send message
                  </Button>
                </div>
              </form>
            )}
          </Reveal>

          <div className="contact-side">
            <Reveal className="card tone-peach">
              <IconCircle icon={LifeBuoy} />
              <h3 className="h3">Driver support</h3>
              <p className="body-2">Problems with a booking, a payment or getting in at the gate.</p>
              <a className="link" href={`mailto:${site.supportEmail}`}>
                {site.supportEmail}
              </a>
            </Reveal>
            <Reveal className="card tone-blue" delay={60}>
              <IconCircle icon={Building2} />
              <h3 className="h3">Owners and operators</h3>
              <p className="body-2">Listing a space, smart gate hardware or a site with many bays.</p>
              <a className="link" href={`mailto:${site.partnersEmail}`}>
                {site.partnersEmail}
              </a>
            </Reveal>
            <Reveal className="card" delay={120}>
              <IconCircle icon={MessageSquare} variant="grey" />
              <h3 className="h3">
                Already booked? <Tag tone="grey">Fastest</Tag>
              </h3>
              <p className="body-2">Open the booking in the app and tap Help. Your booking details are attached automatically.</p>
              <Button to="/faq" variant="ghost" size="sm" iconRight={ArrowRight}>
                Check the FAQ first
              </Button>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}
