import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/api';
import { anprBlob, anprJson } from '../../lib/anpr';
import { usePoll } from '../../lib/usePoll';
import type { Arrival, ArrivalsResponse } from './types';

/** The words for a failed request: the server's own, else a plain fallback. An aborted request (page left) is no error at all. */
export function failureText(e: unknown, fallback: string): string | null {
  if (e instanceof ApiError) return e.code === 'ABORTED' ? null : e.message;
  return fallback;
}

/** The camera's recent arrivals (newest first), refreshed every `ms`. */
export function useArrivals(cameraId: string, limit = 40, ms = 5000): { data: ArrivalsResponse | null; error: string | null } {
  const [data, setData] = useState<ArrivalsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  usePoll(
    async (signal) => {
      try {
        const r = await anprJson<ArrivalsResponse>(cameraId, '/arrivals', { query: { limit }, signal });
        if (r) {
          setData(r);
          setError(null);
        }
      } catch (e) {
        const text = failureText(e, 'Could not load the arrivals');
        if (text) setError(text);
      }
    },
    ms,
    [cameraId, limit],
  );
  return { data, error };
}

export interface BayPlate {
  arrival: Arrival;
  /** what to show: the plate, or the system's guess with a "?" */
  text: string;
  confirmed: boolean;
}

/** The car in each bay now: the newest arrival there that has not left and has a plate (or a guess). */
export function plateByBay(arrivals: Arrival[] | undefined): Record<string, BayPlate> {
  const out: Record<string, BayPlate> = {};
  for (const a of arrivals || []) {
    if (a.left || !(a.text || a.guess) || out[a.bay]) continue; // newest first: the first one found is the car there now
    out[a.bay] = { arrival: a, text: a.text || `${a.guess} ?`, confirmed: Boolean(a.confirmed) };
  }
  return out;
}

/**
 * The live picture, as an object URL. Polls frame.jpg with ?after=<the last frame number>, so the server answers 204 (nothing new)
 * until there is one, and the page keeps the picture it has on a 204, a 429 (a second tab asked a moment ago) or a failure. The previous
 * URL is revoked when it is replaced and the last one when the page goes.
 */
export function useLiveFrame(cameraId: string, ms = 1500): { url: string | null; seq: number | null; error: string | null } {
  const [url, setUrl] = useState<string | null>(null);
  const [seq, setSeq] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef<number | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    },
    [],
  );

  usePoll(
    async (signal) => {
      try {
        const r = await anprBlob(cameraId, '/frame.jpg', { query: { after: seqRef.current }, signal });
        setError(null);
        if (r.seq !== null) {
          seqRef.current = r.seq;
          setSeq(r.seq);
        }
        if (!r.blob) return; // 204 or 429: nothing new
        const next = URL.createObjectURL(r.blob);
        const prev = urlRef.current;
        urlRef.current = next;
        setUrl(next);
        if (prev) URL.revokeObjectURL(prev);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return; // no picture yet
        const text = failureText(e, 'Could not load the picture');
        if (text) setError(text);
      }
    },
    ms,
    [cameraId],
  );

  return { url, seq, error };
}
