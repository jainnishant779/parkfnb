import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, Search, SearchX, X } from 'lucide-react';
import { Accordion, Button, IconCircle, Reveal, Tag } from '../components/ui';
import { CtaBanner, PageHero, usePageMeta } from '../components/blocks';
import { faqCategories, faqs, type FaqCategory } from '../data/faqs';

function highlight(text: string, q: string): ReactNode {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {highlight(text.slice(i + q.length), q)}
    </>
  );
}

export default function Faq() {
  usePageMeta('FAQ', 'Answers about booking, payments, gate access, cancellations and listing your space on Parkfnb.');
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [category, setCategory] = useState<FaqCategory | 'all'>('all');

  const setQuery = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('q', value);
    else next.delete('q');
    setParams(next, { replace: true });
  };

  const term = q.trim();
  const results = useMemo(
    () =>
      faqs.filter(
        (f) =>
          (category === 'all' || f.category === category) &&
          (!term || `${f.q} ${f.a}`.toLowerCase().includes(term.toLowerCase())),
      ),
    [category, term],
  );

  const groups = faqCategories
    .map((c) => ({ ...c, items: results.filter((f) => f.category === c.value) }))
    .filter((g) => g.items.length);

  return (
    <>
      <PageHero
        eyebrow="FAQ"
        crumb="FAQ"
        title={
          <>
            Questions,
            <br />
            answered.
          </>
        }
        lead="Everything about booking, paying, getting in at the gate and hosting your space. Search or browse by topic."
      />

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container narrow">
          <Reveal className="faq-toolbar">
            <label className="search-pill">
              <Search size={19} />
              <input
                type="search"
                value={q}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search questions, e.g. refund, FASTag, keypad"
                aria-label="Search questions"
              />
              {q ? (
                <button type="button" className="icon-circle sm grey" onClick={() => setQuery('')} aria-label="Clear search">
                  <X size={16} />
                </button>
              ) : null}
            </label>
            <div className="chip-row" role="tablist" aria-label="Filter by topic">
              {[{ value: 'all' as const, label: 'All' }, ...faqCategories].map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="tab"
                  aria-selected={category === c.value}
                  className={`chip ${category === c.value ? 'is-on' : ''}`}
                  onClick={() => setCategory(c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <p className="faq-count" aria-live="polite">
              {results.length} {results.length === 1 ? 'answer' : 'answers'}
              {term ? ` for "${term}"` : ''}
            </p>
          </Reveal>

          {groups.length ? (
            groups.map((g) => (
              <div className="faq-group" key={g.value}>
                <div className="faq-group-title">
                  <h2 className="h2">{g.label}</h2>
                  <Tag tone="grey">{g.items.length}</Tag>
                </div>
                <Accordion
                  key={`${g.value}-${term}`}
                  openAll={!!term}
                  items={g.items.map((f) => ({ key: f.id, q: highlight(f.q, term), a: highlight(f.a, term) }))}
                />
              </div>
            ))
          ) : (
            <div className="card faq-empty">
              <IconCircle icon={SearchX} variant="grey" size="lg" />
              <h2 className="h2">No answers match that.</h2>
              <p className="body-2">Try a different word, or ask us directly.</p>
              <div className="btn-row" style={{ justifyContent: 'center' }}>
                <Button
                  variant="grey"
                  size="md"
                  onClick={() => {
                    setQuery('');
                    setCategory('all');
                  }}
                >
                  Clear filters
                </Button>
                <Button to="/contact" size="md" iconRight={ArrowRight}>
                  Contact us
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      <CtaBanner
        eyebrow="Still stuck?"
        title={
          <>
            We're here
            <br />
            to help.
          </>
        }
        text="Send us a message and the right team will get back to you."
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
