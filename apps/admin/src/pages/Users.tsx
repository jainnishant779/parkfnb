import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Mail, Phone, ShieldAlert } from 'lucide-react';
import { ApiError, requestPaged, api, type ApiMeta } from '../lib/api';
import {
  Card,
  EmptyState,
  ErrorState,
  FilterPills,
  LoadingState,
  PageHeader,
  Pagination,
  SearchInput,
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
import { EMPTY, formatDate, formatDateTime, humanize } from '../components/tables/format';
import {
  ONBOARDING_STEP_LABEL,
  USER_TYPE_LABEL,
  userDisplayName,
  type User,
  type UserType,
} from '../components/tables/types';

const PAGE_SIZE = 20;

/** `user_type` on the backend; '' means no filter. */
const TYPE_FILTERS: { value: UserType | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'user', label: 'Drivers' },
  { value: 'owner', label: 'Owners' },
  { value: 'admin', label: 'Admins' },
];

/** GET /api/users answers with `{ users: [...] }` plus a top-level `meta`. */
interface UsersResponse {
  users: User[];
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [meta, setMeta] = useState<ApiMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [userType, setUserType] = useState<UserType | ''>('');
  const [selected, setSelected] = useState<User | null>(null);

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);

    requestPaged<UsersResponse>('/api/users', {
      query: {
        page,
        limit: PAGE_SIZE,
        // Backend matches search against first_name, last_name and email only —
        // a phone number will not find anything, hence the placeholder wording.
        search: search.trim() || undefined,
        user_type: userType || undefined,
      },
    })
      .then((result) => {
        if (!active) return;
        setUsers(result.data.users ?? []);
        setMeta(result.meta);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setUsers([]);
        setMeta(null);
        setError(err instanceof ApiError ? err.message : 'Something went wrong.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, search, userType]);

  useEffect(load, [load]);

  // A new search or filter invalidates the current page number.
  const changeSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };
  const changeType = (value: UserType | '') => {
    setUserType(value);
    setPage(1);
  };

  const filtered = search.trim().length > 0 || userType !== '';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users"
        subtitle={
          meta
            ? `${meta.total.toLocaleString()} ${meta.total === 1 ? 'account' : 'accounts'} registered`
            : 'Every account registered on Parkfnb'
        }
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <FilterPills options={TYPE_FILTERS} value={userType} onChange={changeType} />
          <SearchInput value={search} onChange={changeSearch} placeholder="Search name or email" />
        </div>

        {loading ? (
          <LoadingState label="Loading users…" />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : users.length === 0 ? (
          <EmptyState
            message={filtered ? 'No users match these filters' : 'No users yet'}
            hint={
              filtered
                ? 'Try a different search term, or clear the account-type filter.'
                : 'Accounts will appear here as people sign up in the apps.'
            }
          />
        ) : (
          <>
            <TableScroll>
              <table className="w-full min-w-[860px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <Th>Name</Th>
                    <Th>Contact</Th>
                    <Th>Type</Th>
                    <Th>Onboarding</Th>
                    <Th>Verification</Th>
                    <Th>Joined</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      onClick={() => setSelected(user)}
                      className="cursor-pointer transition hover:bg-mint/60"
                    >
                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar user={user} />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-800">
                              {userDisplayName(user)}
                            </p>
                            <p className="text-xs text-slate-400">
                              {user.authMethod ? `${humanize(user.authMethod)} sign-in` : EMPTY}
                            </p>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <ContactCell user={user} />
                      </Td>
                      <Td>
                        <TypeBadge userType={user.userType} />
                      </Td>
                      <Td className="text-slate-500">
                        {user.onboardingStep
                          ? ONBOARDING_STEP_LABEL[user.onboardingStep] ??
                            humanize(user.onboardingStep)
                          : EMPTY}
                      </Td>
                      <Td>
                        <VerificationCell user={user} />
                      </Td>
                      <Td className="whitespace-nowrap text-slate-500">
                        {formatDate(user.createdAt)}
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

      <UserDrawer user={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ row cells */

function Avatar({ user }: { user: User }) {
  const name = userDisplayName(user);
  // Fall back through name -> email -> phone so the circle is never blank.
  const source = name !== 'Unnamed user' ? name : user.email ?? user.phone ?? '?';

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-mint text-xs font-semibold text-teal">
      {user.profilePictureUrl ? (
        <img src={user.profilePictureUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        source.charAt(0).toUpperCase()
      )}
    </div>
  );
}

/**
 * Email and phone are both optional on User, and an OTP-only account has just
 * the phone. Each line appears only when its value exists; a user with neither
 * gets a single dash rather than two blank rows.
 */
function ContactCell({ user }: { user: User }) {
  if (!user.email && !user.phone) return <span className="text-slate-400">{EMPTY}</span>;

  return (
    <div className="space-y-0.5">
      {user.email && (
        <p className="flex items-center gap-1.5 text-slate-700">
          <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate">{user.email}</span>
        </p>
      )}
      {user.phone && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          {user.phone}
        </p>
      )}
    </div>
  );
}

const TYPE_STYLES: Record<UserType, string> = {
  user: 'bg-slate-100 text-slate-600',
  owner: 'bg-indigo-50 text-indigo-700',
  admin: 'bg-teal/10 text-teal',
};

function TypeBadge({ userType }: { userType?: UserType }) {
  if (!userType) return <span className="text-slate-400">{EMPTY}</span>;
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
        TYPE_STYLES[userType] ?? 'bg-slate-100 text-slate-600'
      }`}
    >
      {USER_TYPE_LABEL[userType] ?? humanize(userType)}
    </span>
  );
}

/**
 * Two independent booleans on the model: `is_verified` (identity confirmed) and
 * `is_active` (not suspended). A deactivated account is the more urgent fact,
 * so it takes the cell; verification shows underneath.
 */
function VerificationCell({ user }: { user: User }) {
  return (
    <div className="space-y-0.5">
      {user.isVerified ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
          <BadgeCheck className="h-3.5 w-3.5" />
          Verified
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
          <ShieldAlert className="h-3.5 w-3.5" />
          Unverified
        </span>
      )}
      {user.isActive === false && (
        <p className="text-xs font-medium text-red-600">Deactivated</p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- drawer */

/** GET /api/users/:id answers with `{ user: {...} }`. */
interface UserDetailResponse {
  user: User;
}

/**
 * Shows the row's data immediately, then replaces it with the detail response.
 * The list endpoint projects a subset of the document, so fields like the
 * address and last login only exist after this second request.
 */
function UserDrawer({ user, onClose }: { user: User | null; onClose: () => void }) {
  const [detail, setDetail] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setDetail(null);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    api
      .get<UserDetailResponse>(`/api/users/${user.id}`)
      .then((result) => {
        if (active) setDetail(result.user);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? `Full profile unavailable: ${err.message}`
            : 'Full profile unavailable.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  if (!user) return null;

  const shown = detail ?? user;
  const address = [
    shown.addressLine1,
    shown.addressLine2,
    shown.city,
    shown.state,
    shown.postalCode,
    shown.country,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <DetailDrawer
      open
      title={userDisplayName(shown)}
      subtitle={`User ${shown.id}`}
      onClose={onClose}
    >
      {error && <DrawerError message={error} />}
      {loading && !detail ? (
        <DrawerLoading />
      ) : (
        <div className={error ? 'mt-4' : ''}>
          <DetailSection title="Account">
            <DetailRow label="Account type" value={<TypeBadge userType={shown.userType} />} />
            <DetailRow
              label="Sign-in method"
              value={shown.authMethod ? `${humanize(shown.authMethod)} sign-in` : null}
            />
            <DetailRow
              label="Onboarding"
              value={
                shown.onboardingStep
                  ? ONBOARDING_STEP_LABEL[shown.onboardingStep] ?? humanize(shown.onboardingStep)
                  : null
              }
            />
            <DetailRow
              label="Verification"
              value={<StatusBadge status={shown.isVerified ? 'confirmed' : 'pending'} />}
            />
            <DetailRow
              label="Status"
              value={
                shown.isActive === false ? (
                  <span className="font-medium text-red-600">Deactivated</span>
                ) : (
                  <span className="text-emerald-600">Active</span>
                )
              }
            />
          </DetailSection>

          <DetailSection title="Contact">
            <DetailRow label="Email" value={shown.email} />
            <DetailRow label="Phone" value={shown.phone} />
            <DetailRow label="Alternate phone" value={shown.alternatePhone} />
            <DetailRow label="Address" value={address} />
          </DetailSection>

          <DetailSection title="Profile">
            <DetailRow label="Legal name" value={shown.legalName} />
            <DetailRow
              label="Date of birth"
              value={shown.dateOfBirth ? formatDate(shown.dateOfBirth) : null}
            />
            <DetailRow label="Language" value={shown.preferredLanguage} />
          </DetailSection>

          <DetailSection title="Activity">
            <DetailRow
              label="Joined"
              value={shown.createdAt ? formatDateTime(shown.createdAt) : null}
            />
            <DetailRow
              label="Last login"
              value={shown.lastLogin ? formatDateTime(shown.lastLogin) : null}
            />
          </DetailSection>
        </div>
      )}
    </DetailDrawer>
  );
}
