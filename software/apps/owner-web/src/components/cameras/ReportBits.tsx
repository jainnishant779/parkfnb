import { Btn, Empty, Note } from '../ui';
import type { Dwell } from './types';
import { pct } from '../../lib/format';

/** The loading, failure and "try again" part every report-based page starts with. */
export function ReportState({ loading, error, onRetry, hasReport }: { loading: boolean; error: string | null; onRetry: () => void; hasReport: boolean }) {
  if (error) {
    return (
      <Note tone="bad">
        <span>{error}</span>{' '}
        <Btn onClick={onRetry}>Try again</Btn>
      </Note>
    );
  }
  if (loading && !hasReport) return <Empty>Loading…</Empty>;
  return null;
}

/** Bays the camera keeps losing and finding again: said plainly, so nobody reads their numbers as cars coming and going. */
export function UnstableNote({ dwell }: { dwell: Dwell }) {
  if (!dwell.unstable_bays.length) return null;
  const names = dwell.unstable_bays.map((b) => `${b.label} (${b.flickers} times)`).join(', ');
  return (
    <Note tone="warn">
      {names} kept changing between occupied and free for less than {Math.round(dwell.min_stay_s / 60)} minutes at a time. That is the camera losing
      and finding a car again (usually another car in front of it), not cars coming and going, so these short changes are not counted as cars
      or stays and the bay&apos;s own numbers are less certain.
    </Note>
  );
}

export const coverageText = (coverage: number): string => pct(coverage * 100);
