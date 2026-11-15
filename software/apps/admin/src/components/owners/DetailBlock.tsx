import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

/** True when a Field with this value would render nothing. */
export const isBlank = (value: unknown): boolean =>
  value === undefined || value === null || value === '' ||
  (typeof value === 'string' && !value.trim());

/**
 * A labelled read-only field. Renders nothing at all when it has no value —
 * an empty labelled row on a KYC review screen reads as "the owner left this
 * blank", which is indistinguishable from "we never asked for it". The parent
 * block decides what to say when *every* field is empty.
 */
export function Field({ label, value }: { label: string; value?: ReactNode }) {
  if (isBlank(value)) return null;

  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 break-words text-sm text-slate-800">{value}</dd>
    </div>
  );
}

interface DetailBlockProps {
  title: string;
  /**
   * The backend block this renders, so we can tell "never submitted" apart
   * from "submitted but every field happened to be blank".
   */
  source?: object | null;
  /** Shown in place of the fields when `source` is null/absent. */
  emptyMessage: string;
  children?: ReactNode;
  /** Rendered below the field grid — used for the document thumbnails. */
  footer?: ReactNode;
  /**
   * True when the block exists but every field in it is blank. Distinct from a
   * missing block: the owner reached this step and saved nothing usable.
   */
  allFieldsBlank?: boolean;
}

export default function DetailBlock({
  title,
  source,
  emptyMessage,
  children,
  footer,
  allFieldsBlank = false,
}: DetailBlockProps) {
  // `null` is the Owner model's default for every kyc_* block, so absent means
  // the owner genuinely never reached this step of the wizard.
  const missing = source === null || source === undefined;

  return (
    <section className="rounded-card bg-white p-5 shadow-card">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {missing ? (
        <p className="mt-3 flex items-start gap-2 text-sm text-slate-500">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.75} />
          {emptyMessage}
        </p>
      ) : (
        <>
          {allFieldsBlank ? (
            <p className="mt-3 flex items-start gap-2 text-sm text-slate-500">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.75} />
              This step was saved, but every text field in it is empty.
            </p>
          ) : (
            <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">{children}</dl>
          )}
          {/* Documents render either way: a block with blank text can still
              carry the uploads that matter most to the reviewer. */}
          {footer}
        </>
      )}
    </section>
  );
}
