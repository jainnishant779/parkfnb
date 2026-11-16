/**
 * What the dashboard says needs the owner, worst first. Built from the same facts the rest of the page uses; nothing here is invented.
 * The camera items are the operator console's own (console.js `actionItems`), reworded for an owner, who cannot edit the bay layout or
 * touch the phone: where the console says "check the phone", this says "check the camera's power and Wi-Fi, or ask ParkFNB".
 */
import type { TodoItem } from '../../components/ui';
import type { OccupancyBucket } from '../../components/charts';
import { bayView, streamView, type LotState } from '../lot';
import { bayLabel } from '../format';
import type { KycStatus } from '../../types/api';

/** /owner/api/cameras/{id}/report, the parts the dashboard reads. */
export interface DayReport {
  coverage: number;
  occupancy: OccupancyBucket[];
  dwell: { n: number; avg_s: number | null };
  peak: { label: string; occupancy_pct: number } | null;
  cars_per_day: { date: string; cars: number }[];
}

interface Facts {
  state: LotState | null;
  /** there is at least one camera linked */
  hasCamera: boolean;
  kyc: KycStatus | null;
  kycReason?: string;
  pendingRequests: number;
  openViolations: number;
  goingOn: number;
}

export function actionItems(f: Facts): TodoItem[] {
  const items: TodoItem[] = [];

  if (f.kyc === 'rejected') {
    items.push({ lvl: 'red', glyph: '✕', title: 'Your identity verification was rejected', text: f.kycReason || 'Open your profile to see why and send it again.', to: '/profile', act: 'Profile' });
  } else if (f.kyc === 'submitted') {
    items.push({ lvl: 'amber', glyph: '…', title: 'Your identity verification is being reviewed', text: 'You can keep working while ParkFNB checks it.', to: '/profile', act: 'Status' });
  } else if (f.kyc && f.kyc !== 'verified') {
    items.push({ lvl: 'amber', glyph: '!', title: 'Finish your identity verification', text: 'Listings need a verified owner before they go live.', to: '/profile', act: 'Continue' });
  }

  if (f.pendingRequests > 0) {
    items.push({
      lvl: 'amber', glyph: '?', to: '/bookings', act: 'Review',
      title: `${f.pendingRequests} booking ${f.pendingRequests === 1 ? 'request' : 'requests'} waiting`,
      text: 'Approve or reject them so the renters know where they stand.',
    });
  }

  const s = f.state;
  if (f.hasCamera && s) {
    const st = streamView(s);
    const down = s.stream_status !== 'live' || Boolean(s.frozen);
    if (down) {
      items.push({
        lvl: 'red', glyph: '✕', to: '/cameras', act: 'Cameras',
        title: s.frozen ? 'The camera picture is frozen' : s.stream_status === 'not_started' ? 'No picture from the camera yet' : `The camera is ${st[0].toLowerCase()}`,
        text: "Check the camera's power and Wi-Fi, or ask ParkFNB.",
      });
    } else if (st[1] === 'warn') {
      items.push({ lvl: 'amber', glyph: '!', to: '/cameras', act: 'Cameras', title: `The camera is ${st[0].toLowerCase()}`, text: 'Pictures arrive late, so the numbers may lag.' });
    }
    if (s.calibration === 'moved') {
      items.push({ lvl: 'amber', glyph: '⚠', title: 'The camera view has changed', text: 'The bays may no longer line up with the picture. Ask ParkFNB to check the bay layout.' });
    }
    if (s.light === 'low') {
      items.push({ lvl: 'amber', glyph: '☾', title: 'Too dark to judge the bays', text: 'Empty bays show as unclear until there is more light.' });
    }
    if (!down) {
      const unclear: string[] = [];
      for (const slot of s.slots || []) {
        const v = bayView(slot);
        const name = bayLabel(slot.id);
        const to = `/live?bay=${encodeURIComponent(String(slot.id))}`;
        if (v.cls === 'taken') items.push({ lvl: 'red', glyph: '!', to, act: 'Open bay', title: `${name}: ${v.word.toLowerCase()}`, text: 'Speak to the driver, or open the bay to look at the picture.' });
        else if (v.word === 'Blocked') items.push({ lvl: 'amber', glyph: '⛔', to, act: 'Open bay', title: `${name} is blocked`, text: 'It is free, but a car lies across it.' });
        else if (v.cls === 'close') items.push({ lvl: 'amber', glyph: '~', to, act: 'Open bay', title: `${name}: close to the line`, text: 'Nothing to do yet; keep an eye on it.' });
        else if (v.cls === 'unclear') unclear.push(name);
      }
      if (unclear.length) {
        items.push({
          lvl: 'amber', glyph: '?', to: '/live', act: 'Live',
          title: unclear.length === 1 ? `${unclear[0]} is unclear` : `${unclear.length} bays are unclear`,
          text: `${unclear.length > 1 ? `${unclear.join(', ')}. ` : ''}The camera cannot tell.`,
        });
      }
    }
  }

  if (f.hasCamera && f.openViolations > 0) {
    items.push({
      lvl: f.goingOn ? 'red' : 'amber', glyph: '⚑', to: '/violations', act: 'Review',
      title: `${f.openViolations} ${f.openViolations === 1 ? 'violation' : 'violations'} to review`,
      text: f.goingOn
        ? `${f.goingOn} happening now${f.openViolations > f.goingOn ? `, ${f.openViolations - f.goingOn} already over` : ''}`
        : 'All already over: resolve or dismiss them.',
    });
  }

  const rank = { red: 0, amber: 1 } as const;
  return items.sort((a, b) => rank[a.lvl] - rank[b.lvl]);
}
