import { useEffect, useRef } from 'react';

/**
 * Run `fn` now and then every `ms` milliseconds until the component goes away. The console's rule, kept: every page stops what it
 * started when it leaves (no leftover timers or requests), and a repaint never overlaps the one before it.
 *
 * Waits while the browser tab is hidden (a hidden tab is throttled anyway, and polling it only costs the server), and runs again
 * the moment the tab is shown. `fn` receives a signal that is aborted on unmount. Errors are for `fn` to handle: whatever escapes is
 * ignored here so one failed poll never stops the next.
 */
export function usePoll(fn: (signal: AbortSignal) => Promise<void> | void, ms: number, deps: unknown[] = []): void {
  const latest = useRef(fn);
  latest.current = fn;

  useEffect(() => {
    let stopped = false;
    let busy = false;
    let timer: number | undefined;
    const controller = new AbortController();

    const schedule = () => {
      if (!stopped) timer = window.setTimeout(tick, ms);
    };
    const tick = async () => {
      if (stopped || busy) return;
      if (document.hidden) {
        schedule();
        return;
      }
      busy = true;
      try {
        await latest.current(controller.signal);
      } catch {
        // the page's own handler reports it
      } finally {
        busy = false;
        schedule();
      }
    };
    const onVisible = () => {
      if (!document.hidden && !busy && !stopped) {
        window.clearTimeout(timer);
        void tick();
      }
    };

    void tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      controller.abort();
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps]);
}
