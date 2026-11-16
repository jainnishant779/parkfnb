/**
 * At most a few pictures are fetched at once: a page with fifty thumbnails would otherwise open fifty requests together, each carrying
 * the pass, against a small server that is also reading live frames. Each waits its turn; one that scrolled away or whose page was
 * left before its turn never starts.
 */
const MAX_AT_ONCE = 4;
let running = 0;
const waiting: (() => void)[] = [];

function next(): void {
  while (running < MAX_AT_ONCE && waiting.length) {
    running += 1;
    waiting.shift()!();
  }
}

export function queued<T>(job: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let started = false;
    const start = () => {
      started = true;
      if (signal?.aborted) {
        running -= 1;
        next();
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      job()
        .then(resolve, reject)
        .finally(() => {
          running -= 1;
          next();
        });
    };
    signal?.addEventListener(
      'abort',
      () => {
        if (started) return;
        const at = waiting.indexOf(start);
        if (at >= 0) waiting.splice(at, 1);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
    waiting.push(start);
    next();
  });
}
