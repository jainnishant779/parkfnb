import { useState } from 'react';
import { dateTimeLocal, humanize } from '../../lib/format';
import { errorText } from '../../lib/business/ui';
import { iotService, type BarrierCommand } from '../../services/iotService';
import type { AccessLog, Barrier, BarrierTelemetry } from '../../types/business';
import { Btn, Card, Empty, Note, Tag, type Tone } from '../ui';
import ConfirmDialog from './ConfirmDialog';
import '../../styles/business.css';

const STATUS_TONE: Record<string, Tone> = { online: 'green', offline: '', error: 'red', maintenance: 'amber' };
const STATE_TONE: Record<string, Tone> = { secure: 'green', open: 'amber', moving: 'blue', fault: 'red' };

const LOG_ACTION: Record<string, string> = { unlock: 'Opened', lock: 'Closed', stop: 'Stopped', calibrate: 'Calibrated', fault: 'Fault', rejected: 'Entry refused' };

/** The arm as a little dial: 90 degrees is across the lane (secure), 0 is up (open). */
function Arm({ angle }: { angle: number }) {
  return (
    <svg className="arm" viewBox="0 0 64 64" role="img" aria-label={`Arm at ${Math.round(angle)} degrees`}>
      <circle cx="32" cy="32" r="30" />
      <line x1="32" y1="32" x2="58" y2="32" style={{ transform: `rotate(${angle - 90}deg)` }} />
      <circle className="hub" cx="32" cy="32" r="5" />
    </svg>
  );
}

/**
 * One barrier: its live state (polled by the page), the Open / Close / Stop controls, unlinking it from its space, and what has been
 * done with it. Open and close ask first, and a failed command is shown in the backend's own words.
 */
export default function BarrierCard({ barrier, telemetry, spaceLabel, onChanged }: {
  barrier: Barrier;
  telemetry?: BarrierTelemetry;
  spaceLabel: string;
  onChanged: (message: string) => void;
}) {
  const [confirm, setConfirm] = useState<'open' | 'close' | 'unpair' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [logs, setLogs] = useState<AccessLog[] | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  // the freshest word the page has: the poll, else the list
  const state = telemetry?.lastState || barrier.lastState || {};
  const status = telemetry?.status || barrier.status;
  const seen = telemetry?.lastSeenAt || barrier.lastSeenAt;
  const angle = typeof state.angle === 'number' ? state.angle : 90;

  const loadLogs = async () => {
    setLogError(null);
    try {
      setLogs(await iotService.logs(barrier.deviceId));
    } catch (e) {
      setLogError(errorText(e, 'Could not load the access log.'));
    }
  };

  const toggleLogs = () => {
    const next = !logsOpen;
    setLogsOpen(next);
    if (next) void loadLogs();
  };

  const send = async (command: BarrierCommand) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await iotService.command(barrier.deviceId, command);
      const via = res.result?.transport ? ` (sent over ${res.result.transport})` : '';
      setNotice(`${humanize(command)} command sent${via}.`);
      setConfirm(null);
      if (logsOpen) void loadLogs();
    } catch (e) {
      setError(errorText(e, 'The command did not go through.'));
    } finally {
      setBusy(false);
    }
  };

  const unpair = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await iotService.unpair(barrier.deviceId);
      setConfirm(null);
      onChanged(res.message || 'Barrier unlinked from its space.');
    } catch (e) {
      setError(errorText(e, 'Could not unlink the barrier.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="barrier-head">
        <Arm angle={angle} />
        <div className="grow">
          <div className="barrier-name">{barrier.name}</div>
          <div className="facts">
            <span className="plate-text">{barrier.deviceId}</span>
            <span>Space <b>{spaceLabel}</b></span>
          </div>
        </div>
        <Tag tone={STATUS_TONE[status] ?? ''}>{humanize(status)}</Tag>
        {state.state && <Tag tone={STATE_TONE[state.state] ?? ''}>{humanize(state.state)}</Tag>}
      </div>

      <div className="facts" style={{ marginTop: 16 }}>
        <span>Arm <b>{typeof state.angle === 'number' ? `${Math.round(state.angle)}°` : '–'}</b></span>
        <span>Signal <b>{typeof state.rssi === 'number' ? `${state.rssi} dBm` : '–'}</b></span>
        <span>Battery <b>{typeof state.batteryLevel === 'number' ? `${state.batteryLevel}%` : '–'}</b></span>
        <span>Firmware <b>{state.fwVersion || '–'}</b></span>
        <span>Last seen <b>{seen ? dateTimeLocal(seen) : 'never'}</b></span>
      </div>
      {state.faultReason && <div style={{ marginTop: 16 }}><Note tone="bad">Fault: {state.faultReason}</Note></div>}

      {error && !confirm && <div style={{ marginTop: 16 }}><Note tone="bad">{error}</Note></div>}
      {notice && <div style={{ marginTop: 16 }}><Note>{notice}</Note></div>}

      <div className="row-actions" style={{ marginTop: 16, justifyContent: 'flex-start' }}>
        <Btn variant="primary" disabled={busy} onClick={() => { setError(null); setConfirm('open'); }}>Open</Btn>
        <Btn disabled={busy} onClick={() => { setError(null); setConfirm('close'); }}>Close</Btn>
        <Btn disabled={busy} onClick={() => void send('stop')}>Stop</Btn>
        <span className="grow" style={{ flex: 1 }} />
        <Btn disabled={busy} onClick={toggleLogs}>{logsOpen ? 'Hide access log' : 'Access log'}</Btn>
        <Btn variant="danger" disabled={busy} onClick={() => { setError(null); setConfirm('unpair'); }}>Unlink</Btn>
      </div>

      {logsOpen && (
        <div style={{ marginTop: 16 }}>
          {logError ? (
            <Note tone="bad">{logError}</Note>
          ) : !logs ? (
            <Empty>Loading…</Empty>
          ) : logs.length === 0 ? (
            <Empty>Nothing has been done with this barrier yet.</Empty>
          ) : (
            <div className="scroll">
              <table className="tbl as-cards">
                <thead><tr><th>When</th><th>What</th><th>By</th><th>Result</th></tr></thead>
                <tbody>
                  {logs.slice(0, 20).map((l) => (
                    <tr key={l.id}>
                      <td className="nowrap" data-label="When">{dateTimeLocal(l.createdAt)}</td>
                      <td data-label="What">{LOG_ACTION[l.action] || humanize(l.action)}</td>
                      <td data-label="By">{humanize(l.userRole)}</td>
                      <td data-label="Result">
                        <Tag tone={l.success ? 'green' : 'red'}>{l.success ? 'Done' : 'Failed'}</Tag>
                        {l.errorMessage ? <span className="cell-sub">{l.errorMessage}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirm === 'open' || confirm === 'close'}
        title={confirm === 'open' ? 'Open the barrier?' : 'Close the barrier?'}
        confirmLabel={confirm === 'open' ? 'Open it' : 'Close it'}
        busy={busy}
        error={error}
        onConfirm={() => void send(confirm === 'close' ? 'close' : 'open')}
        onClose={() => setConfirm(null)}
      >
        This sends {confirm === 'open' ? 'an open' : 'a close'} command to {barrier.name} ({barrier.deviceId}) now. Make sure the lane is clear.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'unpair'}
        title="Unlink this barrier?"
        confirmLabel="Unlink"
        danger
        busy={busy}
        error={error}
        onConfirm={() => void unpair()}
        onClose={() => setConfirm(null)}
      >
        {barrier.name} stays registered to you but is no longer linked to {spaceLabel}, so bookings for that space will not open it. You can link it again below.
      </ConfirmDialog>
    </Card>
  );
}
