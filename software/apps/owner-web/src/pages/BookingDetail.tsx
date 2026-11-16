import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import BookingActions from '../components/business/BookingActions';
import { Bar, Card, Empty, Grid, Grow, Kv, LinkBtn, Note, Tag } from '../components/ui';
import {
  PAYMENT_LABEL, PAYMENT_TONE, STATUS_LABEL, STATUS_TONE, plateOf, propertyOf, renterName, renterOf, spaceNumber, vehicleLabel, vehicleOf,
} from '../lib/business/booking';
import { errorText, isAbort, useFlash } from '../lib/business/ui';
import { dateTimeLocal, humanize, money } from '../lib/format';
import { usePoll } from '../lib/usePoll';
import { bookingService } from '../services/bookingService';
import type { Booking } from '../types/business';
import '../styles/business.css';

interface Step {
  key: string;
  at: string;
  glyph: string;
  color: string;
  title: string;
  text?: string;
  /** planned, not yet happened */
  planned?: boolean;
}

/** What happened to a booking, in order, from the times the backend keeps. */
function stepsOf(b: Booking): Step[] {
  const out: Step[] = [];
  const now = Date.now();
  if (b.createdAt) out.push({ key: 'req', at: b.createdAt, glyph: '+', color: 'var(--blue)', title: 'Requested', text: `By ${renterName(b)}` });
  out.push({ key: 'start', at: b.startTime, glyph: '→', color: 'var(--grey)', title: 'Booked from', planned: new Date(b.startTime).getTime() > now });
  if (b.checkInTime) out.push({ key: 'in', at: b.checkInTime, glyph: '✓', color: 'var(--green)', title: 'Checked in' });
  if (b.checkOutTime) {
    out.push({ key: 'out', at: b.checkOutTime, glyph: '✓', color: 'var(--green)', title: 'Checked out', text: b.overtimeCharge ? `Overtime charge ${money(b.overtimeCharge)}` : undefined });
  }
  out.push({ key: 'end', at: b.endTime, glyph: '←', color: 'var(--grey)', title: 'Booked until', planned: new Date(b.endTime).getTime() > now });
  if (b.status === 'rejected' && b.updatedAt) out.push({ key: 'rej', at: b.updatedAt, glyph: '✕', color: 'var(--red)', title: 'Rejected', text: b.rejectionReason || undefined });
  if (b.status === 'cancelled') out.push({ key: 'can', at: b.cancelledAt || b.updatedAt || b.endTime, glyph: '✕', color: 'var(--red)', title: 'Cancelled', text: b.cancellationReason || undefined });
  if (b.status === 'no_show' && b.updatedAt) out.push({ key: 'ns', at: b.updatedAt, glyph: '!', color: 'var(--amber)', title: 'Marked as a no-show' });
  return out.sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());
}

/** One booking in full: who, which car and space, the times, the money, and the decisions that are still open. */
export default function BookingDetail() {
  const { id = '' } = useParams();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setBooking(await bookingService.get(id, signal));
        setError(null);
      } catch (e) {
        if (!isAbort(e)) setError(errorText(e, 'Could not load this booking.'));
      }
    },
    [id],
  );
  usePoll(load, 30_000, [load]);

  const steps = useMemo(() => (booking ? stepsOf(booking) : []), [booking]);

  if (!booking) {
    return (
      <>
        <Bar><LinkBtn to="/bookings">← All bookings</LinkBtn></Bar>
        {error ? <Note tone="bad">{error}</Note> : <Card><Empty>Loading booking…</Empty></Card>}
      </>
    );
  }

  const renter = renterOf(booking);
  const vehicle = vehicleOf(booking);
  const property = propertyOf(booking);
  const address = [property?.address, property?.city, property?.state].filter(Boolean).join(', ');

  return (
    <>
      <Bar>
        <LinkBtn to="/bookings">← All bookings</LinkBtn>
        <Grow />
        <BookingActions booking={booking} onDone={(m) => { setFlash(m); void load(); }} />
      </Bar>
      {flash && <Note>{flash}</Note>}
      {error && <Note tone="bad">{error}</Note>}

      <Grid cols={2}>
        <div className="grid">
          <Card title={booking.bookingNumber} right={<Tag tone={STATUS_TONE[booking.status]}>{STATUS_LABEL[booking.status] || humanize(booking.status)}</Tag>}>
            <Kv rows={[
              ['Space', `${spaceNumber(booking)} · ${property?.propertyName || 'Property'}`],
              ['Address', address || '–'],
              ['From', dateTimeLocal(booking.startTime)],
              ['Until', dateTimeLocal(booking.endTime)],
              ['Duration', `${booking.durationHours} h`],
              ['Requested', dateTimeLocal(booking.createdAt)],
              ...(booking.rejectionReason ? [['Rejection reason', booking.rejectionReason] as [string, string]] : []),
              ...(booking.cancellationReason ? [['Cancellation reason', booking.cancellationReason] as [string, string]] : []),
            ]} />
          </Card>
          <Card title="Renter and vehicle">
            <Kv rows={[
              ['Renter', renterName(booking)],
              ['Phone', renter?.phone ? <a href={`tel:+91${renter.phone}`}>+91 {renter.phone}</a> : '–'],
              ['Email', renter?.email || '–'],
              ['Plate', plateOf(booking) ? <span className="plate-text">{plateOf(booking)}</span> : '–'],
              ['Vehicle', vehicleLabel(booking) || humanize(vehicle?.vehicleType) || '–'],
            ]} />
          </Card>
        </div>
        <div className="grid">
          <Card title="Payment" right={<Tag tone={PAYMENT_TONE[booking.paymentStatus]}>{PAYMENT_LABEL[booking.paymentStatus] || humanize(booking.paymentStatus)}</Tag>}>
            <Kv rows={[
              ['Method', humanize(booking.paymentMethod)],
              ['Base price', money(booking.basePrice)],
              ...(booking.discountAmount ? [['Discount', `− ${money(booking.discountAmount)}`] as [string, string]] : []),
              ...(booking.overtimeCharge ? [['Overtime', money(booking.overtimeCharge)] as [string, string]] : []),
              ['Total', <b key="t">{money(booking.totalAmount)}</b>],
              ...(booking.refundAmount ? [['Refunded', money(booking.refundAmount)] as [string, string]] : []),
            ]} />
          </Card>
          <Card title="Timeline" flush>
            <ul className="tl">
              {steps.map((s) => (
                <li key={s.key} style={s.planned ? { opacity: 0.7 } : undefined}>
                  <div className="ai" style={{ ['--c' as string]: s.color }}>{s.glyph}</div>
                  <div className="tx">
                    <b>{s.title}{s.planned ? ' (planned)' : ''}</b>
                    {s.text ? <small>{s.text}</small> : null}
                  </div>
                  <span className="tm">{dateTimeLocal(s.at)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </Grid>
    </>
  );
}
