import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api';

/** The words to show for a failed call: the backend's own message when there is one. */
export function errorText(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return e instanceof ApiError && e.message ? e.message : fallback;
}

/** A request cancelled because the page went away is not an error to show. */
export const isAbort = (e: unknown): boolean => e instanceof ApiError && e.code === 'ABORTED';

/** A short message ("Booking approved") that clears itself after a few seconds. */
export function useFlash(ms = 6000): [string | null, (message: string | null) => void] {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback(
    (m: string | null) => {
      window.clearTimeout(timer.current);
      setMessage(m);
      if (m) timer.current = window.setTimeout(() => setMessage(null), ms);
    },
    [ms],
  );
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [message, show];
}
