import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import { Btn, Card, Empty, LinkBtn, Note, Tag } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { stateLabel } from '../components/listings/constants';
import { fileUrl } from '../services/ownerService';
import { listingService, liveSpaces } from '../services/listingService';
import type { Property } from '../types/listings';
import '../styles/listings.css';

/**
 * The owner's properties: a card each with its cover photo, address and how many spaces it has. View, edit or delete from the card. A property
 * can only be deleted once its spaces are gone: the backend marks the property inactive but leaves its spaces untouched, which would leave
 * bookable spaces on a property nobody can see.
 */
export default function Properties() {
  const { owner } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!owner) return;
      setLoading(true);
      setError(null);
      try {
        const list = await listingService.listProperties(owner.id, signal);
        setProperties(list);
        setLoading(false);
        // The list's own count includes spaces that were deleted, so count the live ones.
        const results = await Promise.allSettled(list.map((p) => listingService.listSpaces(p.id, signal)));
        const next: Record<string, number> = {};
        results.forEach((r, i) => {
          next[list[i].id] = r.status === 'fulfilled' ? liveSpaces(r.value).length : list[i].totalSpaces ?? 0;
        });
        setCounts(next);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'ABORTED') return;
        setError(e instanceof ApiError ? e.message : 'Could not load your properties.');
        setLoading(false);
      }
    },
    [owner],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return properties;
    return properties.filter((p) => `${p.propertyName} ${p.address} ${p.city} ${stateLabel(p.state)}`.toLowerCase().includes(q));
  }, [properties, search]);

  const remove = async (p: Property) => {
    setNotice(null);
    setBusyId(p.id);
    try {
      const spaces = liveSpaces(await listingService.listSpaces(p.id));
      if (spaces.length) {
        setNotice({ tone: 'bad', text: `“${p.propertyName}” still has ${spaces.length} space${spaces.length === 1 ? '' : 's'}. Delete ${spaces.length === 1 ? 'it' : 'them'} first, then delete the property.` });
        return;
      }
      if (!window.confirm(`Delete “${p.propertyName}”? This cannot be undone.`)) return;
      await listingService.deleteProperty(p.id);
      setProperties((list) => list.filter((x) => x.id !== p.id));
      setNotice({ tone: 'ok', text: `“${p.propertyName}” was deleted.` });
    } catch (e) {
      setNotice({ tone: 'bad', text: e instanceof ApiError ? e.message : 'Could not delete the property.' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="bar">
        <input type="search" placeholder="Search properties" aria-label="Search properties" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 220 }} />
        <span className="grow" />
        <LinkBtn to="/properties/new" variant="primary"><Icon name="plus" />Add property</LinkBtn>
      </div>

      {notice && <Note tone={notice.tone === 'bad' ? 'bad' : undefined}>{notice.text}</Note>}

      {loading ? (
        <Card><Empty>Loading your properties…</Empty></Card>
      ) : error ? (
        <Card>
          <Note tone="bad">{error}</Note>
          <div className="bar" style={{ marginTop: 16 }}><Btn onClick={() => void load()}>Try again</Btn></div>
        </Card>
      ) : properties.length === 0 ? (
        <Card title="No properties yet">
          <Empty>Add your first property, then add the spaces people can book.</Empty>
          <div className="bar" style={{ justifyContent: 'center' }}><LinkBtn to="/properties/new" variant="primary">Add a property</LinkBtn></div>
        </Card>
      ) : shown.length === 0 ? (
        <Card><Empty>No property matches “{search}”.</Empty></Card>
      ) : (
        <div className="pcards">
          {shown.map((p) => {
            const n = counts[p.id];
            return (
              <article className="pcard" key={p.id}>
                <Link className="cover" to={`/properties/${p.id}`} aria-label={`Open ${p.propertyName}`}>
                  {p.propertyImages?.[0] ? <img src={fileUrl(p.propertyImages[0])} alt="" loading="lazy" /> : <Icon name="building" />}
                </Link>
                <div className="info">
                  <h3 title={p.propertyName}>{p.propertyName}</h3>
                  <div className="addr" title={p.address}>{p.address}</div>
                  <div className="meta">
                    <Tag>{p.city}{p.state ? `, ${stateLabel(p.state)}` : ''}</Tag>
                    <Tag tone={n === 0 ? 'amber' : 'blue'}>{n === undefined ? '…' : `${n} space${n === 1 ? '' : 's'}`}</Tag>
                  </div>
                </div>
                <div className="acts">
                  <LinkBtn to={`/properties/${p.id}`}>Open</LinkBtn>
                  <LinkBtn to={`/properties/${p.id}/edit`}>Edit</LinkBtn>
                  <Btn variant="danger" onClick={() => void remove(p)} disabled={busyId === p.id}>{busyId === p.id ? 'Checking…' : 'Delete'}</Btn>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
