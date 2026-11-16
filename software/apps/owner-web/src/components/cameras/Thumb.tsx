import { useState } from 'react';
import { Drawer } from '../ui';
import AnprImage from './AnprImage';
import '../../styles/cameras.css';

/**
 * A small picture from a camera that opens large when clicked (a lightbox in the console's drawer). The console opened these in a new
 * tab by their URL; here the picture needs the pass in a header, so it opens over the page instead.
 */
export default function Thumb({ cameraId, path, query, kind, alt, title }: {
  cameraId: string;
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  kind: 'car' | 'plate' | 'vio';
  alt: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="cam-thumb-btn" title="Open it full size" aria-label={`${alt}: open it full size`}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
        <AnprImage cameraId={cameraId} path={path} query={query} alt={alt} className={`cam-thumb ${kind}`}
          placeholder={(s) => <span className={`cam-ph ${kind}`}>{s === 'missing' ? 'no picture' : '…'}</span>} />
      </button>
      {open ? (
        <Drawer open title={title} onClose={() => setOpen(false)}>
          <AnprImage cameraId={cameraId} path={path} query={query} alt={alt} className="cam-full" eager
            placeholder={(s) => <span className="muted">{s === 'missing' ? 'No picture.' : 'Loading…'}</span>} />
        </Drawer>
      ) : null}
    </>
  );
}
