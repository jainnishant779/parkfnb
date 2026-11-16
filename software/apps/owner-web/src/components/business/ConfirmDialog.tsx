import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Btn, Drawer, Field, Note } from '../ui';

/**
 * Ask before doing something that changes a booking or a barrier. It stays open while the request runs and when the backend refuses,
 * showing the backend's own words, so a refusal is read where the person is looking. An optional reason box is for a rejection.
 */
export default function ConfirmDialog({ open, title, children, confirmLabel, danger, busy, error, onConfirm, onClose, reason, onReason, reasonLabel }: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
  reason?: string;
  onReason?: (value: string) => void;
  reasonLabel?: string;
}) {
  // In the page's <body>, not inside whatever asked for it: a dialog opened from a table cell would inherit that cell's alignment and
  // wrapping. (React events still bubble through the component tree, so callers that sit inside a clickable row stop them.)
  return createPortal(
    <Drawer open={open} title={title} onClose={busy ? () => undefined : onClose}>
      <div className="dialog-text">{children}</div>
      {onReason && (
        <Field label={reasonLabel || 'Reason (optional)'}>
          <textarea value={reason || ''} maxLength={300} onChange={(e) => onReason(e.target.value)} disabled={busy} />
        </Field>
      )}
      {error && <Note tone="bad">{error}</Note>}
      <div className="dialog-actions">
        <Btn onClick={onClose} disabled={busy}>Not now</Btn>
        <Btn variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </Btn>
      </div>
    </Drawer>,
    document.body,
  );
}
