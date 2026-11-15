import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  XCircle,
} from 'lucide-react';
import DetailBlock, { Field, isBlank } from '../components/owners/DetailBlock';
import KycDecisionDialog, { type KycDecision } from '../components/owners/KycDecisionDialog';
import KycDocument from '../components/owners/KycDocument';
import KycStatusBadge from '../components/owners/KycStatusBadge';
import { decideKyc, fetchOwner, fetchOwnerStats } from '../components/owners/ownersApi';
import {
  isBusinessOwner,
  kycStatusOf,
  OWNER_TYPE_LABEL,
  ownerDisplayName,
  ownerEmail,
  ownerPhone,
  type Owner,
  type OwnerStats,
} from '../components/owners/types';
import { ApiError } from '../lib/api';

const formatDate = (value?: string): string | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? undefined
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatDateTime = (value?: string): string | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString('en-IN');
};

/** Joins the address block into one readable line, skipping the parts not filled in. */
const composeAddress = (owner: Owner): string | undefined => {
  const address = owner.kycAddress;
  if (!address) return undefined;
  const line = [address.addressLine1, address.addressLine2, address.city, address.state, address.postalCode, address.country]
    .filter((part) => !isBlank(part))
    .join(', ');
  return line || undefined;
};

export default function OwnerDetail() {
  const { id } = useParams<{ id: string }>();
  const [owner, setOwner] = useState<Owner | null>(null);
  const [stats, setStats] = useState<OwnerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [decision, setDecision] = useState<KycDecision | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionDone, setDecisionDone] = useState<string | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) => {
      if (!id) return;
      setLoading(true);
      setLoadError(null);

      fetchOwner(id, signal)
        .then((data) => setOwner(data.owner))
        .catch((err: unknown) => {
          if (signal?.aborted) return;
          setLoadError(err instanceof ApiError ? err.message : 'Could not load this owner.');
        })
        .finally(() => {
          if (!signal?.aborted) setLoading(false);
        });

      // Stats are supplementary: the review can proceed without them, so a
      // failure here leaves the counts blank instead of blocking the page.
      fetchOwnerStats(id, signal)
        .then(setStats)
        .catch(() => setStats(null));
    },
    [id],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const submitDecision = async (notes: string) => {
    if (!id || !decision) return;
    setDeciding(true);
    setDecisionError(null);
    try {
      const result = await decideKyc(id, decision === 'approve', notes);
      setOwner(result.owner);
      setDecision(null);
      setDecisionDone(
        decision === 'approve' ? 'KYC approved and recorded.' : 'KYC rejected and the reason recorded.',
      );
    } catch (err: unknown) {
      setDecisionError(err instanceof ApiError ? err.message : 'The decision could not be saved.');
    } finally {
      setDeciding(false);
    }
  };

  if (loading && !owner) {
    return (
      <Centered>
        <Loader2 className="h-5 w-5 animate-spin text-teal" />
        <span className="text-sm text-slate-500">Loading owner…</span>
      </Centered>
    );
  }

  if (loadError || !owner) {
    return (
      <div>
        <BackLink />
        <Centered>
          <AlertCircle className="h-5 w-5 text-red-500" strokeWidth={1.75} />
          <span className="text-sm text-red-700">{loadError ?? 'Owner not found.'}</span>
        </Centered>
      </div>
    );
  }

  const status = kycStatusOf(owner);
  const name = ownerDisplayName(owner);
  const personal = owner.kycPersonal;
  const identity = owner.kycIdentity;
  const address = owner.kycAddress;
  const bank = owner.kycBank;

  // `is_verified` and `kyc_status` are written by different code paths — the
  // admin verify endpoint sets only is_verified, while the owner app reads only
  // kyc_status — so they can genuinely disagree. Surface the disagreement
  // instead of picking whichever looks better.
  const statusDisagrees =
    (owner.isVerified && status !== 'verified') || (!owner.isVerified && status === 'verified');

  return (
    <div>
      <BackLink />

      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900">{name}</h1>
            <KycStatusBadge status={status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {OWNER_TYPE_LABEL[owner.ownerType] ?? owner.ownerType}
            {formatDate(owner.createdAt) ? ` · Joined ${formatDate(owner.createdAt)}` : ''}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setDecisionError(null);
              setDecision('reject');
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50"
          >
            <XCircle className="h-4 w-4" strokeWidth={1.75} />
            Reject
          </button>
          <button
            type="button"
            onClick={() => {
              setDecisionError(null);
              setDecision('approve');
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-dark"
          >
            <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />
            Approve
          </button>
        </div>
      </header>

      {decisionDone && (
        <Notice tone="success" icon={CheckCircle2}>
          {decisionDone}
        </Notice>
      )}

      {statusDisagrees && (
        <Notice tone="warning" icon={AlertTriangle}>
          This account&rsquo;s two verification fields disagree: <code>is_verified</code> is{' '}
          <strong>{String(owner.isVerified)}</strong> while <code>kyc_status</code> is{' '}
          <strong>{status}</strong>. The badge above follows <code>kyc_status</code>, which is the
          field the owner app reads to decide whether this owner is still blocked at the KYC step.
        </Notice>
      )}

      {status === 'rejected' && !isBlank(owner.kycRejectionReason) && (
        <Notice tone="warning" icon={AlertCircle}>
          Rejection reason shown to the owner: {owner.kycRejectionReason}
        </Notice>
      )}

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Stat label="Listings" value={stats?.totalSpaces} />
        <Stat label="Bookings" value={stats?.totalBookings} />
        <Stat label="Average rating" value={owner.averageRating ? owner.averageRating.toFixed(1) : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DetailBlock
          title="Identity"
          source={owner}
          emptyMessage="No account details available."
          allFieldsBlank={false}
        >
          <Field label="Legal name" value={personal?.fullName} />
          <Field label="Account name" value={name} />
          <Field label="Phone" value={ownerPhone(owner)} />
          <Field label="Email" value={ownerEmail(owner)} />
          <Field label="Date of birth" value={formatDate(personal?.dateOfBirth) ?? personal?.dateOfBirth} />
          <Field label="Address" value={composeAddress(owner)} />
        </DetailBlock>

        {isBusinessOwner(owner.ownerType) && (
          <DetailBlock
            title="Business"
            source={owner}
            emptyMessage="No business details available."
            allFieldsBlank={
              isBlank(owner.businessName) && isBlank(owner.roleDesignation) && isBlank(owner.registrationId)
            }
          >
            <Field label="Business name" value={owner.businessName} />
            <Field label="Role" value={owner.roleDesignation} />
            <Field label="Registration ID" value={owner.registrationId} />
          </DetailBlock>
        )}

        <DetailBlock
          title="KYC · Personal"
          source={personal}
          emptyMessage="This owner has not completed the personal details step."
          allFieldsBlank={
            !!personal &&
            isBlank(personal.fullName) &&
            isBlank(personal.dateOfBirth) &&
            isBlank(personal.phone) &&
            isBlank(personal.email)
          }
        >
          <Field label="Full name" value={personal?.fullName} />
          <Field label="Date of birth" value={formatDate(personal?.dateOfBirth) ?? personal?.dateOfBirth} />
          <Field label="Phone" value={personal?.phone} />
          <Field label="Email" value={personal?.email} />
        </DetailBlock>

        <DetailBlock
          title="KYC · Identity document"
          source={identity}
          emptyMessage="This owner has not uploaded an identity document."
          allFieldsBlank={!!identity && isBlank(identity.documentType) && isBlank(identity.documentNumber)}
          footer={
            identity && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <KycDocument label="ID front" path={identity.frontImageUrl} />
                <KycDocument label="ID back" path={identity.backImageUrl} />
                <KycDocument label="Selfie" path={identity.selfieImageUrl} />
              </div>
            )
          }
        >
          <Field label="Document type" value={identity?.documentType} />
          <Field label="Document number" value={identity?.documentNumber} />
        </DetailBlock>

        <DetailBlock
          title="KYC · Address"
          source={address}
          emptyMessage="This owner has not completed the address step."
          allFieldsBlank={
            !!address &&
            isBlank(address.addressLine1) &&
            isBlank(address.city) &&
            isBlank(address.state) &&
            isBlank(address.postalCode)
          }
          footer={
            address && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <KycDocument label="Address proof" path={address.proofDocumentUrl} />
              </div>
            )
          }
        >
          <Field label="Address line 1" value={address?.addressLine1} />
          <Field label="Address line 2" value={address?.addressLine2} />
          <Field label="City" value={address?.city} />
          <Field label="State" value={address?.state} />
          <Field label="Postal code" value={address?.postalCode} />
          <Field label="Country" value={address?.country} />
        </DetailBlock>

        <DetailBlock
          title="KYC · Bank"
          source={bank}
          emptyMessage="This owner has not added payout bank details."
          allFieldsBlank={
            !!bank &&
            isBlank(bank.accountHolderName) &&
            isBlank(bank.accountNumber) &&
            isBlank(bank.ifscCode) &&
            isBlank(bank.bankName)
          }
        >
          <Field label="Account holder" value={bank?.accountHolderName} />
          <Field label="Account number" value={bank?.accountNumber} />
          <Field label="IFSC code" value={bank?.ifscCode} />
          <Field label="Bank name" value={bank?.bankName} />
        </DetailBlock>

        <DetailBlock title="Review history" source={owner} emptyMessage="No review history.">
          <Field label="Submitted" value={formatDateTime(owner.kycSubmittedAt)} />
          <Field label="Decided" value={formatDateTime(owner.kycVerifiedAt)} />
          <Field label="Reviewer notes" value={owner.kycVerificationNotes} />
          <Field label="Rejection reason" value={owner.kycRejectionReason} />
        </DetailBlock>
      </div>

      {/*
        Uploads are written to the API host's local disk (uploadRoutes.js), which
        is wiped on every deploy, so documents from before the last deploy are
        gone even though their URLs are still in the database. Each thumbnail
        says "Document unavailable" when its file 404s; this explains why.
      */}
      <p className="mt-4 flex items-start gap-2 rounded-card bg-white p-4 text-xs text-slate-500 shadow-card">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.75} />
        Uploaded documents are stored on the API server&rsquo;s local disk, which is cleared on each
        deploy. A document marked &ldquo;Document unavailable&rdquo; still has a record in the
        database but its file is no longer on the server — ask the owner to re-upload rather than
        rejecting them for it.
      </p>

      {decision && (
        <KycDecisionDialog
          decision={decision}
          ownerName={name}
          busy={deciding}
          errorMessage={decisionError}
          onCancel={() => {
            setDecision(null);
            setDecisionError(null);
          }}
          onConfirm={submitDecision}
        />
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/owners"
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-teal"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to owners
    </Link>
  );
}

function Stat({ label, value }: { label: string; value?: number | string }) {
  return (
    <div className="rounded-card bg-white p-5 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      {/* An em dash when the stats call failed or returned nothing: a 0 here
          would claim a fact we do not have. */}
      <p className="mt-1.5 text-2xl font-semibold text-slate-900">
        {value === undefined || value === null ? <span className="text-slate-300">—</span> : value}
      </p>
    </div>
  );
}

function Notice({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'success' | 'warning';
  icon: typeof AlertCircle;
  children: React.ReactNode;
}) {
  const styles =
    tone === 'success'
      ? 'bg-green-50 text-green-800 ring-green-200'
      : 'bg-amber-50 text-amber-900 ring-amber-200';
  return (
    <div className={`mb-4 flex items-start gap-2.5 rounded-card px-4 py-3 text-sm ring-1 ring-inset ${styles}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
      <div>{children}</div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 rounded-card bg-white shadow-card">
      {children}
    </div>
  );
}
