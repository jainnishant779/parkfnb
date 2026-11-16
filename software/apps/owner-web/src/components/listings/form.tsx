import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Btn, Note, Tag, type Tone } from '../ui';
import { fileUrl, isPdf, ownerService } from '../../services/ownerService';
import { ApiError } from '../../lib/api';
import type { Space } from '../../types/listings';
import '../../styles/listings.css';

/** A labelled control with its error (or hint) under it. Built on the console's `label.f` look. */
export function Fld({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="f">
      {label}
      {children}
      {error ? (
        <small className="field-err" role="alert">{error}</small>
      ) : hint ? (
        <small className="muted" style={{ fontWeight: 500 }}>{hint}</small>
      ) : null}
    </label>
  );
}

/** A group of choices as pills you can switch on and off (vehicle types). */
export function ChipSelect({ options, value, onChange, disabled }: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="seg chipsel" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" disabled={disabled} className={value.includes(o.value) ? 'on' : ''} aria-pressed={value.includes(o.value)} onClick={() => toggle(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A tick box with its text beside it. */
export function Check({ checked, onChange, disabled, children }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; children: ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const DOC_TYPES = [...PHOTO_TYPES, 'application/pdf'];
const MAX_BYTES = 10 * 1024 * 1024;

function problemWith(file: File, allowed: string[]): string | null {
  const ext = /\.(jpe?g|png|webp|heic|pdf)$/i.test(file.name);
  if (file.type ? !allowed.includes(file.type) : !ext) {
    return allowed.includes('application/pdf') ? `${file.name}: only JPEG, PNG, WebP, HEIC images and PDFs are accepted.` : `${file.name}: only JPEG, PNG, WebP or HEIC pictures are accepted.`;
  }
  if (file.size > MAX_BYTES) return `${file.name} is larger than 10 MB.`;
  return null;
}

const uploadError = (e: unknown, name: string): string =>
  e instanceof ApiError ? `${name}: ${e.message}` : `${name}: the upload failed. Try again.`;

/** Photos of a property or a space: pick one or more, they upload at once, and the first is the cover. */
export function PhotoUploader({ value, onChange, max = 8, disabled }: { value: string[]; onChange: (next: string[]) => void; max?: number; disabled?: boolean }) {
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(value);
  latest.current = value;
  // "Still on screen". It is set true again on every mount: React StrictMode runs the cleanup once in development, and a flag that was only
  // ever set to false would drop every upload result.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const room = max - latest.current.length;
    const problems: string[] = [];
    if (files.length > room) problems.push(`Only ${max} photos fit; ${files.length - Math.max(room, 0)} were left out.`);
    for (const file of files.slice(0, Math.max(room, 0))) {
      const bad = problemWith(file, PHOTO_TYPES);
      if (bad) {
        problems.push(bad);
        continue;
      }
      setBusy((n) => n + 1);
      try {
        const url = await ownerService.upload(file);
        if (alive.current) {
          const next = [...latest.current, url];
          latest.current = next;
          onChange(next);
        }
      } catch (err) {
        problems.push(uploadError(err, file.name));
      } finally {
        if (alive.current) setBusy((n) => n - 1);
      }
    }
    if (alive.current) setError(problems.length ? problems.join(' ') : null);
  };

  return (
    <div className="photos-field">
      <div className="photos">
        {value.map((u, i) => (
          <figure key={`${u}-${i}`} className="thumb">
            <img src={fileUrl(u)} alt={`Photo ${i + 1}`} loading="lazy" />
            {i === 0 && <figcaption>Cover</figcaption>}
            {!disabled && (
              <button type="button" className="x" aria-label={`Remove photo ${i + 1}`} onClick={() => onChange(value.filter((_, k) => k !== i))}>
                ×
              </button>
            )}
          </figure>
        ))}
        {busy > 0 && <div className="thumb busy" aria-live="polite">Uploading…</div>}
        {!disabled && value.length < max && (
          <label className="thumb add">
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple onChange={pick} />
            <span>+ Add photos</span>
          </label>
        )}
      </div>
      {error && <Note tone="warn">{error}</Note>}
    </div>
  );
}

/** One document (an ID, a proof of address): choose a file, see that it arrived, replace or remove it. */
export function FileUpload({ label, value, onChange, disabled, hint, error }: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  hint?: ReactNode;
  error?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true; // see PhotoUploader: StrictMode runs the cleanup once in development
    return () => { alive.current = false; };
  }, []);

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const bad = problemWith(file, DOC_TYPES);
    if (bad) {
      setProblem(bad);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const url = await ownerService.upload(file);
      if (alive.current) onChange(url);
    } catch (err) {
      if (alive.current) setProblem(uploadError(err, file.name));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <div className="doc">
      <div className="doc-label">{label}</div>
      <div className="doc-body">
        {value ? (
          isPdf(value) ? (
            <a className="doc-pdf" href={fileUrl(value)} target="_blank" rel="noreferrer">PDF uploaded: open</a>
          ) : (
            <a href={fileUrl(value)} target="_blank" rel="noreferrer" title="Open full size"><img className="doc-img" src={fileUrl(value)} alt={label} /></a>
          )
        ) : (
          <span className="muted">{busy ? 'Uploading…' : 'Nothing uploaded yet'}</span>
        )}
      </div>
      {!disabled && (
        <div className="bar">
          <label className="btn doc-pick">
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" onChange={pick} disabled={busy} />
            {busy ? 'Uploading…' : value ? 'Replace' : 'Choose file'}
          </label>
          {value && <Btn onClick={() => onChange('')} disabled={busy}>Remove</Btn>}
        </div>
      )}
      {error ? <small className="field-err" role="alert">{error}</small> : problem ? <small className="field-err" role="alert">{problem}</small> : hint ? <small className="muted">{hint}</small> : null}
    </div>
  );
}

// ----------------------------------------------------------------------------- tags

export function SpaceStatusTag({ space }: { space: Pick<Space, 'status' | 'isAvailable'> }) {
  if (space.status === 'unavailable') return <Tag>Deleted</Tag>;
  if (space.status === 'maintenance') return <Tag tone="amber">Maintenance</Tag>;
  return space.isAvailable && space.status === 'active' ? <Tag tone="green">Open for booking</Tag> : <Tag tone="amber">Paused</Tag>;
}

const KYC_TAGS: Record<string, { label: string; tone: Tone }> = {
  not_started: { label: 'Not started', tone: '' },
  draft: { label: 'Draft saved', tone: 'amber' },
  submitted: { label: 'Under review', tone: 'blue' },
  verified: { label: 'Verified', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
};

export function KycTag({ status }: { status: string | null | undefined }) {
  const t = KYC_TAGS[status || 'not_started'] || { label: status || '', tone: '' as Tone };
  return <Tag tone={t.tone}>{t.label}</Tag>;
}
