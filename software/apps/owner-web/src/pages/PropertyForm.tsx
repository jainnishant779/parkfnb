import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Btn, Card, Empty, Note } from '../components/ui';
import { ApiError } from '../lib/api';
import { Fld, PhotoUploader } from '../components/listings/form';
import { INDIAN_STATES, stateCode } from '../components/listings/constants';
import { currentPosition, lookupPincode, mapsLink, parseCoord } from '../components/listings/geo';
import { listingService } from '../services/listingService';
import type { PropertyInput } from '../types/listings';
import '../styles/listings.css';

/**
 * Add a property (/properties/new) or change one (/properties/:id/edit): name, address, the map pin as latitude and longitude, how to get in,
 * and photos. No map is drawn (the dashboard carries no map library): "Use my location" fills the pin from this browser, or paste the
 * coordinates from a map; a link opens the pin in Google Maps to check it.
 */
type Field = 'propertyName' | 'address' | 'pincode' | 'city' | 'state' | 'location';

export default function PropertyForm() {
  const { id } = useParams<{ id: string }>();
  const editing = Boolean(id);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [access, setAccess] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [looking, setLooking] = useState(false);

  // Editing: fill the form from the property.
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true);
    listingService
      .getProperty(id, controller.signal)
      .then((p) => {
        setName(p.propertyName);
        setAddress(p.address);
        setPincode(p.postalCode || '');
        setCity(p.city);
        setState(stateCode(p.state));
        setLat(String(p.locationLat ?? ''));
        setLng(String(p.locationLng ?? ''));
        setAccess(p.accessInstructions || '');
        setPhotos(p.propertyImages || []);
        setLoading(false);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.code === 'ABORTED') return;
        setLoadError(e instanceof ApiError ? e.message : 'Could not load this property.');
        setLoading(false);
      });
    return () => controller.abort();
  }, [id]);

  // City and state follow the pincode until the person types over them.
  const autoFilled = useRef({ city: false, state: false });
  const lastLooked = useRef('');
  useEffect(() => {
    if (loading || !/^\d{6}$/.test(pincode) || pincode === lastLooked.current) return;
    lastLooked.current = pincode;
    const controller = new AbortController();
    setLooking(true);
    void lookupPincode(pincode, controller.signal).then((r) => {
      setLooking(false);
      if (!r) return;
      if (!city.trim() || autoFilled.current.city) {
        setCity(r.city);
        autoFilled.current.city = true;
      }
      if (!state || autoFilled.current.state) {
        setState(r.state);
        autoFilled.current.state = true;
      }
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pincode, loading]);

  const useMyLocation = async () => {
    setLocating(true);
    setErrors((e) => ({ ...e, location: undefined }));
    try {
      const p = await currentPosition();
      setLat(String(p.lat));
      setLng(String(p.lng));
    } catch (e) {
      setErrors((x) => ({ ...x, location: e instanceof Error ? e.message : 'Could not find your location.' }));
    } finally {
      setLocating(false);
    }
  };

  const validate = (): Partial<Record<Field, string>> => {
    const e: Partial<Record<Field, string>> = {};
    if (name.trim().length < 2) e.propertyName = 'Give the property a name.';
    if (address.trim().length < 3) e.address = 'Enter the street address.';
    if (!/^\d{6}$/.test(pincode)) e.pincode = 'Enter a valid 6-digit pincode.';
    if (!city.trim()) e.city = 'City is required.';
    if (!state) e.state = 'Choose a state.';
    if (parseCoord(lat, 'lat') === null || parseCoord(lng, 'lng') === null) {
      e.location = 'Set the map pin: latitude (-90 to 90) and longitude (-180 to 180). “Use my location” fills them in.';
    }
    return e;
  };

  // After the first failed Save the errors follow the fields as they are corrected, instead of staying until the next Save.
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    if (attempted) setErrors(validate());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempted, name, address, pincode, city, state, lat, lng]);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setAttempted(true);
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    const input: PropertyInput = {
      propertyName: name.trim(),
      address: address.trim(),
      city: city.trim(),
      state,
      postalCode: pincode,
      country: 'IN',
      locationLat: parseCoord(lat, 'lat') as number,
      locationLng: parseCoord(lng, 'lng') as number,
      accessInstructions: access.trim(),
      propertyImages: photos,
    };
    setSaving(true);
    try {
      const saved = id ? await listingService.updateProperty(id, input) : await listingService.createProperty(input);
      navigate(`/properties/${saved.id}`);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Could not save the property. Please try again.');
      setSaving(false);
    }
  };

  if (loading) return <Card><Empty>Loading the property…</Empty></Card>;
  if (loadError) {
    return (
      <Card>
        <Note tone="bad">{loadError}</Note>
        <div className="bar" style={{ marginTop: 16 }}><Link className="btn" to="/properties">Back to properties</Link></div>
      </Card>
    );
  }

  const latN = parseCoord(lat, 'lat');
  const lngN = parseCoord(lng, 'lng');

  return (
    <form className="vstack" onSubmit={submit} noValidate>
      <div className="page-head">
        <Link className="backlink" to={id ? `/properties/${id}` : '/properties'}>← {id ? 'Back to the property' : 'Back to properties'}</Link>
      </div>
      {attempted && Object.keys(errors).length > 0 && <Note tone="bad">A few fields need your attention.</Note>}
      {formError && <Note tone="bad">{formError}</Note>}

      <Card title="About the property">
        <div className="form">
          <Fld label="Property name" error={errors.propertyName}>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} maxLength={80} placeholder="Vijay Nagar Parking" />
          </Fld>
          <Fld label="Street address" error={errors.address}>
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} disabled={saving} maxLength={160} autoComplete="street-address" />
          </Fld>
          <div className="row3">
            <Fld label="Pincode" error={errors.pincode} hint={looking ? 'Looking up city and state…' : undefined}>
              <input type="text" inputMode="numeric" maxLength={6} value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))} disabled={saving} />
            </Fld>
            <Fld label="City" error={errors.city}>
              <input type="text" value={city} onChange={(e) => { setCity(e.target.value); autoFilled.current.city = false; }} disabled={saving} maxLength={60} />
            </Fld>
            <Fld label="State" error={errors.state}>
              <select className="fld" value={state} onChange={(e) => { setState(e.target.value); autoFilled.current.state = false; }} disabled={saving}>
                <option value="">Choose…</option>
                {INDIAN_STATES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                {state && !INDIAN_STATES.some((s) => s.value === state) && <option value={state}>{state}</option>}
              </select>
            </Fld>
          </div>
          <Fld label="How to get in (optional)" hint="Gate code, which entrance to use, who to call…">
            <textarea value={access} onChange={(e) => setAccess(e.target.value)} disabled={saving} maxLength={500} rows={3} />
          </Fld>
        </div>
      </Card>

      <Card title="Map pin">
        <div className="form">
          <p className="sec-hint" style={{ margin: 0 }}>Renters are guided to this spot. Use your location if you are at the property, or paste the coordinates from a map.</p>
          <div className="row">
            <Fld label="Latitude">
              <input type="text" inputMode="decimal" placeholder="22.7196" value={lat} onChange={(e) => setLat(e.target.value)} disabled={saving} />
            </Fld>
            <Fld label="Longitude">
              <input type="text" inputMode="decimal" placeholder="75.8577" value={lng} onChange={(e) => setLng(e.target.value)} disabled={saving} />
            </Fld>
          </div>
          <div className="bar">
            <Btn onClick={() => void useMyLocation()} disabled={saving || locating}>{locating ? 'Finding you…' : 'Use my location'}</Btn>
            {latN !== null && lngN !== null && (
              <a className="btn" href={mapsLink(latN, lngN)} target="_blank" rel="noreferrer">Check the pin in Maps</a>
            )}
          </div>
          {errors.location && <small className="field-err" role="alert">{errors.location}</small>}
        </div>
      </Card>

      <Card title="Photos">
        <PhotoUploader value={photos} onChange={setPhotos} disabled={saving} />
        <p className="help" style={{ marginTop: 8 }}>The first photo is the cover. Up to 8 photos, JPEG, PNG, WebP or HEIC, 10 MB each.</p>
      </Card>

      <div className="actions">
        <Link className="btn" to={id ? `/properties/${id}` : '/properties'}>Cancel</Link>
        <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : id ? 'Save changes' : 'Create property'}</button>
      </div>
    </form>
  );
}
