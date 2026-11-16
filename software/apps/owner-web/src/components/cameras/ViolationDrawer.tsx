import { useState } from 'react';
import { ApiError } from '../../lib/api';
import { anprJson } from '../../lib/anpr';
import { dateTimeOf, dur } from '../../lib/format';
import { Btn, Drawer, Kv } from '../ui';
import AnprImage from './AnprImage';
import type { Violation } from './types';
import '../../styles/cameras.css';

export const VIOLATION_TYPE: Record<string, string> = { over_line: 'Over the line', overstay: 'Overstay' };

/**
 * One violation: the picture kept with it, what was seen, and the owner's answer (resolved, dismissed or reopened) with a note.
 *
 * It holds a snapshot of the violation taken when it was opened, and the note is its own state, so the list refreshing underneath
 * every 30 s never empties a note being typed (the console's rule for anything a person types into).
 */
export default function ViolationDrawer({ cameraId, violation: v, onClose, onSaved }: {
  cameraId: string;
  violation: Violation;
  onClose: () => void;
  /** after a successful save, with the number of violations still open */
  onSaved: (openCount: number | undefined) => void;
}) {
  const [note, setNote] = useState(v.note || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const title = `${v.label} · ${VIOLATION_TYPE[v.type] || v.type}`;

  const save = async (status: 'open' | 'resolved' | 'dismissed', prefix = '') => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await anprJson<{ ok: boolean; open_count?: number }>(cameraId, `/violations/${encodeURIComponent(v.id)}`, {
        method: 'POST',
        body: { status, note: prefix + note },
      });
      onSaved(r?.open_count);
    } catch (e) {
      setMessage(`Could not save: ${e instanceof ApiError ? e.message : 'try again'}`);
      setBusy(false);
    }
  };

  return (
    <Drawer open title={title} onClose={onClose}>
      {v.evidence ? (
        <>
          <AnprImage cameraId={cameraId} path={`/evidence/${encodeURIComponent(v.id)}.jpg`} query={{ hq: v.evidence_hq ? 1 : 0 }}
            alt="Picture kept with this violation" className="cam-full" eager
            placeholder={(s) => <span className="muted">{s === 'missing' ? 'The picture is no longer kept.' : 'Loading the picture…'}</span>} />
          {!v.evidence_hq ? <small className="muted">A full-resolution photo is added when the camera sends the next one.</small> : null}
        </>
      ) : null}
      <Kv
        rows={[
          ['Car', v.plate ? v.plate + (v.plate_confirmed ? '' : ' (not confirmed)') : 'plate not read'],
          ['Status', v.status],
          ['Opened', dateTimeOf(v.opened)],
          ['Ended', v.closed ? dateTimeOf(v.closed) : 'still going'],
          ['Lasted', dur(v.duration_s)],
          ['What was seen', v.detail || '–'],
          ['Over by', v.max_crossing_m ? `${v.max_crossing_m.toFixed(2)} m${v.side ? ` (${v.side})` : ''}` : '–'],
          ['Reviewed by', v.handled_by ? `${v.handled_by.startsWith('owner:') ? 'you' : v.handled_by}, ${dateTimeOf(v.handled_at)}` : 'not yet'],
        ]}
      />
      <div className="cam-note-field">
        <label className="f">
          Note
          <textarea placeholder="A note: who you spoke to, what was done" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="bar">
          {v.status === 'open' ? (
            <>
              <Btn variant="primary" disabled={busy} onClick={() => void save('resolved')}
                title="The car really was over the line and you dealt with it.">Resolve: it was real</Btn>
              <Btn disabled={busy} onClick={() => void save('dismissed')} title="The system was wrong: nobody was over the line.">Dismiss: false alarm</Btn>
              {v.closed ? (
                <Btn disabled={busy} onClick={() => void save('resolved', 'Real, the car had already left. ')}
                  title="The car was really over the line, but it has gone.">Real, car already left</Btn>
              ) : null}
            </>
          ) : (
            <Btn disabled={busy} onClick={() => void save('open')}>Reopen</Btn>
          )}
        </div>
        {message ? <small className="muted" role="alert">{message}</small> : null}
      </div>
    </Drawer>
  );
}
