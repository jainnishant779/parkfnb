/**
 * The building blocks of every page, as React components that write the operator console's own class names (src/styles/parkfnb.css).
 * A page made of these looks like the console without copying any of its markup by hand. Server text goes in as React children, which
 * escape it: never dangerouslySetInnerHTML (the console's rule: nothing a camera or a person typed may run as markup).
 */
import { useEffect, useRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Icon, { type IconName } from './Icon';
import { activity, bayView, type LotEvent, type Slot } from '../lib/lot';
import { bayLabel, clockOf } from '../lib/format';

export type Tone = 'green' | 'red' | 'amber' | 'blue' | '';

// ----------------------------------------------------------------------------- cards and tiles

/** A white card: a title (and something on the right) over a body. `flush` drops the body's padding (for a table or list that runs edge to edge). */
export function Card({ title, right, flush, children, className }: {
  title?: ReactNode;
  right?: ReactNode;
  flush?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card${className ? ` ${className}` : ''}`}>
      {(title || right) && (
        <header>
          {title && <h2>{title}</h2>}
          {right}
        </header>
      )}
      <div className="body" style={flush ? { padding: 0 } : undefined}>
        {children}
      </div>
    </section>
  );
}

/** A big number with a label, tinted by what it means. */
export function Tile({ tone = '', icon, label, value, sub }: {
  tone?: Tone;
  icon?: IconName;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  const long = typeof value === 'string' && value.length > 6;
  return (
    <div className={`tile${tone ? ` ${tone}` : ''}`}>
      <div className="k">
        {icon && <Icon name={icon} />}
        {label}
      </div>
      <div className={`v${long ? ' sm' : ''}`}>{value}</div>
      {sub ? <div className="s">{sub}</div> : null}
    </div>
  );
}

export const Tiles = ({ children, cols }: { children: ReactNode; cols?: 3 | 4 }) => (
  <div className={`tiles${cols ? ` t${cols}` : ''}`}>{children}</div>
);

/** A small grey number card for a row above a chart. */
export function Mini({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mini">
      <small>{label}</small>
      <b className="num">{value}</b>
      {sub ? <span>{sub}</span> : null}
    </div>
  );
}
export const Minis = ({ children }: { children: ReactNode }) => <div className="minis">{children}</div>;

/** The page's grid: two columns on a wide screen (`g2`), three (`g3`), stacked on a narrow one. */
export const Grid = ({ cols, children }: { cols?: 2 | 3; children: ReactNode }) => (
  <div className={`grid${cols ? ` g${cols}` : ''}`}>{children}</div>
);

// ----------------------------------------------------------------------------- small things

export const Tag = ({ tone = '', children }: { tone?: Tone; children: ReactNode }) => (
  <span className={`tag${tone ? ` ${tone}` : ''}`}>{children}</span>
);

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

export const Note = ({ tone, children }: { tone?: 'warn' | 'bad'; children: ReactNode }) => (
  <div className={`note${tone ? ` ${tone}` : ''}`} role={tone === 'bad' ? 'alert' : undefined}>
    {children}
  </div>
);

/** A row of controls (buttons, filters). */
export const Bar = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div className="bar" style={style}>
    {children}
  </div>
);
export const Grow = () => <span className="grow" />;

export function Btn({ variant, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'danger' }) {
  return <button type="button" {...props} className={`btn${variant ? ` ${variant}` : ''}${props.className ? ` ${props.className}` : ''}`} />;
}

/** A link that looks like a button. */
export function LinkBtn({ to, variant, children }: { to: string; variant?: 'primary' | 'danger'; children: ReactNode }) {
  return (
    <Link to={to} className={`btn${variant ? ` ${variant}` : ''}`}>
      {children}
    </Link>
  );
}

/** Pills to choose one of a few: the open one is the black pill. */
export function Seg<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'on' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A labelled form field: the label text over the control. */
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="f">
      {label}
      {children}
      {hint ? <small className="muted" style={{ fontWeight: 500 }}>{hint}</small> : null}
    </label>
  );
}

export const Chips = ({ children }: { children: ReactNode }) => <div className="chips">{children}</div>;

export function Chip({ label, value, level }: { label: string; value: ReactNode; level?: 'ok' | 'warn' | 'bad' }) {
  return (
    <span className={`chip${level ? ` ${level}` : ''}`}>
      <small>{label}</small> <b>{value}</b>
    </span>
  );
}

// ----------------------------------------------------------------------------- "Needs your action"

export interface TodoItem {
  lvl: 'red' | 'amber';
  /** one character in the round badge */
  glyph: string;
  title: string;
  text?: string;
  /** an in-app path; the row is a link when set */
  to?: string;
  act?: string;
}

/** The "Needs your action" list, worst first; each row is a link to where it is dealt with. */
export function TodoList({ items }: { items: TodoItem[] }) {
  if (!items.length) {
    return (
      <ul className="todo">
        <li className="clear">
          <span className="ai" style={{ ['--c' as string]: 'var(--green)' }}>✓</span>
          <span className="tx">
            <b>All clear</b>
            <small>Nothing needs you right now.</small>
          </span>
        </li>
      </ul>
    );
  }
  return (
    <ul className="todo">
      {items.map((it, i) => {
        const inner = (
          <>
            <span className="ai" style={{ ['--c' as string]: `var(--${it.lvl})` }}>{it.glyph}</span>
            <span className="tx">
              <b>{it.title}</b>
              {it.text ? <small>{it.text}</small> : null}
            </span>
            {it.act ? <span className="go">{it.act} →</span> : null}
          </>
        );
        return (
          <li key={`${it.title}-${i}`}>
            {it.to ? (
              <Link className={`row ${it.lvl}`} to={it.to}>{inner}</Link>
            ) : (
              <div className={`row ${it.lvl}`}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ----------------------------------------------------------------------------- camera pieces

/** Recent events from the live feed, newest first. */
export function Timeline({ events, max = 8 }: { events: LotEvent[] | undefined; max?: number }) {
  const list = (events || []).slice().reverse().slice(0, max);
  if (!list.length) return <ul className="tl"><li>Nothing yet</li></ul>;
  return (
    <ul className="tl">
      {list.map((ev, i) => {
        const a = activity(ev);
        return (
          <li key={`${ev.t}-${i}`}>
            <div className="ai" style={{ ['--c' as string]: a.c }}>{a.g}</div>
            <div className="tx">
              <b>{a.t}</b>
              {a.s ? <small>{a.s}</small> : null}
            </div>
            <span className="tm">{clockOf(ev.t)}</span>
          </li>
        );
      })}
    </ul>
  );
}

const CAR = 'M5 16l1.5-5.5A2 2 0 0 1 8.4 9h7.2a2 2 0 0 1 1.9 1.5L19 16M4 16h16v3h-2.5v-1.5h-11V19H4zM7.5 13h.01M16.5 13h.01';

/** The bays as buttons, coloured by what each is. `plates` maps a bay to the plate of the car in it, when known. */
export function Bays({ slots, selected, onSelect, plates }: {
  slots: Slot[];
  selected?: string | null;
  onSelect?: (id: string) => void;
  plates?: Record<string, { text: string; guess?: boolean }>;
}) {
  return (
    <div className="bays">
      {slots.map((s) => {
        const v = bayView(s);
        const plate = plates?.[String(s.id)];
        return (
          <button key={s.id} type="button" className={`bay ${v.cls}${selected === String(s.id) ? ' sel' : ''}`} onClick={() => onSelect?.(String(s.id))}>
            <b>{bayLabel(s.id)}</b>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={CAR} /></svg>
            <small>{v.word}</small>
            {plate ? <small className={`plate${plate.guess ? ' guess' : ''}`}>{plate.text}</small> : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The black picture well of a live view. `src` is an object URL (the picture is fetched with the pass in a header, so an <img> cannot
 * ask for it by itself). `shade` covers the picture with a message (no signal, frozen). Full screen fills the screen with the picture;
 * `fsInfo` is shown along its top there (the counts, for a wall display).
 */
export function CamWell({ src, alt, shade, fsInfo }: { src: string | null; alt: string; shade?: string | null; fsInfo?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void ref.current?.requestFullscreen?.().catch(() => undefined);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey && t && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="cam" ref={ref}>
      {src ? <img src={src} alt={alt} onDoubleClick={toggle} /> : <div style={{ aspectRatio: '16 / 9' }} />}
      {shade ? <div className="shade">{shade}</div> : null}
      <div className="fsbar">{fsInfo}</div>
      <button type="button" className="fsbtn" title="Full screen (F)" aria-label="Full screen" onClick={toggle}>
        <Icon name="fullscreen" />
      </button>
    </div>
  );
}

// ----------------------------------------------------------------------------- drawer

/** A panel floating at the right edge (a bottom sheet on a phone). Escape and a click outside close it. */
export function Drawer({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="drawer-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="bar">
          <h2>{title}</h2>
          <Grow />
          <Btn onClick={onClose}>Close</Btn>
        </div>
        {children}
      </aside>
    </div>
  );
}

/** A definition list: label and value pairs. */
export function Kv({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
