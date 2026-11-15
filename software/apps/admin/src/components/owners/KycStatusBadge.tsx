import type { KycStatus } from './types';

/**
 * Style and wording per KYC state.
 *
 * We key the badge off `kyc_status`, never off `is_verified`, because
 * kyc_status is the field the owner app actually reads: publicOwner() returns
 * it on sign-in and getOnboardingStatus() routes the owner to KycIntro when it
 * is not_started/draft/rejected. `is_verified` is a separate legacy boolean
 * that no app screen gates on. Showing "Verified" from is_verified would tell
 * an admin the owner is through when their app still shows them blocked.
 */
const STYLES: Record<KycStatus, { label: string; className: string }> = {
  submitted: { label: 'Submitted', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  draft: { label: 'In progress', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  verified: { label: 'Verified', className: 'bg-green-50 text-green-700 ring-green-200' },
  rejected: { label: 'Rejected', className: 'bg-red-50 text-red-700 ring-red-200' },
  not_started: { label: 'Not started', className: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

export const KYC_STATUS_LABEL = (status: KycStatus): string => STYLES[status].label;

export default function KycStatusBadge({ status }: { status: KycStatus }) {
  const { label, className } = STYLES[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      {label}
    </span>
  );
}
