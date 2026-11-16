import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Btn, Card, Empty, Kv, LinkBtn, Note, Tag, Tile, Tiles } from '../components/ui';
import { ApiError } from '../lib/api';
import { money } from '../lib/format';
import { SpaceStatusTag } from '../components/listings/form';
import { BOOKING_MODES, SPACE_TYPES, VEHICLE_TYPES, WEEKDAYS, WEEK_ORDER } from '../components/listings/constants';
import { fileUrl } from '../services/ownerService';
import { listingService } from '../services/listingService';
import type { AvailabilitySlot, Space } from '../types/listings';
import '../styles/listings.css';

/** One space: its details, prices, photos and weekly hours, with pause or resume, edit and delete. */
const label = (list: { value: string; label: string }[], v: string): string => list.find((x) => x.value === v)?.label || v;

export default function SpaceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [space, setSpace] = useState<Space | null>(null);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const [s, sl] = await Promise.all([listingService.getSpace(id, signal), listingService.listSchedules(id, signal)]);
        setSpace(s);
        setSlots(sl);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'ABORTED') return;
        setError(e instanceof ApiError ? e.message : 'Could not load this space.');
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const property = space && typeof space.propertyId === 'object' ? space.propertyId : null;
  const propertyId = property?.id || (space && typeof space.propertyId === 'string' ? space.propertyId : '');

  const toggle = async () => {
    if (!space) return;
    setBusy(true);
    setNotice(null);
    try {
      const updated = await listingService.setSpaceAvailable(space.id, !space.isAvailable);
      setSpace({ ...space, isAvailable: updated.isAvailable, status: updated.status });
      setNotice({ tone: 'ok', text: updated.isAvailable ? 'Bookings are open again.' : 'Bookings are paused. Existing bookings are not affected.' });
    } catch (e) {
      setNotice({ tone: 'bad', text: e instanceof ApiError ? e.message : 'Could not update the space.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!space) return;
    if (!window.confirm(`Delete space ${space.spaceNumber}? Renters will no longer be able to book it.`)) return;
    setBusy(true);
    setNotice(null);
    try {
      await listingService.deleteSpace(space.id);
      navigate(propertyId ? `/properties/${propertyId}` : '/properties');
    } catch (e) {
      setNotice({ tone: 'bad', text: e instanceof ApiError ? e.message : 'Could not delete the space.' });
      setBusy(false);
    }
  };

  if (loading) return <Card><Empty>Loading the space…</Empty></Card>;
  if (error || !space) {
    return (
      <Card>
        <Note tone="bad">{error || 'Space not found.'}</Note>
        <div className="bar" style={{ marginTop: 16 }}>
          <Link className="btn" to="/properties">Back to properties</Link>
          <Btn onClick={() => void load()}>Try again</Btn>
        </div>
      </Card>
    );
  }

  const deleted = space.status === 'unavailable';
  const byDay = new Map<number, AvailabilitySlot[]>();
  slots.filter((s) => s.isAvailable).forEach((s) => byDay.set(s.dayOfWeek, [...(byDay.get(s.dayOfWeek) || []), s]));

  return (
    <>
      <div className="page-head">
        <Link className="backlink" to={propertyId ? `/properties/${propertyId}` : '/properties'}>← {property?.propertyName || 'Back to the property'}</Link>
        <span className="grow" />
        {!deleted && (
          <>
            <Btn onClick={() => void toggle()} disabled={busy}>{space.isAvailable ? 'Pause bookings' : 'Resume bookings'}</Btn>
            <LinkBtn to={`/spaces/${space.id}/edit`}>Edit</LinkBtn>
            <Btn variant="danger" onClick={() => void remove()} disabled={busy}>Delete</Btn>
          </>
        )}
      </div>

      {deleted && <Note tone="warn">This space was deleted. It is kept for the record and cannot be booked.</Note>}
      {notice && <Note tone={notice.tone === 'bad' ? 'bad' : undefined}>{notice.text}</Note>}

      <Card title={`Space ${space.spaceNumber}`} right={<SpaceStatusTag space={space} />}>
        <div className="vstack">
          {space.spaceImages?.length > 0 && (
            <div className="gallery">
              {space.spaceImages.map((u, i) => (
                <a className="thumb" key={`${u}-${i}`} href={fileUrl(u)} target="_blank" rel="noreferrer" title="Open full size">
                  <img src={fileUrl(u)} alt={`Space ${space.spaceNumber}, photo ${i + 1}`} loading="lazy" />
                </a>
              ))}
            </div>
          )}
          <Tiles cols={3}>
            <Tile icon="clock" label="Per hour" value={money(space.pricePerHour)} />
            <Tile icon="calendar" label="Per day" value={space.pricePerDay ? money(space.pricePerDay) : '–'} />
            <Tile icon="layers" label="Per month" value={space.pricePerMonth ? money(space.pricePerMonth) : '–'} />
          </Tiles>
          <Kv rows={[
            ['Type', label(SPACE_TYPES, space.spaceType)],
            ['Size', `${space.lengthMeters} × ${space.widthMeters} m${space.heightMeters ? `, up to ${space.heightMeters} m high` : ''}`],
            ['Vehicles', space.allowedVehicleTypes?.length ? space.allowedVehicleTypes.map((v) => label(VEHICLE_TYPES, v)).join(', ') : 'Not set'],
            ['Booking', BOOKING_MODES.find((m) => m.value === space.bookingMode)?.hint || space.bookingMode],
            ['EV charging', space.hasEvCharging ? 'Available' : 'No'],
            ['Barrier', space.deviceId ? <Tag key="b" tone="blue">{space.deviceId}</Tag> : 'None linked'],
            ['Description', space.spaceDescription || '–'],
            ['Property', property ? <Link key="p" to={`/properties/${propertyId}`}>{property.propertyName}, {property.city}</Link> : '–'],
          ]} />
        </div>
      </Card>

      <Card title="Weekly hours">
        {byDay.size === 0 ? (
          <p style={{ margin: 0 }}><b>Open 24 hours</b>, every day.</p>
        ) : (
          <div className="sched">
            {WEEK_ORDER.map((d) => (
              <div key={d}>
                <small>{WEEKDAYS[d]}</small>
                <b>{byDay.get(d)?.map((s) => `${s.availableFrom}–${s.availableTo}`).join(', ') || 'Closed'}</b>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
