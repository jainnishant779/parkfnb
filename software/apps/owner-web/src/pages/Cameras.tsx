import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { failureText } from '../components/cameras/hooks';
import { Btn, Card, Drawer, Empty, Field, Note, Tag, type Tone } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useCamera } from '../context/CameraContext';
import { api, ApiError } from '../lib/api';
import { dateOf, dur } from '../lib/format';
import { streamView } from '../lib/lot';
import { cameraService, type LinkedCamera } from '../services/cameraService';
import '../styles/cameras.css';

/**
 * Cameras: the cameras that are yours, what each is doing, and how to add one.
 *
 * A camera appears here once ParkFNB links it to your property, or when you pair it yourself with the one-time code ParkFNB gave you.
 * You see only your own cameras, and only what they recorded since they became yours.
 */
export default function Cameras() {
  const { owner } = useAuth();
  const cam = useCamera();
  const navigate = useNavigate();
  const [linked, setLinked] = useState<LinkedCamera[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLinked(await cameraService.mine());
      setError(null);
    } catch (e) {
      setError(failureText(e, 'Could not load your cameras'));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const open = (id: string) => {
    cam.setCurrent(id);
    navigate('/live');
  };

  const unpair = async (l: LinkedCamera) => {
    if (!window.confirm(`Remove ${l.name || l.cameraId} from your account? You will stop seeing it here. ParkFNB can link it to you again.`)) return;
    setBusy(l.cameraId);
    setDone(null);
    try {
      await cameraService.unpair(l.cameraId);
      await Promise.all([reload(), cam.refresh()]);
      setDone(`${l.name || l.cameraId} was removed from your account.`);
    } catch (e) {
      setError(failureText(e, 'Could not remove the camera'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {done ? <Note>{done}</Note> : null}
      {error ? <Note tone="bad">{error}</Note> : null}
      <Card title="Your cameras" flush right={<Btn variant="primary" onClick={() => { setPairing(true); setDone(null); }}>Pair a camera</Btn>}>
        <div style={{ padding: '4px 24px 8px' }}>
          <small className="muted">
            A camera appears here once ParkFNB links it to your property, or when you pair it with the one-time code ParkFNB gave you.
          </small>
        </div>
        {linked === null ? (
          error ? null : <Empty>Loading…</Empty>
        ) : !linked.length ? (
          <Empty>No camera is linked to you yet. Ask ParkFNB to link one, or use “Pair a camera” if you have a code.</Empty>
        ) : (
          <div className="scroll">
            <table className="tbl">
              <thead>
                <tr><th>Camera</th><th>Property</th><th>Zone</th><th>Bays</th><th>Occupied</th><th>Available</th><th>Status</th><th>Picture</th><th>Linked</th><th /></tr>
              </thead>
              <tbody>
                {linked.map((l) => {
                  const c = cam.cameras.find((x) => x.id === l.cameraId);
                  const prop = l.propertyId && typeof l.propertyId === 'object' ? l.propertyId : null;
                  const on = l.status === 'active';
                  const [word, level] = c ? streamView({ stream_status: c.streamStatus, frozen: c.frozen, age_s: c.ageS, frame_age_s: c.frameAgeS }) : ['–', ''];
                  const tone: Tone = level === 'ok' ? 'green' : level === 'bad' ? 'red' : 'amber';
                  const sm = c?.slotSummary;
                  return (
                    <tr key={l.id} className={c ? 'click' : undefined} onClick={c ? () => open(c.id) : undefined}>
                      <td>
                        <b>{c?.label || l.name || l.cameraId}</b>
                        <br />
                        <small className="muted mono">{l.cameraId}</small>
                      </td>
                      <td>{prop ? `${prop.propertyName || ''}${prop.city ? `, ${prop.city}` : ''}` : '–'}</td>
                      <td>{c?.zone || '–'}</td>
                      <td className="num">{c ? c.bays || sm?.total || 0 : '–'}</td>
                      <td className="num">{sm?.occupied_confirmed === undefined ? '–' : sm.occupied_confirmed}</td>
                      <td className="num">{sm?.vacant === undefined ? '–' : sm.vacant}</td>
                      <td>
                        {!on ? <Tag tone="amber">switched off by ParkFNB</Tag> : c?.known ? <Tag tone={tone}>{word}</Tag> : <Tag>not heard from yet</Tag>}
                      </td>
                      <td>{c?.frameAgeS === null || c?.frameAgeS === undefined ? '–' : `${dur(c.frameAgeS)} ago`}</td>
                      <td>
                        {l.linkedVia === 'pairing' ? 'You paired it' : 'ParkFNB linked it'}
                        <br />
                        <small className="muted">{dateOf(l.linkedAt)}</small>
                      </td>
                      <td>
                        <Btn disabled={busy === l.cameraId} onClick={(e) => { e.stopPropagation(); void unpair(l); }}>Remove</Btn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {pairing ? (
        <PairDrawer
          ownerId={owner?.id}
          onClose={() => setPairing(false)}
          onPaired={async (name) => {
            setPairing(false);
            setDone(`${name} is now yours. It appears below once the camera server has heard from it.`);
            await Promise.all([reload(), cam.refresh()]);
          }}
        />
      ) : null}
    </>
  );
}

interface PropertyChoice {
  id: string;
  propertyName: string;
  city?: string;
}

/** Pair a camera: its ID, the one-time code and the property it is on. The server's own words are shown when it says no. */
function PairDrawer({ ownerId, onClose, onPaired }: { ownerId?: string; onClose: () => void; onPaired: (name: string) => Promise<void> }) {
  const [properties, setProperties] = useState<PropertyChoice[] | null>(null);
  const [cameraId, setCameraId] = useState('');
  const [code, setCode] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!ownerId) return;
    let live = true;
    api.get<{ properties: PropertyChoice[] }>(`/api/properties/owners/${ownerId}`, { query: { limit: 100, is_active: true } })
      .then((r) => {
        if (!live) return;
        const list = r?.properties || [];
        setProperties(list);
        if (list.length === 1) setPropertyId(list[0].id);
      })
      .catch((e) => live && setMessage(failureText(e, 'Could not load your properties')));
    return () => {
      live = false;
    };
  }, [ownerId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!cameraId.trim() || !code.trim() || !propertyId) {
      setMessage('Enter the camera ID, the code, and choose the property it is on.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const r = await cameraService.pair({ cameraId: cameraId.trim(), pairingCode: code.trim(), propertyId });
      await onPaired(r.name || r.cameraId);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Could not pair the camera. Please try again.');
      setBusy(false);
    }
  };

  return (
    <Drawer open title="Pair a camera" onClose={onClose}>
      <form className="form" onSubmit={(e) => void submit(e)} noValidate>
        <p className="help">Enter the camera ID and the one-time code ParkFNB gave you, and choose the property the camera is on.</p>
        <Field label="Camera ID">
          <input type="text" className="mono" value={cameraId} onChange={(e) => setCameraId(e.target.value)} placeholder="phone-1"
            maxLength={32} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </Field>
        <Field label="Pairing code" hint="Ten letters and digits, like abcde-fghjk. It works once.">
          <input type="text" className="mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder="xxxxx-xxxxx"
            maxLength={16} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" />
        </Field>
        <Field label="Property">
          <select className="fld" value={propertyId} onChange={(e) => setPropertyId(e.target.value)} disabled={properties === null}>
            <option value="">{properties === null ? 'Loading…' : properties.length ? 'Choose a property' : 'You have no property yet'}</option>
            {(properties || []).map((p) => <option key={p.id} value={p.id}>{p.propertyName}{p.city ? `, ${p.city}` : ''}</option>)}
          </select>
        </Field>
        {message ? <Note tone="bad">{message}</Note> : null}
        <div className="actions">
          <Btn onClick={onClose}>Cancel</Btn>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Pairing…' : 'Pair the camera'}</button>
        </div>
      </form>
    </Drawer>
  );
}
