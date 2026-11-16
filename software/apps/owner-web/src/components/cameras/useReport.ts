import { useCallback, useEffect, useRef, useState } from 'react';
import { anprJson } from '../../lib/anpr';
import { failureText } from './hooks';
import type { Range } from './RangeBar';
import type { Report } from './types';

/**
 * The report for a range of whole days (the lot's days). Loaded when the range changes and on `reload`, never polled: building a
 * report reads days of log lines on a small server, so the owner API builds one at a time (a busy answer is shown as it is, with a
 * way to try again), allows at most 31 days, and starts no earlier than the day the owner got the camera.
 */
export function useReport(cameraId: string, range: Range): { report: Report | null; error: string | null; loading: boolean; reload: () => void } {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);

  const load = useCallback(() => {
    const mine = ++latest.current; // an older range's slow answer must not paint over a newer one
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    anprJson<Report>(cameraId, '/report', { query: { from: range.from, to: range.to }, signal: controller.signal })
      .then((r) => {
        if (mine !== latest.current) return;
        setReport(r);
        setLoading(false);
      })
      .catch((e) => {
        if (mine !== latest.current) return;
        const text = failureText(e, 'Could not load the report');
        if (text) {
          setReport(null);
          setError(text);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [cameraId, range.from, range.to]);

  useEffect(() => load(), [load]);

  return { report, error, loading, reload: () => { load(); } };
}
