import { useState } from 'react';
import { actionsFor, plateOf, renterName, type BookingAction } from '../../lib/business/booking';
import { errorText } from '../../lib/business/ui';
import { money } from '../../lib/format';
import { bookingService } from '../../services/bookingService';
import type { Booking } from '../../types/business';
import { Btn } from '../ui';
import ConfirmDialog from './ConfirmDialog';
import '../../styles/business.css';

interface Copy {
  label: string;
  title: string;
  text: (b: Booking) => string;
  confirm: string;
  variant?: 'primary' | 'danger';
}

const who = (b: Booking) => `${renterName(b)}${plateOf(b) ? ` (${plateOf(b)})` : ''}, ${b.bookingNumber}`;

const COPY: Record<BookingAction, Copy> = {
  approve: {
    label: 'Approve', title: 'Approve this request?', confirm: 'Approve', variant: 'primary',
    text: (b) => `${who(b)} will be confirmed and can park in the space for the booked time.`,
  },
  reject: {
    label: 'Reject', title: 'Reject this request?', confirm: 'Reject', variant: 'danger',
    text: (b) => `${who(b)} will be told the request was turned down. Give a reason if you like.`,
  },
  checkIn: {
    label: 'Check in', title: 'Check the renter in?', confirm: 'Check in', variant: 'primary',
    text: (b) => `${who(b)} has arrived. Check-in opens an hour before the start time.`,
  },
  checkOut: {
    label: 'Check out', title: 'Check the renter out?', confirm: 'Check out', variant: 'primary',
    text: (b) => `${who(b)} is leaving. The booking will be completed and marked paid; any time over the booked end is charged at 1.5 times the hourly rate.`,
  },
  noShow: {
    label: 'No-show', title: 'Mark as a no-show?', confirm: 'Mark no-show', variant: 'danger',
    text: (b) => `${who(b)} never turned up. This cannot be undone.`,
  },
};

/**
 * The buttons for what the owner may do with a booking in its current state, each behind a confirmation. Success calls `onDone` with a
 * short message (the page then reloads its data); a refusal stays in the dialog in the backend's own words.
 */
export default function BookingActions({ booking, onDone, small }: { booking: Booking; onDone: (message: string) => void; small?: boolean }) {
  const [pending, setPending] = useState<BookingAction | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actions = actionsFor(booking);
  if (!actions.length) return null;

  const open = (a: BookingAction) => {
    setPending(a);
    setReason('');
    setError(null);
  };

  const run = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      let message = '';
      switch (pending) {
        case 'approve':
          await bookingService.approve(booking.id);
          message = `${booking.bookingNumber} approved.`;
          break;
        case 'reject':
          await bookingService.reject(booking.id, reason.trim());
          message = `${booking.bookingNumber} rejected.`;
          break;
        case 'checkIn':
          await bookingService.checkIn(booking.id);
          message = `${renterName(booking)} checked in.`;
          break;
        case 'checkOut': {
          const res = await bookingService.checkOut(booking.id);
          message = res.overtime ? `${renterName(booking)} checked out. Overtime charge of ${money(res.overtime.charge)} added.` : `${renterName(booking)} checked out.`;
          break;
        }
        case 'noShow':
          await bookingService.noShow(booking.id);
          message = `${booking.bookingNumber} marked as a no-show.`;
          break;
      }
      setPending(null);
      onDone(message);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = pending ? COPY[pending] : null;
  return (
    // The buttons and the dialog sit inside a table row that opens the booking when clicked; React events bubble through the component
    // tree (the dialog included), so a click anywhere in here must stop at this wrapper.
    <div onClick={(e) => e.stopPropagation()}>
      <div className="row-actions">
        {actions.map((a) => (
          <Btn key={a} variant={COPY[a].variant} className={small ? 'sm' : undefined} onClick={() => open(a)}>
            {COPY[a].label}
          </Btn>
        ))}
      </div>
      <ConfirmDialog
        open={Boolean(pending)}
        title={copy?.title || ''}
        confirmLabel={copy?.confirm || 'Confirm'}
        danger={copy?.variant === 'danger'}
        busy={busy}
        error={error}
        onConfirm={() => void run()}
        onClose={() => setPending(null)}
        reason={pending === 'reject' ? reason : undefined}
        onReason={pending === 'reject' ? setReason : undefined}
        reasonLabel="Reason for the renter (optional)"
      >
        {copy?.text(booking)}
      </ConfirmDialog>
    </div>
  );
}
