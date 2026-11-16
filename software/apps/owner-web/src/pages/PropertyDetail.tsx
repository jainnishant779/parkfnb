import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon';
import { Btn, Card, Empty, Kv, LinkBtn, Note, Tag } from '../components/ui';
import { ApiError } from '../lib/api';
import { money } from '../lib/format';
import { SpaceStatusTag } from '../components/listings/form';
import { SPACE_TYPES, stateLabel } from '../components/listings/constants';
import { mapsLink } from '../components/listings/geo';
import { fileUrl } from '../services/ownerService';
import { listingService, liveSpaces } from '../services/listingService';
import type { Property, Space } from '../types/listings';
import '../styles/listings.css';

/** One property: its details and photos, and its spaces with the quick actions (pause or resume bookings, edit, delete). */
const typeLabel = (v: string): string => SPACE_TYPES.find((t) => t.value === v)?.label || v;

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [property, setProperty] = useState<Property | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const [p, s] = await Promise.all([listingService.getProperty(id, signal), listingService.listSpaces(id, signal)]);
        setProperty(p);
        setSpaces(liveSpaces(s));
      } catch (e) {
        if (e instanceof ApiError && e.code === 'ABORTED') return;
        setError(e instanceof ApiError ? e.message : 'Could not load this property.');
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const toggle = async (s: Space) => {
    setBusy(s.id);
    setNotice(null);
    try {
      const updated = await listingService.setSpaceAvailable(s.id, !s.isAvailable);
      setSpaces((list) => list.map((x) => (x.id === s.id ? { ...x, isAvailable: updated.isAvailable, status: updated.status } : x)));
    } catch (e) {
      setNotice({ tone: 'bad', text: e instanceof ApiError ? e.message : 'Could not update the space.' });
    } finally {
      setBusy(null);
    }
  };

  const removeSpace = async (s: Space) => {
    if (!window.confirm(`Delete space ${s.spaceNumber}? Renters will no longer be able to book it.`)) return;
    setBusy(s.id);
    setNotice(null);
    try {
      await listingService.deleteSpace(s.id);
      setSpaces((list) => list.filter((x) => x.id !== s.id));
      setNotice({ tone: 'ok', text: `Space ${s.spaceNumber} was deleted.` });
    } catch (e) {
      setNotice({ tone: 'bad', text: e instanceof ApiError ? e.message : 'Could not delete the space.' });
    } finally {
      setBusy(null);
    }
  };

  const removeProperty = async () => {
    if (!property) return;
    if (spaces.length) {
      setNotice({ tone: 'bad', text: `This property still has ${spaces.length} space${spaces.length === 1 ? '' : 's'}. Delete ${spaces.length === 1 ? 'it' : 'them'} first.` });
      return;
    }
    if (!window.confirm(`Delete “${property.propertyName}”? This cannot be undone.`)) return;
    setBusy('property');
    try {
      await listingService.deleteProperty(property.id);
      navigate('/properties');
    } catch (e) {
      setNotice({ tone: 'bad', text: e instanceof ApiError ? e.message : 'Could not delete the property.' });
      setBusy(null);
    }
  };

  if (loading) return <Card><Empty>Loading the property…</Empty></Card>;
  if (error || !property) {
    return (
      <Card>
        <Note tone="bad">{error || 'Property not found.'}</Note>
        <div className="bar" style={{ marginTop: 16 }}>
          <Link className="btn" to="/properties">Back to properties</Link>
          <Btn onClick={() => void load()}>Try again</Btn>
        </div>
      </Card>
    );
  }

  return (
    <>
      <div className="page-head">
        <Link className="backlink" to="/properties">← All properties</Link>
        <span className="grow" />
        <LinkBtn to={`/properties/${property.id}/edit`}>Edit property</LinkBtn>
        <Btn variant="danger" onClick={() => void removeProperty()} disabled={busy === 'property'}>Delete</Btn>
      </div>

      {notice && <Note tone={notice.tone === 'bad' ? 'bad' : undefined}>{notice.text}</Note>}

      <Card title={property.propertyName} right={<Tag>{spaces.length} space{spaces.length === 1 ? '' : 's'}</Tag>}>
        <div className="vstack">
          {property.propertyImages?.length > 0 && (
            <div className="gallery">
              {property.propertyImages.map((u, i) => (
                <a className="thumb" key={`${u}-${i}`} href={fileUrl(u)} target="_blank" rel="noreferrer" title="Open full size">
                  <img src={fileUrl(u)} alt={`${property.propertyName}, photo ${i + 1}`} loading="lazy" />
                </a>
              ))}
            </div>
          )}
          <Kv rows={[
            ['Address', property.address],
            ['City', `${property.city}${property.state ? `, ${stateLabel(property.state)}` : ''} ${property.postalCode || ''}`.trim()],
            ['Map pin', <a key="pin" href={mapsLink(property.locationLat, property.locationLng)} target="_blank" rel="noreferrer">{property.locationLat}, {property.locationLng} (open in Maps)</a>],
            ['Getting in', property.accessInstructions || '–'],
          ]} />
        </div>
      </Card>

      <Card
        title="Spaces"
        flush
        right={<LinkBtn to={`/properties/${property.id}/spaces/new`} variant="primary"><Icon name="plus" />Add space</LinkBtn>}
      >
        {spaces.length === 0 ? (
          <Empty>No spaces yet. Add the first one so people can book it.</Empty>
        ) : (
          <div className="scroll">
            <table className="tbl">
              <thead>
                <tr><th>Space</th><th>Type</th><th>Size</th><th>Per hour</th><th>Booking</th><th>Status</th><th className="r">Actions</th></tr>
              </thead>
              <tbody>
                {spaces.map((s) => (
                  <tr key={s.id}>
                    <td><Link to={`/spaces/${s.id}`}><b>{s.spaceNumber}</b></Link></td>
                    <td>{typeLabel(s.spaceType)}</td>
                    <td className="num">{s.lengthMeters} × {s.widthMeters} m</td>
                    <td className="num">{money(s.pricePerHour)}</td>
                    <td>{s.bookingMode === 'request' ? 'On request' : s.bookingMode === 'both' ? 'Instant or request' : 'Instant'}</td>
                    <td>
                      <SpaceStatusTag space={s} />
                      {s.hasSmartBarrier && <> <Tag tone="blue">Barrier</Tag></>}
                    </td>
                    <td className="r">
                      <div className="bar" style={{ justifyContent: 'flex-end' }}>
                        <Btn onClick={() => void toggle(s)} disabled={busy === s.id}>{s.isAvailable ? 'Pause' : 'Resume'}</Btn>
                        <LinkBtn to={`/spaces/${s.id}/edit`}>Edit</LinkBtn>
                        <Btn variant="danger" onClick={() => void removeSpace(s)} disabled={busy === s.id}>Delete</Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
