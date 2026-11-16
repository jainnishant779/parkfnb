import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { anprImageUrl } from '../../lib/anpr';
import { queued } from './imageQueue';

/**
 * A picture from the camera server. An <img> cannot send the pass (and a token in a URL would end up in logs and history, for number
 * plates), so it is fetched with the pass in a header and shown from an object URL, which is revoked the moment it is replaced or the
 * component goes. It loads when it comes into view, a few at a time (imageQueue).
 */
export default function AnprImage({ cameraId, path, query, alt, className, style, eager, placeholder }: {
  cameraId: string;
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  alt: string;
  className?: string;
  style?: CSSProperties;
  /** load now, not when scrolled into view */
  eager?: boolean;
  /** shown while loading and when there is no picture */
  placeholder?: (state: 'loading' | 'missing') => ReactNode;
}) {
  const holder = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(Boolean(eager));
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const queryKey = JSON.stringify(query || {});

  useEffect(() => {
    if (visible) return;
    const el = holder.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    let made: string | null = null;
    setState('loading');
    queued(() => anprImageUrl(cameraId, path, { query: JSON.parse(queryKey), signal: controller.signal }), controller.signal)
      .then((u) => {
        if (controller.signal.aborted) {
          if (u) URL.revokeObjectURL(u);
          return;
        }
        made = u;
        setUrl(u);
        setState(u ? 'ready' : 'missing');
      })
      .catch((e) => {
        if (!controller.signal.aborted && !(e instanceof DOMException)) setState('missing');
      });
    return () => {
      controller.abort();
      if (made) URL.revokeObjectURL(made);
      setUrl(null);
    };
  }, [visible, cameraId, path, queryKey]);

  if (state === 'ready' && url) return <img src={url} alt={alt} className={className} style={style} />;
  return (
    <span ref={holder} style={{ display: 'inline-block' }}>
      {placeholder ? placeholder(state === 'missing' ? 'missing' : 'loading') : null}
    </span>
  );
}
