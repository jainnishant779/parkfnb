import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CalendarRange } from 'lucide-react';
import { ApiError, api, requestPaged, type ApiMeta } from '../lib/api';
import {
  Card,
  EmptyState,
  ErrorState,
  FilterPills,
  LoadingState,
  PageHeader,
  Pagination,
  TableScroll,
  Td,
  Th,
} from '../components/tables/DataTable';
import DetailDrawer, {
  DetailRow,
  DetailSection,
  DrawerError,
  DrawerLoading,
} from '../components/tables/DetailDrawer';
import StatusBadge from '../components/tables/StatusBadge';
import {
  EMPTY,
  formatBookingWindow,
  formatDateTime,
  formatDuration,
  formatMoney,
  humanize,
  personName,
  populated,
} from '../components/tables/format';
import {
  BOOKING_STATUSES,
  type Booking,
  type BookingProperty,
  type BookingStatus,
} from '../components/tables/types';

const PAGE_SIZE = 20;

const STATUS_FILTERS: { value: BookingStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  ...BOOKING_STATUSES.map((status) => ({ value: status, label: humanize(status) })),
];

export default function Bookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [meta, setMeta] = useState<ApiMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<BookingStatus | ''>('');
  const [selected, setSelected] = useState<Booking | null>(null);

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);

    // Unlike the other list endpoints, GET /api/bookings returns the array as
    // `data` directly rather than wrapping it in a named key.
    requestPaged<Booking[]>('/api/bookings', {
      query: { page, limit: PAGE_SIZE, status: status || undefined },
    })
      .then((result) => {
        if (!active) return;
        setBookings(Array.isArray(result.data) ? result.data : []);
        setMeta(result.meta);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setBookings([]);
        setMeta(null);
        setError(err instanceof ApiError ? err.message : 'Something went wrong.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, status]);

  useEffect(load, [load]);

  const changeStatus = (value: BookingStatus | '') => {
    setStatus(value);
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bookings"
        subtitle={
          meta
            ? `${meta.total.toLocaleString()} ${meta.total === 1 ? 'booking' : 'bookings'}${
                status ? ` with status “${humanize(status)}”` : ''
              }`
            : 'Every booking across all parking spaces'
        }
      />

      <Card>
        <div className="border-b border-slate-100 px-4 py-3">
          <FilterPills options={STATUS_FILTERS} value={status} onChange={changeStatus} />
        </div>

        {loading ? (
          <LoadingState label="Loading bookings…" />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : bookings.length === 0 ? (
          <EmptyState
            message={status ? `No ${humanize(status).toLowerCase()} bookings` : 'No bookings yet'}
            hint={
              status
                ? 'Choose a different status, or select All to see every booking.'
                : 'Bookings made in the consumer app will appear here.'
            }
          />
        ) : (
          <>
            <TableScroll>
              <table className="w-full min-w-[1000px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <Th>Booking</Th>
                    <Th>Renter</Th>
                    <Th>Space</Th>
                    <Th>Window</Th>
                    <Th>Duration</Th>
                    <Th>Status</Th>
                    <Th>Payment</Th>
                    <Th align="right">Amount</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bookings.map((booking) => (
                    <tr
                      key={booking.id}
                      onClick={() => setSelected(booking)}
                      className="cursor-pointer transition hover:bg-mint/60"
                    >
                      <Td className="whitespace-nowrap font-medium text-slate-800">
                        {booking.bookingNumber ?? booking.id}
                      </Td>
                      <Td>
                        <RenterCell booking={booking} />
                      </Td>
                      <Td>
                        <SpaceCell booking={booking} />
                      </Td>
                      <Td>
                        <WindowCell booking={booking} />
                      </Td>
                      <Td className="whitespace-nowrap text-slate-500">
                        {formatDuration(booking.durationHours)}
                      </Td>
                      <Td>
                        <StatusBadge status={booking.status} />
                      </Td>
                      <Td>
                        <StatusBadge status={booking.paymentStatus} />
                      </Td>
                      <Td align="right" className="whitespace-nowrap font-medium text-slate-800">
                        {formatMoney(booking.totalAmount, booking.currency)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
            <Pagination meta={meta} onPageChange={setPage} busy={loading} />
          </>
        )}
      </Card>

      <BookingDrawer booking={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ row cells */

function RenterCell({ booking }: { booking: Booking }) {
  const user = populated(booking.userId);
  if (!user) return <span className="text-slate-400">{EMPTY}</span>;

  return (
    <div className="min-w-0">
      <p className="truncate text-slate-700">{personName(user)}</p>
      {/* Email and phone are both optional on User; show whichever exists. */}
      <p className="truncate text-xs text-slate-400">{user.email ?? user.phone ?? EMPTY}</p>
    </div>
  );
}

/** "the property, then the bay within it" — the order an admin locates a space in. */
function SpaceCell({ booking }: { booking: Booking }) {
  const space = populated(booking.spaceId);
  if (!space) return <span className="text-slate-400">{EMPTY}</span>;

  const property = populated<BookingProperty>(space.propertyId);
  const bay = space.spaceNumber ? `Bay ${space.spaceNumber}` : null;
  const kind = space.spaceType ? humanize(space.spaceType) : null;

  return (
    <div className="min-w-0 max-w-[220px]">
      <p className="truncate text-slate-700">{property?.propertyName ?? 'Unnamed property'}</p>
      <p className="truncate text-xs text-slate-400">
        {[bay, kind, property?.city].filter(Boolean).join(' · ') || EMPTY}
      </p>
    </div>
  );
}

/**
 * Start and end of the stay.
 *
 * The start always carries its date. The end drops to a bare clock time only
 * when it falls on the same calendar day; a multi-day booking repeats the date
 * and is flagged, because "4:00 PM – 4:00 PM" on a two-day stay is ambiguous
 * to the point of being wrong.
 */
function WindowCell({ booking }: { booking: Booking }) {
  const { start, end, spansDays } = formatBookingWindow(booking.startTime, booking.endTime);

  return (
    <div className="min-w-0 whitespace-nowrap">
      <p className="text-slate-700">{start}</p>
      <p className="flex items-center gap-1 text-xs text-slate-400">
        <ArrowRight className="h-3 w-3 shrink-0" />
        {end}
        {spansDays && (
          <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-sky-50 px-1 py-px text-[10px] font-medium text-sky-700">
            <CalendarRange className="h-2.5 w-2.5" />
            Multi-day
          </span>
        )}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------- drawer */

/** GET /api/bookings/:id answers with `{ booking: {...} }`. */
interface BookingDetailResponse {
  booking: Booking;
}

function BookingDrawer({ booking, onClose }: { booking: Booking | null; onClose: () => void }) {
  const [detail, setDetail] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!booking) {
      setDetail(null);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    // The detail endpoint adds the owner and the full vehicle, which the list
    // response does not carry.
    api
      .get<BookingDetailResponse>(`/api/bookings/${booking.id}`)
      .then((result) => {
        if (active) setDetail(result.booking);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? `Full booking unavailable: ${err.message}`
            : 'Full booking unavailable.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [booking]);

  if (!booking) return null;

  const shown = detail ?? booking;
  const user = populated(shown.userId);
  const space = populated(shown.spaceId);
  const property = space ? populated<BookingProperty>(space.propertyId) : null;
  const vehicle = populated(shown.vehicleId);
  const owner = populated(shown.ownerId);

  const propertyAddress = property
    ? [property.address, property.city, property.state, property.postalCode]
        .filter(Boolean)
        .join(', ')
    : '';

  const vehicleLabel = vehicle
    ? [vehicle.vehicleMake, vehicle.vehicleModel, vehicle.vehicleYear]
        .filter(Boolean)
        .join(' ')
        .trim()
    : '';

  return (
    <DetailDrawer
      open
      title={shown.bookingNumber ?? 'Booking'}
      subtitle={`Booking ${shown.id}`}
      onClose={onClose}
    >
      {error && <DrawerError message={error} />}
      {loading && !detail ? (
        <DrawerLoading />
      ) : (
        <div className={error ? 'mt-4' : ''}>
          <DetailSection title="Status">
            <DetailRow label="Booking" value={<StatusBadge status={shown.status} />} />
            <DetailRow label="Payment" value={<StatusBadge status={shown.paymentStatus} />} />
            {/* Only one of these is ever set, and which one tells you who ended
                the booking — the renter cancelling or the owner refusing. */}
            <DetailRow label="Rejection reason" value={shown.rejectionReason} />
            <DetailRow label="Cancellation reason" value={shown.cancellationReason} />
          </DetailSection>

          <DetailSection title="Schedule">
            {/* Full date and time on both ends here — a drawer has the room, and
                an admin reading one booking closely should never have to infer
                which day it ran. */}
            <DetailRow label="Start" value={formatDateTime(shown.startTime)} />
            <DetailRow label="End" value={formatDateTime(shown.endTime)} />
            <DetailRow label="Duration" value={formatDuration(shown.durationHours)} />
            <DetailRow
              label="Checked in"
              value={shown.checkInTime ? formatDateTime(shown.checkInTime) : null}
            />
            <DetailRow
              label="Checked out"
              value={shown.checkOutTime ? formatDateTime(shown.checkOutTime) : null}
            />
            <DetailRow
              label="Booked on"
              value={shown.createdAt ? formatDateTime(shown.createdAt) : null}
            />
          </DetailSection>

          <DetailSection title="Renter">
            <DetailRow label="Name" value={user ? personName(user) : null} />
            <DetailRow label="Email" value={user?.email} />
            <DetailRow label="Phone" value={user?.phone} />
            <DetailRow
              label="Vehicle"
              value={
                vehicleLabel || vehicle?.licensePlate
                  ? [vehicleLabel, vehicle?.licensePlate].filter(Boolean).join(' · ')
                  : null
              }
            />
          </DetailSection>

          <DetailSection title="Space">
            <DetailRow label="Property" value={property?.propertyName} />
            <DetailRow label="Address" value={propertyAddress} />
            <DetailRow label="Bay" value={space?.spaceNumber} />
            <DetailRow
              label="Type"
              value={space?.spaceType ? humanize(space.spaceType) : null}
            />
            <DetailRow label="Owner" value={owner?.businessName} />
          </DetailSection>

          <DetailSection title="Amount">
            {/* Every figure carries the booking's own currency code. The backend
                defaults it to USD while the apps quote INR, so showing the
                stored code is the only honest option. */}
            <DetailRow label="Base price" value={formatMoney(shown.basePrice, shown.currency)} />
            <DetailRow
              label="Discount"
              value={
                shown.discountAmount ? formatMoney(shown.discountAmount, shown.currency) : null
              }
            />
            <DetailRow
              label="Total"
              value={
                <span className="font-semibold text-slate-900">
                  {formatMoney(shown.totalAmount, shown.currency)}
                </span>
              }
            />
            <DetailRow label="Currency" value={shown.currency} />
          </DetailSection>
        </div>
      )}
    </DetailDrawer>
  );
}
