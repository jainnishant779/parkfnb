import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Card, Empty, Note } from '../components/ui';
import { ApiError } from '../lib/api';
import { Check, ChipSelect, Fld, PhotoUploader } from '../components/listings/form';
import { BOOKING_MODES, SPACE_TYPES, VEHICLE_TYPES, WEEKDAYS, WEEK_ORDER } from '../components/listings/constants';
import { listingService } from '../services/listingService';
import type { AvailabilitySlot, BookingMode, ScheduleInput, SpaceInput } from '../types/listings';
import '../styles/listings.css';

/**
 * Add a space (/properties/:id/spaces/new) or change one (/spaces/:id/edit). One page with the owner app's wizard steps as sections: basics,
 * size, vehicles, photos, prices, booking rules and weekly hours.
 *
 * Hours: a space with no hours saved is open 24 hours. "Set hours" writes one slot per day (the backend refuses overlapping slots, so what is
 * there is replaced, as the app does). Prices go in as price per hour/day/month; the backend keeps the older `hourly_rate` copies in step.
 */

interface Day {
  on: boolean;
  from: string;
  to: string;
}
type Week = Record<number, Day>;

const defaultWeek = (): Week => Object.fromEntries(WEEKDAYS.map((_, d) => [d, { on: true, from: '08:00', to: '20:00' }])) as Week;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const num = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

type Err = Partial<Record<'spaceNumber' | 'spaceType' | 'length' | 'width' | 'height' | 'vehicles' | 'priceHour' | 'priceDay' | 'priceMonth' | 'hours', string>>;

export default function SpaceForm() {
  const { id } = useParams<{ id: string }>();
  const { pathname } = useLocation();
  const editing = pathname.endsWith('/edit');
  const navigate = useNavigate();

  const [propertyId, setPropertyId] = useState<string | null>(editing ? null : id || null);
  const [propertyName, setPropertyName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [number, setNumber] = useState('');
  const [type, setType] = useState('covered');
  const [description, setDescription] = useState('');
  const [length, setLength] = useState('5');
  const [width, setWidth] = useState('2.5');
  const [height, setHeight] = useState('');
  const [vehicles, setVehicles] = useState<string[]>(['car']);
  const [photos, setPhotos] = useState<string[]>([]);
  const [priceHour, setPriceHour] = useState('');
  const [priceDay, setPriceDay] = useState('');
  const [priceMonth, setPriceMonth] = useState('');
  const [mode, setMode] = useState<BookingMode>('instant');
  const [ev, setEv] = useState(false);
  const [open, setOpen] = useState(true);
  const [allDay, setAllDay] = useState(true);
  const [week, setWeek] = useState<Week>(defaultWeek);
  const [multiSlot, setMultiSlot] = useState(false);
  const [initialHours, setInitialHours] = useState('');

  const [errors, setErrors] = useState<Err>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [warning, setWarning] = useState<{ spaceId: string; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Load what the form needs: the property (to name it), and for an edit the space and its hours.
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    const { signal } = controller;
    setLoading(true);
    (async () => {
      try {
        if (editing) {
          const [space, slots] = await Promise.all([listingService.getSpace(id, signal), listingService.listSchedules(id, signal)]);
          const prop = typeof space.propertyId === 'object' ? space.propertyId : null;
          setPropertyId(prop?.id || (typeof space.propertyId === 'string' ? space.propertyId : null));
          setPropertyName(prop?.propertyName || '');
          setNumber(space.spaceNumber);
          setType(space.spaceType);
          setDescription(space.spaceDescription || '');
          setLength(String(space.lengthMeters ?? ''));
          setWidth(String(space.widthMeters ?? ''));
          setHeight(space.heightMeters ? String(space.heightMeters) : '');
          setVehicles(space.allowedVehicleTypes || []);
          setPhotos(space.spaceImages || []);
          setPriceHour(String(space.pricePerHour ?? ''));
          setPriceDay(space.pricePerDay ? String(space.pricePerDay) : '');
          setPriceMonth(space.pricePerMonth ? String(space.pricePerMonth) : '');
          setMode(space.bookingMode);
          setEv(Boolean(space.hasEvCharging));
          setOpen(space.isAvailable);
          const { on, w, multi } = weekFrom(slots);
          setAllDay(!on);
          if (on) setWeek(w);
          setMultiSlot(multi);
          setInitialHours(hoursKey(!on, w));
        } else {
          const p = await listingService.getProperty(id, signal);
          setPropertyName(p.propertyName);
          setInitialHours(hoursKey(true, defaultWeek()));
        }
        setLoading(false);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'ABORTED') return;
        setLoadError(e instanceof ApiError ? e.message : 'Could not load this page.');
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [id, editing]);

  const setDay = (d: number, patch: Partial<Day>) => setWeek((w) => ({ ...w, [d]: { ...w[d], ...patch } }));

  const hoursChanged = useMemo(() => hoursKey(allDay, week) !== initialHours, [allDay, week, initialHours]);

  const validate = (): Err => {
    const e: Err = {};
    if (!number.trim()) e.spaceNumber = 'Give the space a number or name, like A1.';
    if (!type) e.spaceType = 'Choose a type.';
    const l = num(length);
    const w = num(width);
    const h = num(height);
    if (l === null || l <= 0) e.length = 'Enter the length in metres.';
    if (w === null || w <= 0) e.width = 'Enter the width in metres.';
    if (height.trim() && (h === null || h <= 0)) e.height = 'Enter the height in metres, or leave it blank.';
    if (!vehicles.length) e.vehicles = 'Choose at least one kind of vehicle.';
    const ph = num(priceHour);
    if (ph === null || ph <= 0) e.priceHour = 'Enter the price per hour.';
    if (priceDay.trim() && (num(priceDay) === null || (num(priceDay) as number) < 0)) e.priceDay = 'Enter a price, or leave it blank.';
    if (priceMonth.trim() && (num(priceMonth) === null || (num(priceMonth) as number) < 0)) e.priceMonth = 'Enter a price, or leave it blank.';
    if (!allDay) {
      const days = WEEK_ORDER.filter((d) => week[d].on);
      if (!days.length) e.hours = 'Switch on at least one day, or choose “Open 24 hours”.';
      else {
        const bad = days.find((d) => !TIME_RE.test(week[d].from) || !TIME_RE.test(week[d].to) || week[d].from >= week[d].to);
        if (bad !== undefined) e.hours = `${WEEKDAYS[bad]}: “from” must be earlier than “to”.`;
      }
    }
    return e;
  };

  // After the first failed Save the errors follow the fields as they are corrected, instead of staying until the next Save.
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    if (attempted) setErrors(validate());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempted, number, type, length, width, height, vehicles, priceHour, priceDay, priceMonth, allDay, week]);

  const submit = async (ev2: FormEvent) => {
    ev2.preventDefault();
    setAttempted(true);
    const found = validate();
    setErrors(found);
    setFormError(null);
    setWarning(null);
    if (Object.keys(found).length) return;
    if (!propertyId) {
      setFormError('This space has no property. Go back and open it from a property.');
      return;
    }
    const day = num(priceDay);
    const month = num(priceMonth);
    const input: SpaceInput = {
      spaceNumber: number.trim(),
      spaceType: type,
      lengthMeters: num(length) as number,
      widthMeters: num(width) as number,
      ...(num(height) ? { heightMeters: num(height) as number } : {}),
      allowedVehicleTypes: vehicles,
      spaceDescription: description.trim(),
      spaceImages: photos,
      pricePerHour: num(priceHour) as number,
      // A price that was cleared while editing is sent as null so the backend drops it (it only writes what it is sent).
      ...(day !== null ? { pricePerDay: day } : editing ? { pricePerDay: null } : {}),
      ...(month !== null ? { pricePerMonth: month } : editing ? { pricePerMonth: null } : {}),
      bookingMode: mode,
      hasEvCharging: ev,
      isAvailable: open,
    };
    setSaving(true);
    try {
      const space = editing && id ? await listingService.updateSpace(id, input) : await listingService.createSpace(propertyId, input);
      // Hours: only touched when they changed (or on a new space with custom hours).
      if (hoursChanged) {
        const schedules: ScheduleInput[] = allDay
          ? []
          : WEEK_ORDER.filter((d) => week[d].on).map((d) => ({ dayOfWeek: d, availableFrom: week[d].from, availableTo: week[d].to, isAvailable: true }));
        try {
          const { failed } = await listingService.replaceSchedules(space.id, schedules);
          if (failed) {
            setWarning({ spaceId: space.id, text: `The space was saved, but ${failed} day${failed === 1 ? '' : 's'} of hours could not be saved. Edit the space to set them again.` });
            setSaving(false);
            return;
          }
        } catch {
          setWarning({ spaceId: space.id, text: 'The space was saved, but its hours could not be saved. Edit the space to set them again.' });
          setSaving(false);
          return;
        }
      }
      navigate(`/spaces/${space.id}`);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Could not save the space. Please try again.');
      setSaving(false);
    }
  };

  if (loading) return <Card><Empty>Loading…</Empty></Card>;
  if (loadError) {
    return (
      <Card>
        <Note tone="bad">{loadError}</Note>
        <div className="bar" style={{ marginTop: 16 }}><Link className="btn" to="/properties">Back to properties</Link></div>
      </Card>
    );
  }

  const backTo = propertyId ? `/properties/${propertyId}` : '/properties';

  return (
    <form className="vstack" onSubmit={submit} noValidate>
      <div className="page-head">
        <Link className="backlink" to={editing && id ? `/spaces/${id}` : backTo}>← {editing ? 'Back to the space' : `Back to ${propertyName || 'the property'}`}</Link>
      </div>
      {propertyName && <p className="muted" style={{ margin: 0 }}>{editing ? 'Editing a space at' : 'New space at'} <b>{propertyName}</b></p>}
      {attempted && Object.keys(errors).length > 0 && <Note tone="bad">A few fields need your attention.</Note>}
      {formError && <Note tone="bad">{formError}</Note>}
      {warning && (
        <Note tone="warn">
          {warning.text} <Link to={`/spaces/${warning.spaceId}/edit`}>Edit the space</Link> · <Link to={`/spaces/${warning.spaceId}`}>Open it</Link>
        </Note>
      )}

      <Card title="Basics">
        <div className="form">
          <div className="row">
            <Fld label="Space number or name" error={errors.spaceNumber} hint="Unique within the property">
              <input type="text" value={number} onChange={(e) => setNumber(e.target.value)} disabled={saving} maxLength={20} placeholder="A1" />
            </Fld>
            <Fld label="Type" error={errors.spaceType}>
              <select className="fld" value={type} onChange={(e) => setType(e.target.value)} disabled={saving}>
                {SPACE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Fld>
          </div>
          <Fld label="Description (optional)">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={saving} maxLength={500} rows={3} placeholder="Near the lift, well lit, CCTV…" />
          </Fld>
        </div>
      </Card>

      <Card title="Size">
        <div className="form">
          <div className="row3">
            <Fld label="Length (m)" error={errors.length}>
              <input type="text" inputMode="decimal" value={length} onChange={(e) => setLength(e.target.value)} disabled={saving} />
            </Fld>
            <Fld label="Width (m)" error={errors.width}>
              <input type="text" inputMode="decimal" value={width} onChange={(e) => setWidth(e.target.value)} disabled={saving} />
            </Fld>
            <Fld label="Height limit (m, optional)" error={errors.height}>
              <input type="text" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} disabled={saving} />
            </Fld>
          </div>
          <div>
            <div className="sec-title" style={{ marginBottom: 8 }}>Vehicles that fit</div>
            <ChipSelect options={VEHICLE_TYPES} value={vehicles} onChange={setVehicles} disabled={saving} />
            {errors.vehicles && <small className="field-err" role="alert">{errors.vehicles}</small>}
          </div>
        </div>
      </Card>

      <Card title="Photos">
        <PhotoUploader value={photos} onChange={setPhotos} disabled={saving} />
      </Card>

      <Card title="Prices">
        <div className="form">
          <div className="row3">
            <Fld label="Per hour (₹)" error={errors.priceHour}>
              <input type="text" inputMode="decimal" value={priceHour} onChange={(e) => setPriceHour(e.target.value)} disabled={saving} placeholder="50" />
            </Fld>
            <Fld label="Per day (₹, optional)" error={errors.priceDay}>
              <input type="text" inputMode="decimal" value={priceDay} onChange={(e) => setPriceDay(e.target.value)} disabled={saving} />
            </Fld>
            <Fld label="Per month (₹, optional)" error={errors.priceMonth}>
              <input type="text" inputMode="decimal" value={priceMonth} onChange={(e) => setPriceMonth(e.target.value)} disabled={saving} />
            </Fld>
          </div>
        </div>
      </Card>

      <Card title="Booking rules">
        <div className="form">
          <div className="choices" role="radiogroup" aria-label="Booking mode">
            {BOOKING_MODES.map((m) => (
              <button key={m.value} type="button" role="radio" aria-checked={mode === m.value} className={`choice${mode === m.value ? ' on' : ''}`} onClick={() => setMode(m.value)} disabled={saving}>
                <b>{m.label}</b>
                <small>{m.hint}</small>
              </button>
            ))}
          </div>
          <Check checked={ev} onChange={setEv} disabled={saving}>EV charging is available here</Check>
          <Check checked={open} onChange={setOpen} disabled={saving}>Open for booking (untick to pause this space)</Check>
        </div>
      </Card>

      <Card title="Weekly hours">
        <div className="form">
          <div className="choices" role="radiogroup" aria-label="Hours">
            <button type="button" role="radio" aria-checked={allDay} className={`choice${allDay ? ' on' : ''}`} onClick={() => setAllDay(true)} disabled={saving}>
              <b>Open 24 hours</b><small>Every day, all day</small>
            </button>
            <button type="button" role="radio" aria-checked={!allDay} className={`choice${!allDay ? ' on' : ''}`} onClick={() => setAllDay(false)} disabled={saving}>
              <b>Set hours</b><small>Choose the days and times</small>
            </button>
          </div>
          {!allDay && (
            <div className="week">
              {WEEK_ORDER.map((d) => (
                <div className="day" key={d}>
                  <Check checked={week[d].on} onChange={(v) => setDay(d, { on: v })} disabled={saving}><b>{WEEKDAYS[d]}</b></Check>
                  {week[d].on ? (
                    <div className="times">
                      <input type="time" aria-label={`${WEEKDAYS[d]} from`} value={week[d].from} onChange={(e) => setDay(d, { from: e.target.value })} disabled={saving} />
                      <span className="muted">to</span>
                      <input type="time" aria-label={`${WEEKDAYS[d]} to`} value={week[d].to} onChange={(e) => setDay(d, { to: e.target.value })} disabled={saving} />
                    </div>
                  ) : (
                    <span className="off">Closed</span>
                  )}
                </div>
              ))}
            </div>
          )}
          {multiSlot && !allDay && <Note tone="warn">Some days had more than one time slot. This form keeps one slot per day; saving will keep the first of each.</Note>}
          {errors.hours && <small className="field-err" role="alert">{errors.hours}</small>}
        </div>
      </Card>

      <div className="actions">
        <Link className="btn" to={editing && id ? `/spaces/${id}` : backTo}>Cancel</Link>
        <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create space'}</button>
      </div>
    </form>
  );
}

// ----------------------------------------------------------------------------- hours helpers

/** The week as the form shows it, from the slots the backend has. One slot per day; `multi` says some day had more than one. */
function weekFrom(slots: AvailabilitySlot[]): { on: boolean; w: Week; multi: boolean } {
  const w: Week = Object.fromEntries(WEEKDAYS.map((_, d) => [d, { on: false, from: '08:00', to: '20:00' }])) as Week;
  let multi = false;
  const seen = new Set<number>();
  for (const s of [...slots].sort((a, b) => a.availableFrom.localeCompare(b.availableFrom))) {
    if (!s.isAvailable) continue;
    if (seen.has(s.dayOfWeek)) {
      multi = true;
      continue;
    }
    seen.add(s.dayOfWeek);
    w[s.dayOfWeek] = { on: true, from: s.availableFrom, to: s.availableTo };
  }
  return { on: seen.size > 0, w, multi };
}

/** A string that changes exactly when the hours do, to know whether there is anything to save. */
function hoursKey(allDay: boolean, w: Week): string {
  return allDay ? 'all-day' : WEEK_ORDER.map((d) => (w[d].on ? `${d}:${w[d].from}-${w[d].to}` : `${d}:off`)).join('|');
}
