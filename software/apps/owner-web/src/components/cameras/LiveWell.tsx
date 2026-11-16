import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import Icon from '../Icon';
import type { BayPlate } from './hooks';
import { bayLabel } from '../../lib/format';

/**
 * The black picture well of the live view, with the plate of each parked car written over it. The same markup as the shared CamWell
 * (the console's `.cam`), plus the plate layer, which CamWell has no place for.
 *
 * `src` is an object URL (the picture is fetched with the pass in a header). Each plate sits over its car: the car's box is in the
 * picture's own pixels (`frame_size`), scaled to however large the picture is drawn now (a narrow window, a collapsed menu, full
 * screen), so the labels follow the picture. Full screen fills the screen with the picture and `fsInfo` along its top.
 */
export interface LiveWellHandle {
  /** enter or leave full screen (the page's own button calls this; the F key does the same) */
  toggle: () => void;
}

const LiveWell = forwardRef<LiveWellHandle, {
  src: string | null;
  alt: string;
  shade?: string | null;
  fsInfo?: ReactNode;
  plates?: Record<string, BayPlate>;
}>(function LiveWell({ src, alt, shade, fsInfo, plates }, handle) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [full, setFull] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (el) setBox({ w: el.clientWidth, h: el.clientHeight });
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void ref.current?.requestFullscreen?.().catch(() => undefined);
  }, []);

  useImperativeHandle(handle, () => ({ toggle }), [toggle]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    const onFs = () => {
      setFull(document.fullscreenElement === el);
      window.setTimeout(measure, 150);
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey && t && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) toggle();
    };
    window.addEventListener('resize', measure);
    document.addEventListener('fullscreenchange', onFs);
    window.addEventListener('keydown', onKey);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      document.removeEventListener('fullscreenchange', onFs);
      window.removeEventListener('keydown', onKey);
      if (document.fullscreenElement === el) void document.exitFullscreen().catch(() => undefined);
    };
  }, [measure, toggle]);

  const tags = Object.entries(plates || {}).flatMap(([bay, p]) => {
    const a = p.arrival;
    if (!a.box || !a.frame_size || !box.w || !box.h) return [];
    const [fw, fh] = a.frame_size;
    const sc = Math.min(box.w / fw, box.h / fh);
    const offx = (box.w - fw * sc) / 2;
    const offy = (box.h - fh * sc) / 2;
    return [{
      bay,
      p,
      left: offx + (((a.box[0] + a.box[2]) / 2) * sc),
      top: offy + (((a.box[1] + a.box[3]) / 2) * sc),
    }];
  });

  return (
    <div className="cam" ref={ref}>
      {src ? <img src={src} alt={alt} onDoubleClick={toggle} onLoad={measure} /> : <div style={{ aspectRatio: '16 / 9' }} />}
      {shade ? <div className="shade">{shade}</div> : null}
      <div className="fsbar">{fsInfo}</div>
      <div className="plates">
        {tags.map(({ bay, p, left, top }) => (
          <div key={bay} className={`plate-tag${p.confirmed ? '' : ' guess'}`} style={{ left, top }}
            title={`${bayLabel(bay)} · ${p.confirmed ? 'plate confirmed' : 'one read so far, still checking'}`}>
            {p.text}
          </div>
        ))}
      </div>
      <button type="button" className="fsbtn" title={full ? 'Exit full screen (F or Esc)' : 'Full screen (F)'} aria-label="Full screen" onClick={toggle}>
        <Icon name="fullscreen" />
      </button>
    </div>
  );
});

export default LiveWell;
