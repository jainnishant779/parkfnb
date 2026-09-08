import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

export type KycDecision = 'approve' | 'reject';

interface KycDecisionDialogProps {
  decision: KycDecision;
  ownerName: string;
  busy: boolean;
  /** Non-null while the submit failed, so the admin can retry without losing the typed reason. */
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: (notes: string) => void;
}

/**
 * Confirmation step for approving or rejecting KYC. Both directions confirm:
 * an approval lets an owner start taking real bookings and payouts, so it is
 * no less consequential than a rejection.
 */
export default function KycDecisionDialog({
  decision,
  ownerName,
  busy,
  errorMessage,
  onCancel,
  onConfirm,
}: KycDecisionDialogProps) {
  const [notes, setNotes] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isReject = decision === 'reject';

  // A rejection reason is mandatory: it is the only thing the owner app can
  // show the owner about what to fix, so an empty rejection strands them.
  const reasonMissing = isReject && !notes.trim();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-card bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              isReject ? 'bg-red-50' : 'bg-green-50'
            }`}
          >
            {isReject ? (
              <XCircle className="h-5 w-5 text-red-600" strokeWidth={1.75} />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-green-600" strokeWidth={1.75} />
            )}
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {isReject ? 'Reject this KYC submission?' : 'Approve this KYC submission?'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {isReject
                ? `${ownerName} will be sent back to the KYC step in the owner app and shown the reason below.`
                : `${ownerName} will be marked verified and can list parking spaces.`}
            </p>
          </div>
        </div>

        <label htmlFor="kyc-notes" className="mt-5 block text-sm font-medium text-slate-700">
          {isReject ? 'Reason for rejection' : 'Review notes'}
          {isReject ? (
            <span className="ml-1 text-red-600">*</span>
          ) : (
            <span className="ml-1 font-normal text-slate-400">(optional)</span>
          )}
        </label>
        <textarea
          id="kyc-notes"
          ref={inputRef}
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={
            isReject
              ? 'e.g. The ID front image is blurred and the number cannot be read. Please re-upload.'
              : 'Anything worth recording about this review.'
          }
          className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
        />
        {isReject && (
          <p className="mt-1.5 text-xs text-slate-500">
            Write what the owner must change. This is the only explanation they receive.
          </p>
        )}

        {errorMessage && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(notes.trim())}
            disabled={busy || reasonMissing}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
              isReject ? 'bg-red-600 hover:bg-red-700' : 'bg-teal hover:bg-teal-dark'
            }`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {isReject ? 'Reject KYC' : 'Approve KYC'}
          </button>
        </div>
      </div>
    </div>
  );
}
