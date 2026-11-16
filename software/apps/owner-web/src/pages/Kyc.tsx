import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthFrame from '../components/AuthFrame';
import { Btn, Note, Seg, Tag } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { Check, FileUpload, Fld, KycTag } from '../components/listings/form';
import { DOCUMENT_TYPES, INDIAN_STATES, stateCode } from '../components/listings/constants';
import { ownerService, type KycInput } from '../services/ownerService';
import '../styles/listings.css';

/**
 * Step 2 of 2: verify who you are, where you are and where payouts go. The same four sections and rules as the owner app's KYC screen
 * (PUT /api/owners/me/kyc/draft saves, PUT /api/owners/me/kyc submits for review). Once submitted or verified it is read-only; a rejected
 * KYC can be fixed and sent again.
 */

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const ageOf = (iso: string): number => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age -= 1;
  return age;
};

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^\d{8,18}$/;

type Section = 'personal' | 'identity' | 'address' | 'bank';

export default function Kyc() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { user, owner } = auth;
  const locked = owner?.kycStatus === 'submitted' || owner?.kycStatus === 'verified';

  const stored = useMemo(
    () => ({
      personal: (owner?.kycPersonal || {}) as Record<string, string | undefined>,
      identity: (owner?.kycIdentity || {}) as Record<string, string | undefined>,
      address: (owner?.kycAddress || {}) as Record<string, string | undefined>,
      bank: (owner?.kycBank || {}) as Record<string, string | undefined>,
    }),
    [owner],
  );

  const [fullName, setFullName] = useState(stored.personal.fullName || user?.legalName || [user?.firstName, user?.lastName].filter(Boolean).join(' '));
  const [dob, setDob] = useState((stored.personal.dateOfBirth || user?.dateOfBirth || '').slice(0, 10));
  const [email, setEmail] = useState(stored.personal.email || user?.email || '');

  const [docType, setDocType] = useState(stored.identity.documentType || 'national_id');
  const [docNumber, setDocNumber] = useState(stored.identity.documentNumber || '');
  const [front, setFront] = useState(stored.identity.frontImageUrl || '');
  const [back, setBack] = useState(stored.identity.backImageUrl || '');
  const [selfie, setSelfie] = useState(stored.identity.selfieImageUrl || '');

  // The address on the proof is usually the one from the profile; only a different one is typed again.
  const sameInitially = !stored.address.addressLine1 || (stored.address.addressLine1 === user?.addressLine1 && stored.address.postalCode === user?.postalCode);
  const [same, setSame] = useState(sameInitially);
  const [line1, setLine1] = useState(stored.address.addressLine1 || '');
  const [line2, setLine2] = useState(stored.address.addressLine2 || '');
  const [city, setCity] = useState(stored.address.city || '');
  const [state, setState] = useState(stateCode(stored.address.state));
  const [pin, setPin] = useState(stored.address.postalCode || '');
  const [proof, setProof] = useState(stored.address.proofDocumentUrl || '');

  const [holder, setHolder] = useState(stored.bank.accountHolderName || '');
  const [account, setAccount] = useState(stored.bank.accountNumber || '');
  const [ifsc, setIfsc] = useState(stored.bank.ifscCode || '');
  const [bankName, setBankName] = useState(stored.bank.bankName || '');

  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState<'draft' | 'submit' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const addr = same
    ? { line1: user?.addressLine1 || '', city: user?.city || '', state: stateCode(user?.state), pin: user?.postalCode || '' }
    : { line1: line1.trim(), city: city.trim(), state, pin };

  const problems = useMemo(() => {
    const p: Partial<Record<string, string>> = {};
    if (fullName.trim().length < 2) p.fullName = 'Enter your full name as it is on your ID.';
    if (!dob) p.dob = 'Enter your date of birth.';
    else if (ageOf(dob) < 18) p.dob = 'You must be at least 18.';
    if ((user?.phone || '').length < 10) p.phone = 'Your account has no verified phone: sign out and sign in again.';
    if (docNumber.trim().length < 4) p.docNumber = 'Enter the document number.';
    if (!front) p.front = 'Upload the front of the document.';
    if (docType !== 'passport' && !back) p.back = 'Upload the back of the document.';
    if (addr.line1.length < 3) p.line1 = same ? 'Your profile has no address yet: untick “same as profile” and enter it here.' : 'Enter the address.';
    if (addr.city.length < 2) p.city = 'Enter the city.';
    if (!addr.state) p.state = 'Choose the state.';
    if (addr.pin.length < 4) p.pin = 'Enter the pincode.';
    if (!proof) p.proof = 'Upload a proof of address.';
    if (holder.trim().length < 2) p.holder = 'Enter the account holder’s name.';
    if (!ACCOUNT_RE.test(account.trim())) p.account = 'Account numbers are 8 to 18 digits.';
    if (!IFSC_RE.test(ifsc.trim().toUpperCase())) p.ifsc = 'An IFSC code is 11 characters, like HDFC0001234.';
    return p;
  }, [fullName, dob, user?.phone, docNumber, front, back, docType, addr.line1, addr.city, addr.state, addr.pin, same, proof, holder, account, ifsc]);

  const err = (k: string) => (showErrors ? problems[k] : undefined);
  const done: Record<Section, boolean> = {
    personal: !problems.fullName && !problems.dob && !problems.phone,
    identity: !problems.docNumber && !problems.front && !problems.back,
    address: !problems.line1 && !problems.city && !problems.state && !problems.pin && !problems.proof,
    bank: !problems.holder && !problems.account && !problems.ifsc,
  };
  const complete = Object.values(done).filter(Boolean).length;
  const ready = complete === 4;

  const payload = (forSubmit: boolean): KycInput => ({
    kycPersonal: { fullName: fullName.trim(), dateOfBirth: dob, phone: user?.phone || '', email: email.trim() },
    kycIdentity: { documentType: docType, documentNumber: docNumber.trim(), frontImageUrl: front, backImageUrl: docType === 'passport' ? '' : back, selfieImageUrl: selfie },
    kycBank: { accountHolderName: holder.trim(), accountNumber: account.trim(), ifscCode: ifsc.trim().toUpperCase(), bankName: bankName.trim() },
    // On submit the backend builds the address from the profile when asked to, and only needs the proof; a draft has no such step.
    ...(same && forSubmit
      ? { kycAddressSameAsProfile: true, kycAddress: { proofDocumentUrl: proof } }
      : {
          kycAddress: {
            addressLine1: same ? user?.addressLine1 || '' : line1.trim(),
            addressLine2: same ? user?.addressLine2 || '' : line2.trim(),
            city: addr.city,
            state: addr.state,
            postalCode: addr.pin,
            country: 'IN',
            proofDocumentUrl: proof,
          },
        }),
  });

  const saveDraft = async () => {
    setBusy('draft');
    setError(null);
    setSaved(null);
    try {
      await ownerService.saveKycDraft(payload(false));
      await auth.refresh();
      setSaved('Draft saved. You can come back to finish it.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the draft. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setShowErrors(true);
    setSaved(null);
    if (!ready) return; // the banner and the marked fields below say what is missing, and follow the form as it is filled in
    setBusy('submit');
    setError(null);
    try {
      await ownerService.submitKyc(payload(true));
      await auth.refresh();
      navigate('/');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not submit. Please try again.');
      setBusy(null);
    }
  };

  const disabled = locked || busy !== null;
  const heading = (title: string, key: Section) => (
    <div className="bar">
      <h2 className="sec-title">{title}</h2>
      <span className="grow" />
      {done[key] ? <Tag tone="green">Complete</Tag> : <Tag>To do</Tag>}
    </div>
  );

  return (
    <AuthFrame wide>
      <form className="form" onSubmit={submit} noValidate>
        <div className="steps" aria-label="Steps">
          <span className="st done">1 · Your details ✓</span>
          <span className="st on">2 · Verification (KYC)</span>
        </div>
        <div className="bar">
          <h1>Verify your identity</h1>
          <span className="grow" />
          <KycTag status={owner?.kycStatus} />
        </div>
        <p className="lead">We check this once, so we can pay you and keep renters safe. Your documents are private.</p>

        {owner?.kycStatus === 'rejected' && (
          <Note tone="bad">
            Your KYC was not approved{owner.kycRejectionReason ? `: ${owner.kycRejectionReason}` : '.'} Fix what is mentioned and submit it again.
          </Note>
        )}
        {owner?.kycStatus === 'submitted' && <Note>Your KYC is submitted and being reviewed. You can use the dashboard meanwhile.</Note>}
        {owner?.kycStatus === 'verified' && <Note>Your KYC is verified. Nothing more to do here.</Note>}
        {showErrors && !ready && !locked && <Note tone="bad">Some sections are not finished yet: they are marked below.</Note>}
        {error && <Note tone="bad">{error}</Note>}
        {saved && <Note>{saved}</Note>}

        {!locked && (
          <div>
            <div className="progress" role="progressbar" aria-valuenow={complete * 25} aria-valuemin={0} aria-valuemax={100} aria-label="KYC progress"><i style={{ width: `${complete * 25}%` }} /></div>
            <small className="muted">{complete} of 4 sections complete</small>
          </div>
        )}

        <section className="form-sec">
          {heading('1. Personal details', 'personal')}
          <div className="row">
            <Fld label="Full name (as on your ID)" error={err('fullName')}>
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={disabled} maxLength={80} autoComplete="name" />
            </Fld>
            <Fld label="Date of birth" error={err('dob')}>
              <input type="date" value={dob} max={todayIso()} onChange={(e) => setDob(e.target.value)} disabled={disabled} />
            </Fld>
          </div>
          <div className="row">
            <Fld label="Mobile number" error={err('phone')}>
              <div className="readonly">{user?.phone ? `+91 ${user.phone}` : '—'}</div>
            </Fld>
            <Fld label="Email (optional)">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={disabled} />
            </Fld>
          </div>
        </section>

        <section className="form-sec">
          {heading('2. Identity document', 'identity')}
          <div>
            <Seg options={DOCUMENT_TYPES as { value: string; label: string }[]} value={docType} onChange={(v) => !disabled && setDocType(v)} />
          </div>
          <Fld label="Document number" error={err('docNumber')}>
            <input type="text" value={docNumber} onChange={(e) => setDocNumber(e.target.value.toUpperCase())} disabled={disabled} maxLength={30} autoCapitalize="characters" />
          </Fld>
          <div className="docs">
            <FileUpload label="Front of the document" value={front} onChange={setFront} disabled={disabled} error={err('front')} />
            {docType !== 'passport' && <FileUpload label="Back of the document" value={back} onChange={setBack} disabled={disabled} error={err('back')} />}
            <FileUpload label="Selfie (optional)" value={selfie} onChange={setSelfie} disabled={disabled} hint="A clear photo of your face" />
          </div>
        </section>

        <section className="form-sec">
          {heading('3. Address proof', 'address')}
          <Check checked={same} onChange={setSame} disabled={disabled}>
            The address on my proof is the one in my profile{user?.addressLine1 ? ` (${user.addressLine1}, ${user.city || ''})` : ''}
          </Check>
          {!same && (
            <>
              <Fld label="Address line 1" error={err('line1')}>
                <input type="text" value={line1} onChange={(e) => setLine1(e.target.value)} disabled={disabled} maxLength={120} />
              </Fld>
              <Fld label="Address line 2 (optional)">
                <input type="text" value={line2} onChange={(e) => setLine2(e.target.value)} disabled={disabled} maxLength={120} />
              </Fld>
              <div className="row3">
                <Fld label="City" error={err('city')}>
                  <input type="text" value={city} onChange={(e) => setCity(e.target.value)} disabled={disabled} maxLength={60} />
                </Fld>
                <Fld label="State" error={err('state')}>
                  <select className="fld" value={state} onChange={(e) => setState(e.target.value)} disabled={disabled}>
                    <option value="">Choose…</option>
                    {INDIAN_STATES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </Fld>
                <Fld label="Pincode" error={err('pin')}>
                  <input type="text" inputMode="numeric" value={pin} maxLength={6} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} disabled={disabled} />
                </Fld>
              </div>
            </>
          )}
          {same && showErrors && (problems.line1 || problems.city || problems.state || problems.pin) && (
            <small className="field-err" role="alert">{problems.line1 || problems.city || problems.state || problems.pin}</small>
          )}
          <div className="docs">
            <FileUpload label="Proof of address" value={proof} onChange={setProof} disabled={disabled} error={err('proof')} hint="A utility bill, bank statement or rent agreement" />
          </div>
        </section>

        <section className="form-sec">
          {heading('4. Bank account for payouts', 'bank')}
          <div className="row">
            <div className="vstack" style={{ gap: 4, alignContent: 'start' }}>
              <Fld label="Account holder name" error={err('holder')}>
                <input type="text" value={holder} onChange={(e) => setHolder(e.target.value)} disabled={disabled} maxLength={80} />
              </Fld>
              {!disabled && fullName.trim() && holder !== fullName.trim() && (
                <button type="button" className="linkish" style={{ justifySelf: 'start', height: 32, padding: '0 8px' }} onClick={() => setHolder(fullName.trim())}>Same as my name</button>
              )}
            </div>
            <Fld label="Bank name (optional)">
              <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} disabled={disabled} maxLength={60} />
            </Fld>
          </div>
          <div className="row">
            <Fld label="Account number" error={err('account')}>
              <input type="text" inputMode="numeric" autoComplete="off" value={account} onChange={(e) => setAccount(e.target.value.replace(/\D/g, '').slice(0, 18))} disabled={disabled} />
            </Fld>
            <Fld label="IFSC code" error={err('ifsc')}>
              <input type="text" value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11))} disabled={disabled} className="mono" />
            </Fld>
          </div>
        </section>

        <div className="actions">
          {owner && auth.onboarded ? <Link className="btn" to="/profile">Back to profile</Link> : <Link className="btn" to="/onboarding">Back to my details</Link>}
          {!locked && <Btn onClick={() => void saveDraft()} disabled={busy !== null}>{busy === 'draft' ? 'Saving…' : 'Save draft'}</Btn>}
          {!locked && <button type="submit" className="btn primary" disabled={busy !== null}>{busy === 'submit' ? 'Submitting…' : 'Submit for review'}</button>}
          {locked && <Link className="btn primary" to="/">Go to the dashboard</Link>}
        </div>
      </form>
    </AuthFrame>
  );
}
