import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import AuthFrame from '../components/AuthFrame';
import { Btn, Note } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { Fld } from '../components/listings/form';
import { INDIAN_STATES, NEEDS_BUSINESS_NAME, OWNER_TYPES, stateCode } from '../components/listings/constants';
import { currentPosition, lookupPincode, parseCoord } from '../components/listings/geo';
import { ownerService, type ProfileInput } from '../services/ownerService';
import '../styles/listings.css';

/**
 * Step 1 of 2 for a new owner: who they are and where. (Step 2 is KYC.) It writes the same profile the owner app's onboarding writes
 * (PUT /api/owners/me/profile): the person on the user record, the business or land on the owner record. The dashboard stays closed until
 * KYC has been submitted.
 */

const todayIso = (): string => new Date().toISOString().slice(0, 10);

type Errors = Partial<Record<'ownerType' | 'legalName' | 'dateOfBirth' | 'email' | 'businessName' | 'landLabel' | 'addressLine1' | 'pincode' | 'state' | 'city' | 'location', string>>;

export default function Onboarding() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { user, owner } = auth;

  const [ownerType, setOwnerType] = useState(owner?.ownerType || 'individual');
  const [legalName, setLegalName] = useState(user?.legalName || [user?.firstName, user?.lastName].filter(Boolean).join(' '));
  const [dob, setDob] = useState((user?.dateOfBirth || '').slice(0, 10));
  const [email, setEmail] = useState(user?.email || '');
  const [businessName, setBusinessName] = useState(owner?.businessName || '');
  const [roleDesignation, setRoleDesignation] = useState(owner?.roleDesignation || '');
  const [registrationId, setRegistrationId] = useState(owner?.registrationId || '');
  const [landLabel, setLandLabel] = useState(owner?.landLabel || '');
  const [landmark, setLandmark] = useState('');
  const [line1, setLine1] = useState(user?.addressLine1 || '');
  const [line2, setLine2] = useState(user?.addressLine2 || '');
  const [pincode, setPincode] = useState(user?.postalCode || '');
  const [city, setCity] = useState(user?.city || '');
  const [state, setState] = useState(stateCode(user?.state));
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');

  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [looking, setLooking] = useState(false);

  // City and state follow the pincode, but only while the person has not typed over them.
  const autoFilled = useRef({ city: false, state: false });
  const lastLooked = useRef('');
  useEffect(() => {
    if (!/^\d{6}$/.test(pincode) || pincode === lastLooked.current) return;
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
  }, [pincode]);

  const needsBusiness = NEEDS_BUSINESS_NAME.has(ownerType);
  const isLand = ownerType === 'empty_land';
  const profileSaved = Boolean(user?.legalName && user?.dateOfBirth && user?.addressLine1 && user?.city && user?.postalCode);

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

  const validate = (): Errors => {
    const e: Errors = {};
    if (!ownerType) e.ownerType = 'Choose what kind of owner you are.';
    if (legalName.trim().length < 2) e.legalName = 'Enter your full legal name.';
    if (!dob) e.dateOfBirth = 'Enter your date of birth.';
    else if (dob > todayIso()) e.dateOfBirth = 'Your date of birth cannot be in the future.';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Enter a valid email or leave it blank.';
    if (needsBusiness && !businessName.trim()) e.businessName = 'Business name is required for this owner type.';
    if (isLand && !landLabel.trim()) e.landLabel = 'Give the land a name.';
    if (!line1.trim()) e.addressLine1 = 'Address line 1 is required.';
    if (!/^\d{6}$/.test(pincode)) e.pincode = 'Enter a valid 6-digit pincode.';
    if (!state) e.state = 'Choose a state.';
    if (!city.trim()) e.city = 'City is required.';
    const hasLat = lat.trim() !== '';
    const hasLng = lng.trim() !== '';
    if (hasLat || hasLng) {
      if (parseCoord(lat, 'lat') === null || parseCoord(lng, 'lng') === null) e.location = 'Latitude is -90 to 90 and longitude -180 to 180; fill both or neither.';
    }
    return e;
  };

  // After the first failed Save the errors follow the fields as they are corrected, instead of staying until the next Save.
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    if (attempted) setErrors(validate());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempted, ownerType, legalName, dob, email, businessName, landLabel, line1, pincode, state, city, lat, lng]);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setAttempted(true);
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    const payload: ProfileInput = {
      legalName: legalName.trim(),
      dateOfBirth: dob,
      addressLine1: line1.trim(),
      addressLine2: line2.trim(),
      city: city.trim(),
      state,
      pincode,
      country: 'IN',
      ownerType,
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(lat.trim() ? { locationLat: parseCoord(lat, 'lat') as number, locationLng: parseCoord(lng, 'lng') as number } : {}),
      ...(needsBusiness ? { businessName: businessName.trim(), roleDesignation: roleDesignation.trim(), registrationId: registrationId.trim() } : {}),
      ...(isLand ? { landLabel: landLabel.trim(), landmark: landmark.trim() } : {}),
    };
    setSaving(true);
    try {
      await ownerService.updateProfile(payload);
      await auth.refresh();
      navigate('/kyc');
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Could not save your details. Please try again.');
      setSaving(false);
    }
  };

  // After every hook above: a redirect before them would change how many hooks run.
  if (auth.onboarded) return <Navigate to="/" replace />;

  return (
    <AuthFrame wide>
      <form className="form" onSubmit={submit} noValidate>
        <div className="steps" aria-label="Steps">
          <span className="st on">1 · Your details</span>
          <span className="st">2 · Verification (KYC)</span>
        </div>
        <h1>Welcome. Tell us about you</h1>
        <p className="lead">We need this once, to set up your owner account. Your phone number {user?.phone ? `(+91 ${user.phone}) ` : ''}is already verified.</p>

        {profileSaved && (
          <Note>
            Your details are saved. <Link to="/kyc"><b>Continue to verification →</b></Link> or change them below.
          </Note>
        )}
        {attempted && Object.keys(errors).length > 0 && <Note tone="bad">A few fields need your attention.</Note>}
        {formError && <Note tone="bad">{formError}</Note>}

        <section className="form-sec">
          <h2 className="sec-title">What kind of owner are you?</h2>
          <div className="choices" role="radiogroup" aria-label="Owner type">
            {OWNER_TYPES.map((t) => (
              <button key={t.value} type="button" role="radio" aria-checked={ownerType === t.value} className={`choice${ownerType === t.value ? ' on' : ''}`} onClick={() => setOwnerType(t.value)} disabled={saving}>
                <b>{t.label}</b>
                <small>{t.hint}</small>
              </button>
            ))}
          </div>
          {errors.ownerType && <small className="field-err" role="alert">{errors.ownerType}</small>}
        </section>

        <section className="form-sec">
          <h2 className="sec-title">About you</h2>
          <div className="row">
            <Fld label="Full legal name" error={errors.legalName}>
              <input type="text" autoComplete="name" value={legalName} onChange={(e) => setLegalName(e.target.value)} disabled={saving} maxLength={80} />
            </Fld>
            <Fld label="Date of birth" error={errors.dateOfBirth}>
              <input type="date" value={dob} max={todayIso()} onChange={(e) => setDob(e.target.value)} disabled={saving} autoComplete="bday" />
            </Fld>
          </div>
          <div className="row">
            <Fld label="Mobile number" hint="Verified when you signed in">
              <div className="readonly">{user?.phone ? `+91 ${user.phone}` : '—'}</div>
            </Fld>
            <Fld label="Email (optional)" error={errors.email}>
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={saving} />
            </Fld>
          </div>
        </section>

        {needsBusiness && (
          <section className="form-sec">
            <h2 className="sec-title">Your business</h2>
            <Fld label="Business name" error={errors.businessName}>
              <input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)} disabled={saving} maxLength={100} />
            </Fld>
            <div className="row">
              <Fld label="Your role (optional)">
                <input type="text" placeholder="Director, Manager…" value={roleDesignation} onChange={(e) => setRoleDesignation(e.target.value)} disabled={saving} maxLength={60} />
              </Fld>
              <Fld label="Registration ID (optional)" hint="GST, CIN or society registration">
                <input type="text" value={registrationId} onChange={(e) => setRegistrationId(e.target.value)} disabled={saving} maxLength={40} />
              </Fld>
            </div>
          </section>
        )}

        {isLand && (
          <section className="form-sec">
            <h2 className="sec-title">Your land</h2>
            <div className="row">
              <Fld label="Name of the land" error={errors.landLabel} hint="How you will recognise it, e.g. “Station Road plot”">
                <input type="text" value={landLabel} onChange={(e) => setLandLabel(e.target.value)} disabled={saving} maxLength={60} />
              </Fld>
              <Fld label="Landmark (optional)">
                <input type="text" value={landmark} onChange={(e) => setLandmark(e.target.value)} disabled={saving} maxLength={80} />
              </Fld>
            </div>
          </section>
        )}

        <section className="form-sec">
          <h2 className="sec-title">Your address</h2>
          <Fld label="Address line 1" error={errors.addressLine1}>
            <input type="text" autoComplete="address-line1" value={line1} onChange={(e) => setLine1(e.target.value)} disabled={saving} maxLength={120} />
          </Fld>
          <Fld label="Address line 2 (optional)">
            <input type="text" autoComplete="address-line2" value={line2} onChange={(e) => setLine2(e.target.value)} disabled={saving} maxLength={120} />
          </Fld>
          <div className="row3">
            <Fld label="Pincode" error={errors.pincode} hint={looking ? 'Looking up city and state…' : undefined}>
              <input type="text" inputMode="numeric" autoComplete="postal-code" maxLength={6} value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))} disabled={saving} />
            </Fld>
            <Fld label="City" error={errors.city}>
              <input type="text" autoComplete="address-level2" value={city} onChange={(e) => { setCity(e.target.value); autoFilled.current.city = false; }} disabled={saving} maxLength={60} />
            </Fld>
            <Fld label="State" error={errors.state}>
              <select className="fld" value={state} onChange={(e) => { setState(e.target.value); autoFilled.current.state = false; }} disabled={saving}>
                <option value="">Choose…</option>
                {INDIAN_STATES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                {state && !INDIAN_STATES.some((s) => s.value === state) && <option value={state}>{state}</option>}
              </select>
            </Fld>
          </div>
        </section>

        <section className="form-sec">
          <h2 className="sec-title">Location (optional)</h2>
          <p className="sec-hint">Where you are, as a map pin. You can add it later, and each property has its own pin.</p>
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
          </div>
          {errors.location && <small className="field-err" role="alert">{errors.location}</small>}
        </section>

        <div className="actions">
          <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save and continue'}</button>
        </div>
      </form>
    </AuthFrame>
  );
}
