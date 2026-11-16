/**
 * Web versions of the app's UI kit (components/ui): PillButton, IconCircle,
 * StatusTag, Chip, Segmented, ProgressTrack, TimelineItem, plus page helpers.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, Plus, type LucideIcon } from 'lucide-react';

/* ─── Reveal on scroll ─────────────────────────────────── */
type RevealTag = 'div' | 'article' | 'section' | 'li' | 'figure';

export function Reveal({
  as: Tag = 'div',
  className = '',
  delay,
  style,
  children,
  id,
}: {
  as?: RevealTag;
  className?: string;
  delay?: number;
  style?: CSSProperties;
  children?: ReactNode;
  id?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      id={id}
      ref={(node: HTMLElement | null) => {
        ref.current = node;
      }}
      className={`reveal ${shown ? 'is-in' : ''} ${className}`.trim()}
      style={delay ? { ...style, transitionDelay: `${delay}ms` } : style}
    >
      {children}
    </Tag>
  );
}

/* ─── Button (PillButton) ──────────────────────────────── */
type ButtonVariant = 'ink' | 'peach' | 'white' | 'grey' | 'ghost';
type ButtonSize = 'lg' | 'md' | 'sm' | 'xs';

export function Button({
  to,
  href,
  onClick,
  type = 'button',
  variant = 'ink',
  size = 'lg',
  icon: Icon,
  iconRight: IconRight,
  block,
  disabled,
  className = '',
  children,
}: {
  to?: string;
  href?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  block?: boolean;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const cls = [
    'btn',
    `btn-${variant}`,
    size !== 'lg' && `btn-${size}`,
    block && 'btn-block',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const iconSize = size === 'lg' ? 19 : size === 'md' ? 18 : 16;
  const body = (
    <>
      {Icon ? <Icon size={iconSize} /> : null}
      {children}
      {IconRight ? <IconRight size={iconSize} /> : null}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={cls} onClick={onClick}>
        {body}
      </Link>
    );
  }
  if (href) {
    const external = /^https?:/.test(href);
    return (
      <a href={href} className={cls} onClick={onClick} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
        {body}
      </a>
    );
  }
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled}>
      {body}
    </button>
  );
}

/* ─── IconCircle ───────────────────────────────────────── */
export function IconCircle({
  icon: Icon,
  variant = 'white',
  size = 'md',
  badge,
}: {
  icon: LucideIcon;
  variant?: 'white' | 'ink' | 'grey' | 'peach' | 'blue' | 'glass';
  size?: 'sm' | 'md' | 'lg';
  badge?: boolean;
}) {
  const px = size === 'sm' ? 16 : size === 'lg' ? 22 : 19;
  return (
    <span className={`icon-circle ${variant} ${size !== 'md' ? size : ''} ${badge ? 'has-badge' : ''}`}>
      <Icon size={px} />
    </span>
  );
}

/* ─── StatusTag ────────────────────────────────────────── */
export type TagTone = 'ink' | 'white' | 'grey' | 'success' | 'warning' | 'danger' | 'peach' | 'blue';

export function Tag({ tone = 'ink', children, className = '' }: { tone?: TagTone; children: ReactNode; className?: string }) {
  return <span className={`tag tag-${tone} ${className}`.trim()}>{children}</span>;
}

/* ─── Segmented ────────────────────────────────────────── */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  onTint,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  onTint?: boolean;
}) {
  return (
    <div className={`segmented ${onTint ? 'on-tint' : ''}`} role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={`seg ${o.value === value ? 'is-on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ─── Section heading ──────────────────────────────────── */
export function SectionHead({
  eyebrow,
  title,
  lead,
  center,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  center?: boolean;
  children?: ReactNode;
}) {
  return (
    <Reveal className={`section-head ${center ? 'center' : ''}`}>
      {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
      <h2 className="h1">{title}</h2>
      {lead ? <p className="lead">{lead}</p> : null}
      {children}
    </Reveal>
  );
}

/* ─── Check list ───────────────────────────────────────── */
export function CheckList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="check-list">
      {items.map((item, i) => (
        <li key={i}>
          <span className="tick">
            <Check size={13} strokeWidth={3} />
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/* ─── ProgressTrack ────────────────────────────────────── */
export function ProgressTrack({ steps = 4, current = 2, labels }: { steps?: number; current?: number; labels?: string[] }) {
  return (
    <>
      <div className="track" aria-hidden="true">
        {Array.from({ length: steps }).map((_, i) => (
          <span key={i} style={{ display: 'contents' }}>
            <i className={i === current ? 't-ring' : i < current ? 't-dot' : 't-dot soft'} />
            {i < steps - 1 ? <i className={`t-line ${i < current ? 'done' : ''}`} /> : null}
          </span>
        ))}
      </div>
      {labels ? (
        <div className="track-labels">
          {labels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      ) : null}
    </>
  );
}

/* ─── Timeline ─────────────────────────────────────────── */
export function Timeline({ items }: { items: { title: string; sub?: string; time?: string; active?: boolean }[] }) {
  return (
    <ol className="timeline">
      {items.map((it) => (
        <li key={it.title} className={it.active ? 'active' : ''}>
          <span className="tl-dot" />
          <div>
            <b>{it.title}</b>
            {it.sub ? <span className="sub">{it.sub}</span> : null}
          </div>
          {it.time ? <time>{it.time}</time> : <span />}
        </li>
      ))}
    </ol>
  );
}

/* ─── Accordion ────────────────────────────────────────── */
export function Accordion({ items, openAll }: { items: { q: ReactNode; a: ReactNode; key: string }[]; openAll?: boolean }) {
  return (
    <div className="card accordion">
      {items.map((it) => (
        <details key={it.key} open={openAll || undefined}>
          <summary>
            <span>{it.q}</span>
            <span className="acc-icon">
              <Plus size={17} />
            </span>
          </summary>
          <p>{it.a}</p>
        </details>
      ))}
    </div>
  );
}
