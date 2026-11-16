import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import BarrierCard from '../components/business/BarrierCard';
import { Btn, Card, Empty, Field, Note } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { errorText, isAbort, useFlash } from '../lib/business/ui';
import { usePoll } from '../lib/usePoll';
import { iotService } from '../services/iotService';
import type { Barrier, BarrierTelemetry, OwnerSpace } from '../types/business';
import '../styles/business.css';

const DEVICE_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * The owner's smart barriers: each one's live state and controls, and a form to link a barrier to a space. A barrier opens for a booking
 * (or a recognised plate) only when it is linked to that booking's space.
 */
export default function Barriers() {
  const { owner } = useAuth();
  const [devices, setDevices] = useState<Barrier[] | null>(null);
  const [spaces, setSpaces] = useState<OwnerSpace[]>([]);
  const [telemetry, setTelemetry] = useState<Record<string, BarrierTelemetry>>({});
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();

  const [deviceId, setDeviceId] = useState('');
  const [name, setName] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);

  const ownerId = owner?.id;

  /** The list of barriers and the owner's spaces (slow to change). */
  const loadList = useCallback(
    async (signal?: AbortSignal) => {
      if (!ownerId) return;
      const [d, s] = await Promise.allSettled([iotService.devices(signal), iotService.spaces(ownerId, signal)]);
      if (d.status === 'fulfilled') setDevices(d.value);
      if (s.status === 'fulfilled') setSpaces(s.value);
      const failed = [d, s].find((r): r is PromiseRejectedResult => r.status === 'rejected' && !isAbort(r.reason));
      setError(failed ? errorText(failed.reason, 'Could not load your barriers.') : null);
    },
    [ownerId],
  );
  usePoll(loadList, 30_000, [loadList]);

  /** What each barrier says now, every few seconds. */
  const ids = useMemo(() => (devices || []).map((d) => d.deviceId).join(','), [devices]);
  usePoll(
    async (signal) => {
      if (!ids) return;
      const results = await Promise.allSettled(ids.split(',').map((id) => iotService.telemetry(id, signal)));
      const next: Record<string, BarrierTelemetry> = {};
      results.forEach((r) => {
        if (r.status === 'fulfilled') next[r.value.deviceId] = r.value;
      });
      setTelemetry((prev) => ({ ...prev, ...next }));
    },
    5000,
    [ids],
  );

  const spaceLabel = useCallback(
    (b: Barrier): string => {
      const ref = b.parkingSpaceId;
      const id = typeof ref === 'string' ? ref : ref?.id;
      if (!id) return 'not linked';
      const s = spaces.find((x) => x.id === id);
      if (s) return `${s.spaceNumber} · ${s.propertyName}`;
      return typeof ref === 'object' && ref?.spaceNumber ? ref.spaceNumber : 'a space';
    },
    [spaces],
  );

  const brokerDown = Object.values(telemetry).some((t) => t.isBrokerConnected === false);

  const pair = async (e: FormEvent) => {
    e.preventDefault();
    const id = deviceId.trim();
    if (!DEVICE_ID_RE.test(id)) return setPairError('The device ID is on the barrier: letters, numbers, - and _ only.');
    if (!spaceId) return setPairError('Choose the space this barrier is for.');
    setPairing(true);
    setPairError(null);
    try {
      const res = await iotService.pair({ deviceId: id, name: name.trim() || undefined, parkingSpaceId: spaceId });
      setFlash(res.message || 'Barrier linked.');
      setDeviceId('');
      setName('');
      setSpaceId('');
      await loadList();
    } catch (err) {
      setPairError(errorText(err, 'Could not link the barrier.'));
    } finally {
      setPairing(false);
    }
  };

  const changed = (message: string) => {
    setFlash(message);
    void loadList();
  };

  // a space that already has a barrier can only be chosen for that same barrier
  const freeSpaces = spaces.filter((s) => !s.deviceId || s.deviceId === deviceId.trim());

  return (
    <>
      {flash && <Note>{flash}</Note>}
      {error && <Note tone="bad">{error}</Note>}
      {brokerDown && (
        <Note tone="warn">
          The server&apos;s connection to the barrier network (MQTT) is down. Open and close may not reach the barrier, and the state shown
          is the last one it reported.
        </Note>
      )}

      {!devices && !error ? (
        <Card><Empty>Loading barriers…</Empty></Card>
      ) : devices && devices.length === 0 ? (
        <Card title="Barriers">
          <Empty>No barriers yet. Link one below with the device ID printed on it.</Empty>
        </Card>
      ) : (
        (devices || []).map((b) => (
          <BarrierCard key={b.id} barrier={b} telemetry={telemetry[b.deviceId]} spaceLabel={spaceLabel(b)} onChanged={changed} />
        ))
      )}

      <Card title="Link a barrier to a space">
        {spaces.length === 0 ? (
          <Empty>You have no parking spaces yet. Add a property and a space first (<Link to="/properties">Properties &amp; spaces</Link>).</Empty>
        ) : (
          <form className="form" onSubmit={(e) => void pair(e)} noValidate>
            <div className="row">
              <Field label="Device ID" hint="Printed on the barrier, for example pb-001">
                <input type="text" value={deviceId} maxLength={40} autoCapitalize="none" spellCheck={false} onChange={(e) => setDeviceId(e.target.value)} />
              </Field>
              <Field label="Name (optional)">
                <input type="text" value={name} maxLength={60} placeholder="Gate barrier" onChange={(e) => setName(e.target.value)} />
              </Field>
            </div>
            <Field label="Space" hint="A barrier opens only for bookings of the space it is linked to">
              <select className="fld" value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
                <option value="">Choose a space…</option>
                {freeSpaces.map((s) => <option key={s.id} value={s.id}>{s.spaceNumber} · {s.propertyName}</option>)}
              </select>
            </Field>
            {pairError && <Note tone="bad">{pairError}</Note>}
            <div className="actions">
              <Btn variant="primary" type="submit" disabled={pairing}>{pairing ? 'Linking…' : 'Link barrier'}</Btn>
            </div>
          </form>
        )}
      </Card>
    </>
  );
}
