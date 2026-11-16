import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Btn, Card, Grid, Kv, LinkBtn, Note } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { dateOf } from '../lib/format';
import { Fld, KycTag } from '../components/listings/form';
import { INDIAN_STATES, NEEDS_BUSINESS_NAME, OWNER_TYPE_LABELS, stateCode } from '../components/listings/constants';
import { fileUrl, ownerService, type ProfileInput } from '../services/ownerService';
import '../styles/listings.css';

/**
 * The owner's own details: who they are, where, their business or land, the payout bank account, and their KYC status. Details save through
 * PUT /api/owners/me/profile; the bank account through the KYC draft endpoint, as the owner app does. (No "delete account": the backend has no such
 * thing, so the page does not pretend.)
 */

const todayIso = (): string => new Date().toISOString().slice(0, 10);
const mask = (n: string): string => (n.length > 4 ? `${'•'.repeat(Math.max(n.length - 4, 4))}${n.slice(-4)}` : n);
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^\d{8,18}$/;

export default function Profile() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { user, owner } = auth;
  const type = owner?.ownerType || 'individual';
  const needsBusiness = NEEDS_BUSINESS_NAME.has(type);
  const isLand = type === 'empty_land';

  // ---- details
  const [legalName, setLegalName] = useState('');
  const [dob, setDob] = useState('');
  const [email, setEmail] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [role, setRole] = useState('');
  const [registration, setRegistration] = useState('');
  const [landLabel, setLandLabel] = useState('');
  const [photo, setPhoto] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  // Fill the form from the account once. Never again while it is open: a refresh after Save must not overwrite what is being typed, and a
  // failed save must keep what the person typed.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!user || loadedFor.current === user.id) return;
    loadedFor.current = user.id;
    setLegalName(user.legalName || [user.firstName, user.lastName].filter(Boolean).join(' '));
    setDob((user.dateOfBirth || '').slice(0, 10));
    setEmail(user.email || '');
    setAltPhone(user.alternatePhone || '');
    setLine1(user.addressLine1 || '');
    setLine2(user.addressLine2 || '');
    setCity(user.city || '');
    setState(stateCode(user.state));
    setPincode(user.postalCode || '');
    setPhoto(user.profilePictureUrl || '');
    setBusinessName(owner?.businessName || '');
    setRole(owner?.roleDesignation || '');
    setRegistration(owner?.registrationId || '');
    setLandLabel(owner?.landLabel || '');
  }, [user, owner]);

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (legalName.trim().length < 2) e.legalName = 'Enter your full legal name.';
    if (dob && dob > todayIso()) e.dob = 'Your date of birth cannot be in the future.';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Enter a valid email or leave it blank.';
    if (altPhone.trim() && !/^[6-9]\d{9}$/.test(altPhone.trim())) e.altPhone = 'Enter a 10-digit mobile number or leave it blank.';
    if (!line1.trim()) e.line1 = 'Address line 1 is required.';
    if (!/^\d{6}$/.test(pincode)) e.pincode = 'Enter a valid 6-digit pincode.';
    if (!state) e.state = 'Choose a state.';
    if (!city.trim()) e.city = 'City is required.';
    if (needsBusiness && !businessName.trim()) e.businessName = 'Business name is required for this owner type.';
    if (isLand && !landLabel.trim()) e.landLabel = 'Give the land a name.';
    return e;
  };

  // After the first failed Save the errors follow the fields as they are corrected, instead of staying until the next Save.
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    if (attempted) setErrors(validate());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempted, legalName, dob, email, altPhone, line1, pincode, state, city, businessName, landLabel]);

  const save = async (ev: FormEvent) => {
    ev.preventDefault();
    setAttempted(true);
    const found = validate();
    setErrors(found);
    setMessage(null);
    if (Object.keys(found).length) return;
    const payload: ProfileInput = {
      legalName: legalName.trim(),
      addressLine1: line1.trim(),
      addressLine2: line2.trim(),
      city: city.trim(),
      state,
      pincode,
      country: 'IN',
      ...(dob ? { dateOfBirth: dob } : {}),
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(altPhone.trim() ? { alternatePhone: altPhone.trim() } : {}),
      ...(photo ? { profilePictureUrl: photo } : {}),
      ...(needsBusiness ? { businessName: businessName.trim(), roleDesignation: role.trim(), registrationId: registration.trim() } : {}),
      ...(isLand ? { landLabel: landLabel.trim() } : {}),
    };
    setSaving(true);
    try {
      await ownerService.updateProfile(payload);
      await auth.refresh();
      setMessage({ tone: 'ok', text: 'Saved.' });
    } catch (e) {
      setMessage({ tone: 'bad', text: e instanceof ApiError ? e.message : 'Could not save. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const pickPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|heic)$/.test(file.type)) {
      setMessage({ tone: 'bad', text: 'A profile photo must be a JPEG, PNG, WebP or HEIC picture.' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage({ tone: 'bad', text: 'That photo is larger than 10 MB.' });
      return;
    }
    setUploading(true);
    try {
      setPhoto(await ownerService.upload(file));
      setMessage({ tone: 'ok', text: 'Photo ready: press Save changes to keep it.' });
    } catch (err) {
      setMessage({ tone: 'bad', text: err instanceof ApiError ? err.message : 'The upload failed. Try again.' });
    } finally {
      setUploading(false);
    }
  };

  // ---- bank
  const bank = (owner?.kycBank || {}) as Record<string, string | undefined>;
  const [editBank, setEditBank] = useState(false);
  const [holder, setHolder] = useState('');
  const [account, setAccount] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankErrors, setBankErrors] = useState<Record<string, string>>({});
  const [bankBusy, setBankBusy] = useState(false);
  const [bankMessage, setBankMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const openBank = () => {
    setHolder(bank.accountHolderName || '');
    setAccount(bank.accountNumber || '');
    setIfsc(bank.ifscCode || '');
    setBankName(bank.bankName || '');
    setBankErrors({});
    setBankMessage(null);
    setEditBank(true);
  };

  const saveBank = async (ev: FormEvent) => {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (holder.trim().length < 2) e.holder = 'Enter the account holder’s name.';
    if (!ACCOUNT_RE.test(account.trim())) e.account = 'Account numbers are 8 to 18 digits.';
    if (!IFSC_RE.test(ifsc.trim().toUpperCase())) e.ifsc = 'An IFSC code is 11 characters, like HDFC0001234.';
    setBankErrors(e);
    if (Object.keys(e).length) return;
    setBankBusy(true);
    setBankMessage(null);
    try {
      await ownerService.saveKycDraft({
        kycBank: { accountHolderName: holder.trim(), accountNumber: account.trim(), ifscCode: ifsc.trim().toUpperCase(), bankName: bankName.trim() },
      });
      await auth.refresh();
      setEditBank(false);
      setBankMessage({ tone: 'ok', text: 'Bank details saved.' });
    } catch (err) {
      setBankMessage({ tone: 'bad', text: err instanceof ApiError ? err.message : 'Could not save. Please try again.' });
    } finally {
      setBankBusy(false);
    }
  };

  if (!user) return null;
  const initial = (legalName || user.firstName || 'O').trim()[0]?.toUpperCase() || 'O';

  return (
    <>
      <Grid cols={2}>
        <Card title="KYC verification" right={<KycTag status={owner?.kycStatus} />}>
          <div className="vstack">
            {owner?.kycStatus === 'rejected' && <Note tone="bad">Not approved{owner.kycRejectionReason ? `: ${owner.kycRejectionReason}` : '.'} Fix it and submit again.</Note>}
            {owner?.kycStatus === 'submitted' && <Note>Submitted and being reviewed.</Note>}
            {owner?.kycStatus === 'verified' && <Note>Verified. Thank you.</Note>}
            {(owner?.kycStatus === 'not_started' || owner?.kycStatus === 'draft') && <Note tone="warn">KYC is not submitted yet.</Note>}
            <Kv rows={[
              ['Owner type', OWNER_TYPE_LABELS[type] || type],
              ['Document', String((owner?.kycIdentity as Record<string, string> | undefined)?.documentType || '–').replace(/_/g, ' ')],
              ['Member since', dateOf(user.createdAt)],
            ]} />
            <div className="bar">
              <LinkBtn to="/kyc" variant={owner?.kycStatus === 'verified' || owner?.kycStatus === 'submitted' ? undefined : 'primary'}>
                {owner?.kycStatus === 'verified' || owner?.kycStatus === 'submitted' ? 'View my KYC' : 'Open KYC'}
              </LinkBtn>
            </div>
          </div>
        </Card>

        <Card title="Payout bank account" right={!editBank && <Btn onClick={openBank}>{bank.accountNumber ? 'Edit' : 'Add'}</Btn>}>
          {bankMessage && <Note tone={bankMessage.tone === 'bad' ? 'bad' : undefined}>{bankMessage.text}</Note>}
          {!editBank ? (
            bank.accountNumber ? (
              <Kv rows={[
                ['Account holder', bank.accountHolderName || '–'],
                ['Account number', mask(bank.accountNumber)],
                ['IFSC', bank.ifscCode || '–'],
                ['Bank', bank.bankName || '–'],
              ]} />
            ) : (
              <p className="muted">No bank account yet. Payouts need one.</p>
            )
          ) : (
            <form className="form" onSubmit={saveBank} noValidate>
              <Fld label="Account holder name" error={bankErrors.holder}>
                <input type="text" value={holder} onChange={(e) => setHolder(e.target.value)} disabled={bankBusy} maxLength={80} />
              </Fld>
              <Fld label="Account number" error={bankErrors.account}>
                <input type="text" inputMode="numeric" autoComplete="off" value={account} onChange={(e) => setAccount(e.target.value.replace(/\D/g, '').slice(0, 18))} disabled={bankBusy} />
              </Fld>
              <div className="row">
                <Fld label="IFSC code" error={bankErrors.ifsc}>
                  <input type="text" className="mono" value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11))} disabled={bankBusy} />
                </Fld>
                <Fld label="Bank name (optional)">
                  <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} disabled={bankBusy} maxLength={60} />
                </Fld>
              </div>
              <div className="actions">
                <Btn onClick={() => setEditBank(false)} disabled={bankBusy}>Cancel</Btn>
                <button type="submit" className="btn primary" disabled={bankBusy}>{bankBusy ? 'Saving…' : 'Save bank details'}</button>
              </div>
            </form>
          )}
        </Card>
      </Grid>

      <Card title="Your details">
        <form className="form" onSubmit={save} noValidate>
          {attempted && Object.keys(errors).length > 0 && <Note tone="bad">A few fields need your attention.</Note>}
          {message && <Note tone={message.tone === 'bad' ? 'bad' : undefined}>{message.text}</Note>}

          <div className="bar" style={{ gap: 16 }}>
            {photo ? <img src={fileUrl(photo)} alt="Your profile" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }} /> : <div className="avatar" style={{ width: 72, height: 72, fontSize: 28 }} aria-hidden="true">{initial}</div>}
            <label className="btn doc-pick">
              <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" onChange={pickPhoto} disabled={uploading || saving} />
              {uploading ? 'Uploading…' : photo ? 'Change photo' : 'Add a photo'}
            </label>
            {photo && !uploading && <Btn onClick={() => setPhoto('')} disabled={saving}>Remove</Btn>}
          </div>

          <div className="row">
            <Fld label="Full legal name" error={errors.legalName}>
              <input type="text" value={legalName} onChange={(e) => setLegalName(e.target.value)} disabled={saving} maxLength={80} />
            </Fld>
            <Fld label="Date of birth" error={errors.dob}>
              <input type="date" value={dob} max={todayIso()} onChange={(e) => setDob(e.target.value)} disabled={saving} />
            </Fld>
          </div>
          <div className="row">
            <Fld label="Mobile number" hint="You sign in with this number, so it cannot be changed here">
              <div className="readonly">{user.phone ? `+91 ${user.phone}` : '—'}</div>
            </Fld>
            <Fld label="Alternate mobile (optional)" error={errors.altPhone}>
              <input type="tel" inputMode="numeric" value={altPhone} onChange={(e) => setAltPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} disabled={saving} />
            </Fld>
          </div>
          <Fld label="Email (optional)" error={errors.email}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={saving} />
          </Fld>

          {needsBusiness && (
            <>
              <h2 className="sec-title">Your business</h2>
              <Fld label="Business name" error={errors.businessName}>
                <input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)} disabled={saving} maxLength={100} />
              </Fld>
              <div className="row">
                <Fld label="Your role (optional)">
                  <input type="text" value={role} onChange={(e) => setRole(e.target.value)} disabled={saving} maxLength={60} />
                </Fld>
                <Fld label="Registration ID (optional)">
                  <input type="text" value={registration} onChange={(e) => setRegistration(e.target.value)} disabled={saving} maxLength={40} />
                </Fld>
              </div>
            </>
          )}
          {isLand && (
            <Fld label="Name of the land" error={errors.landLabel}>
              <input type="text" value={landLabel} onChange={(e) => setLandLabel(e.target.value)} disabled={saving} maxLength={60} />
            </Fld>
          )}

          <h2 className="sec-title">Address</h2>
          <Fld label="Address line 1" error={errors.line1}>
            <input type="text" value={line1} onChange={(e) => setLine1(e.target.value)} disabled={saving} maxLength={120} />
          </Fld>
          <Fld label="Address line 2 (optional)">
            <input type="text" value={line2} onChange={(e) => setLine2(e.target.value)} disabled={saving} maxLength={120} />
          </Fld>
          <div className="row3">
            <Fld label="Pincode" error={errors.pincode}>
              <input type="text" inputMode="numeric" maxLength={6} value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))} disabled={saving} />
            </Fld>
            <Fld label="City" error={errors.city}>
              <input type="text" value={city} onChange={(e) => setCity(e.target.value)} disabled={saving} maxLength={60} />
            </Fld>
            <Fld label="State" error={errors.state}>
              <select className="fld" value={state} onChange={(e) => setState(e.target.value)} disabled={saving}>
                <option value="">Choose…</option>
                {INDIAN_STATES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                {state && !INDIAN_STATES.some((s) => s.value === state) && <option value={state}>{state}</option>}
              </select>
            </Fld>
          </div>

          <div className="actions">
            <button type="submit" className="btn primary" disabled={saving || uploading}>{saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        </form>
      </Card>

      <Card title="Account">
        <div className="bar">
          <span className="muted">Signed in as {user.phone ? `+91 ${user.phone}` : 'this account'}.</span>
          <span className="grow" />
          <Btn variant="danger" onClick={() => { auth.signOut(); navigate('/login', { replace: true }); }}>Sign out</Btn>
        </div>
        <p className="help" style={{ marginTop: 8 }}>
          Deleting an account or changing the phone number you sign in with is not something this dashboard can do yet.
        </p>
      </Card>
    </>
  );
}
