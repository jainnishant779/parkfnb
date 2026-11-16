import { useState } from 'react';
import CameraPage from '../components/cameras/CameraPage';
import { PlateRead } from '../components/cameras/bits';
import { failureText, plateByBay, useArrivals } from '../components/cameras/hooks';
import Thumb from '../components/cameras/Thumb';
import type { Arrival, Vehicle } from '../components/cameras/types';
import { Card, Empty, Note, Seg, Tag, type Tone } from '../components/ui';
import type { CameraInfo } from '../context/CameraContext';
import { anprJson } from '../lib/anpr';
import { bayLabel, clockOf, dateTimeOf, dur } from '../lib/format';
import { bayView, type LotState } from '../lib/lot';
import { usePoll } from '../lib/usePoll';
import '../styles/cameras.css';

/**
 * Vehicles / ANPR: who has been here. The register of vehicles by number plate, the cars in the lot now, and every arrival with the
 * photo taken as the car parked and its plate. Read-only: the number plates are read by the system; nothing here changes them.
 */
export default function Vehicles() {
  return <CameraPage>{(camera) => <VehiclesView camera={camera} />}</CameraPage>;
}

const VERDICT: Record<string, [string, Tone]> = {
  readable: ['Big enough', 'green'],
  marginal: ['Borderline', 'amber'],
  unclear_photo: ['Dark or blurred', 'amber'],
};

function VehiclesView({ camera }: { camera: CameraInfo }) {
  const arrivals = useArrivals(camera.id, 60, 6000);
  const plates = plateByBay(arrivals.data?.arrivals);
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [vehiclesError, setVehiclesError] = useState<string | null>(null);
  const [confirmedOnly, setConfirmedOnly] = useState<'all' | 'confirmed'>('all');
  const [state, setState] = useState<LotState | null>(null);

  usePoll(
    async (signal) => {
      try {
        const r = await anprJson<{ vehicles: Vehicle[] }>(camera.id, '/vehicles', { query: { confirmed_only: confirmedOnly === 'confirmed' ? 1 : 0 }, signal });
        if (r) {
          setVehicles(r.vehicles);
          setVehiclesError(null);
        }
      } catch (e) {
        const text = failureText(e, 'Could not load the vehicles');
        if (text) setVehiclesError(text);
      }
    },
    8000,
    [camera.id, confirmedOnly],
  );

  usePoll(
    async (signal) => {
      try {
        const s = await anprJson<LotState>(camera.id, '/state', { signal });
        if (s) setState(s);
      } catch {
        // "Cars in the lot now" simply keeps what it has
      }
    },
    3000,
    [camera.id],
  );

  const cars = (state?.slots || []).filter((x) => x.status === 'OCCUPIED');

  return (
    <>
      <Card title="Number plates">
        <Note>
          Each car that parks gets a full-resolution photo; its plate is found, read by a small model and checked against the Indian plate format.
          A number is shown as confirmed only when two photos agree (or one is read with very high certainty); anything that is not a valid plate is
          dropped, never guessed. It works when the plate is about 20 px tall or more in the photo; from a far or very slanted view the plate stays unread.
        </Note>
      </Card>

      <Card title="Vehicles seen, by number plate" flush right={<Seg options={[{ value: 'all', label: 'All plates' }, { value: 'confirmed', label: 'Confirmed only' }]} value={confirmedOnly} onChange={setConfirmedOnly} />}>
        {vehiclesError ? <Note tone="bad">{vehiclesError}</Note> : null}
        {vehicles === null ? (
          vehiclesError ? null : <Empty>Loading…</Empty>
        ) : !vehicles.length ? (
          <Empty>No plate has been read yet. A car that parks gets its plate read from its photo.</Empty>
        ) : (
          <div className="scroll">
            <table className="tbl">
              <thead>
                <tr><th>Plate</th><th>Visits</th><th>First seen</th><th>Last seen</th><th>Time here</th><th>Bays</th><th>Now</th></tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.plate}>
                    <td>
                      <b className="cam-plate">{v.plate}</b>
                      {v.by_person ? <Tag tone="blue">checked by a person</Tag> : !v.confirmed ? <Tag tone="amber">unconfirmed</Tag> : null}
                    </td>
                    <td className="num">{v.visits}</td>
                    <td>{dateTimeOf(v.first_seen)}</td>
                    <td>{v.inside ? 'now' : dateTimeOf(v.last_seen)}</td>
                    <td className="num">{dur(v.total_s)}</td>
                    <td>{v.bays.map(bayLabel).join(', ')}</td>
                    <td>{v.inside ? <Tag tone="green">inside · {bayLabel(v.last_bay ?? '')}</Tag> : <Tag>left</Tag>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Cars in the lot now" flush>
        {!state ? (
          <Empty>Loading…</Empty>
        ) : !cars.length ? (
          <Empty>No parked cars in view.</Empty>
        ) : (
          <div className="scroll">
            <table className="tbl">
              <thead>
                <tr><th>Bay</th><th>Since</th><th>Parked for</th><th>Parking</th><th>Plate</th></tr>
              </thead>
              <tbody>
                {cars.map((x) => {
                  const v = bayView(x);
                  const known = plates[String(x.id)];
                  const since = x.since ? Date.parse(String(x.since)) / 1000 : NaN;
                  const verdict = (x.parking as { verdict?: string } | null | undefined)?.verdict;
                  return (
                    <tr key={x.id}>
                      <td>{bayLabel(x.id)}</td>
                      <td>{Number.isFinite(since) ? clockOf(since) : '–'}</td>
                      <td className="num">{dur(x.held_s as number | undefined)}</td>
                      <td><Tag tone={v.tag}>{v.word}</Tag>{verdict === 'not_judged' ? <Tag>not judged</Tag> : null}</td>
                      <td>
                        {known ? (
                          <>
                            <b className="cam-plate">{known.text}</b>
                            <Tag tone={known.confirmed ? 'green' : 'amber'}>{known.confirmed ? 'confirmed' : 'checking'}</Tag>
                          </>
                        ) : (
                          <Tag>not read yet</Tag>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Arrivals: a sharp photo of each car as it parked, and its number plate" flush>
        {arrivals.error ? <Note tone="bad">{arrivals.error}</Note> : null}
        {!arrivals.data ? (
          arrivals.error ? null : <Empty>Loading…</Empty>
        ) : !arrivals.data.enabled ? (
          <Empty>Arrival photos are switched off on the server.</Empty>
        ) : !arrivals.data.arrivals.length ? (
          <Empty>No car has parked since this camera was linked to you. The next one gets a photo.</Empty>
        ) : (
          <div className="scroll">
            <table className="tbl">
              <thead>
                <tr><th>Arrived</th><th>Bay</th><th>Car</th><th>Plate</th><th>Plate size</th><th>Read as</th><th>Left</th></tr>
              </thead>
              <tbody>
                {arrivals.data.arrivals.map((a) => <ArrivalRow key={a.id} camera={camera} a={a} />)}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function ArrivalRow({ camera, a }: { camera: CameraInfo; a: Arrival }) {
  const verdict = a.plate?.verdict;
  const [verdictWord, verdictTone] = (verdict && VERDICT[verdict]) || (a.plate ? ['Too small', 'red' as Tone] : ['', '' as Tone]);
  const size = a.plate_state === 'found' && a.plate ? `${a.plate.width_px} × ${a.plate.height_px} px (letters ~${a.plate.char_px})` : '–';
  return (
    <tr>
      <td>{dateTimeOf(a.arrived)}{a.initial ? ' (first seen)' : ''}</td>
      <td>{bayLabel(a.bay)}</td>
      <td>
        {a.car_photo ? (
          <Thumb cameraId={camera.id} path={`/arrivals/${encodeURIComponent(a.id)}.jpg`} query={{ kind: 'car' }} kind="car"
            alt="The car as it parked" title={`${bayLabel(a.bay)} · ${dateTimeOf(a.arrived)}`} />
        ) : (
          <Tag tone="amber">{a.plate_state === 'pending' ? 'waiting for the photo' : 'no photo'}</Tag>
        )}
      </td>
      <td>
        {a.plate_state === 'found' && a.plate ? (
          <>
            {a.plate_photo ? (
              <Thumb cameraId={camera.id} path={`/arrivals/${encodeURIComponent(a.id)}.jpg`} query={{ kind: 'plate' }} kind="plate"
                alt="The plate cut from the photo" title={`Plate · ${bayLabel(a.bay)}`} />
            ) : null}
            <Tag tone={verdictTone}>{verdictWord}</Tag>
          </>
        ) : a.plate_state && a.plate_state !== 'pending' ? (
          <Tag tone={a.plate_state === 'none_found' ? 'amber' : 'red'}>
            {({ none_found: 'no plate found', error: 'could not check' } as Record<string, string>)[a.plate_state] || a.plate_state}
          </Tag>
        ) : null}
      </td>
      <td className="num">{size}</td>
      <td className="num"><PlateRead arrival={a} /></td>
      <td>{a.left ? dateTimeOf(a.left) : 'still there'}</td>
    </tr>
  );
}
