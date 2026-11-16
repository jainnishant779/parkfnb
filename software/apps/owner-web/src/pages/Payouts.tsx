import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, Card, Empty, Grow, Kv, LinkBtn, Note, Tag, Tile, Tiles } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { PAYMENT_LABEL, PAYMENT_TONE, plateOf, propertyName, renterName, spaceNumber } from '../lib/business/booking';
import { errorText, isAbort } from '../lib/business/ui';
import { dateTimeLocal, humanize, money } from '../lib/format';
import { usePoll } from '../lib/usePoll';
import { bookingService } from '../services/bookingService';
import { earningsService } from '../services/earningsService';
import type { Booking, EarningsSummary, OwnerStats } from '../types/business';
import '../styles/business.css';

/** What the backend holds about the owner's bank account (the KYC form's own keys, already camelCased). */
interface Bank {
  accountHolderName?: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
}

/** "•••• 1234": the account number is never shown whole. */
const maskAccount = (n?: string): string => {
  const digits = (n || '').replace(/\s/g, '');
  return digits ? `•••• ${digits.slice(-4)}` : '–';
};

const RECENT = 20;

/**
 * Payouts, as far as they are real. The backend has no payout endpoint and keeps no payout records (no schedule, status, reference or
 * fee), so this page shows only what is known: what has been earned, what is still waiting to be paid, the bank account on file, and
 * the completed bookings behind the money. Nothing here is a payout, a payout date or a fee.
 */
export default function Payouts() {
  const { owner } = useAuth();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [stats, setStats] = useState<OwnerStats | null>(null);
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ownerId = owner?.id;
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!ownerId) return;
      const [b, s, e] = await Promise.allSettled([
        bookingService.listAll(ownerId, signal),
        earningsService.stats(ownerId, signal),
        earningsService.summary(ownerId, signal),
      ]);
      if (b.status === 'fulfilled') setBookings(b.value);
      if (s.status === 'fulfilled') setStats(s.value);
      if (e.status === 'fulfilled') setSummary(e.value);
      const failed = [b, s, e].find((r): r is PromiseRejectedResult => r.status === 'rejected' && !isAbort(r.reason));
      setError(failed ? errorText(failed.reason, 'Could not load your earnings.') : null);
    },
    [ownerId],
  );
  usePoll(load, 60_000, [load]);

  const bank = (owner?.kycBank || null) as Bank | null;
  const hasBank = Boolean(bank && (bank.accountNumber || bank.bankName || bank.accountHolderName));
  const completed = useMemo(
    () => (bookings || []).filter((b) => b.status === 'completed').sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime()),
    [bookings],
  );
  const loading = !bookings && !error;

  return (
    <>
      <Note>
        {/* one element: a note lays its children out in a row, which would pull the link out of the sentence */}
        <span>
          Payouts are not automated yet. ParkFNB does not record payouts, so there is no payout history, schedule or fee to show here. What
          you have earned is below and on the <Link to="/earnings">Earnings</Link> page, as gross amounts.
        </span>
      </Note>
      {error && <Note tone="bad">{error}</Note>}

      <Tiles>
        <Tile tone="green" icon="rupee" label="Earned, all time" value={stats ? money(stats.totalRevenue) : loading ? '…' : '–'} sub="paid bookings, before any fee" />
        <Tile tone={summary && summary.pendingEarnings > 0 ? 'amber' : ''} icon="clock" label="Waiting to be paid" value={summary ? money(summary.pendingEarnings) : loading ? '…' : '–'} sub="confirmed or active bookings" />
        <Tile icon="check" label="Completed stays" value={stats ? stats.completedBookings : loading ? '…' : '–'} sub={stats ? `of ${stats.totalBookings} bookings` : ''} />
      </Tiles>

      <Card
        title="Bank account on file"
        right={<LinkBtn to="/profile">{hasBank ? 'Change in Profile & KYC' : 'Add in Profile & KYC'}</LinkBtn>}
      >
        {hasBank && bank ? (
          <Kv rows={[
            ['Account holder', bank.accountHolderName || '–'],
            ['Bank', bank.bankName || '–'],
            ['Account number', <span key="a" className="plate-text">{maskAccount(bank.accountNumber)}</span>],
            ['IFSC', bank.ifscCode ? <span key="i" className="plate-text">{bank.ifscCode}</span> : '–'],
            ['Verification', <Tag key="k" tone={owner?.kycStatus === 'verified' ? 'green' : owner?.kycStatus === 'rejected' ? 'red' : 'amber'}>{humanize(owner?.kycStatus)}</Tag>],
          ]} />
        ) : (
          <Empty>No bank account on file yet. Add one in Profile &amp; KYC.</Empty>
        )}
      </Card>

      <Card title="Completed bookings" right={completed.length > RECENT ? <small>latest {RECENT} of {completed.length}</small> : undefined} flush>
        {loading ? (
          <Empty>Loading…</Empty>
        ) : completed.length === 0 ? (
          <Empty>No completed bookings yet.</Empty>
        ) : (
          <div className="scroll">
            <table className="tbl as-cards">
              <thead>
                <tr><th>Ended</th><th>Booking</th><th>Renter</th><th>Space</th><th>Payment</th><th className="r">Amount</th></tr>
              </thead>
              <tbody>
                {completed.slice(0, RECENT).map((b) => (
                  <tr key={b.id}>
                    <td className="nowrap" data-label="Ended">{dateTimeLocal(b.checkOutTime || b.endTime)}</td>
                    <td data-label="Booking"><Link className="link" to={`/bookings/${b.id}`}>{b.bookingNumber}</Link></td>
                    <td data-label="Renter">
                      <span className="cell-main">{renterName(b)}</span>
                      {plateOf(b) && <span className="cell-sub plate-text">{plateOf(b)}</span>}
                    </td>
                    <td data-label="Space">{spaceNumber(b)}<span className="cell-sub">{propertyName(b)}</span></td>
                    <td data-label="Payment"><Tag tone={PAYMENT_TONE[b.paymentStatus]}>{PAYMENT_LABEL[b.paymentStatus] || humanize(b.paymentStatus)}</Tag></td>
                    <td className="r nowrap" data-label="Amount">{money(b.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Bar><Grow /><LinkBtn to="/earnings">See all earnings</LinkBtn></Bar>
    </>
  );
}
