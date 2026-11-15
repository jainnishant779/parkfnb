import { useState } from 'react';
import { FileText, ImageOff, ExternalLink } from 'lucide-react';
import { API_BASE_URL } from '../../lib/api';

/**
 * The backend stores upload URLs as host-relative paths ('/uploads/xxx.jpg')
 * and serves them from the API host root — not under /api — so we join them
 * onto the API origin rather than the panel's own origin.
 */
export const documentUrl = (path: string): string =>
  /^https?:\/\//i.test(path) ? path : `${API_BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

/**
 * An <img> cannot render a PDF, and a PDF uploaded as an ID scan or an address
 * proof is common. Detect it from the path so those become a link instead of a
 * permanently broken image. The query string is stripped first so a signed URL
 * does not hide the extension.
 */
const isPdf = (path: string): boolean => /\.pdf$/i.test(path.split(/[?#]/)[0]);

interface KycDocumentProps {
  label: string;
  /** Undefined when the owner never uploaded this document. */
  path?: string;
}

export default function KycDocument({ label, path }: KycDocumentProps) {
  // Set by the <img> onError handler. Uploads are written to the host's local
  // disk, which Render wipes on every deploy, so a URL that is present in the
  // database very often 404s. An admin must see that as a stated fact rather
  // than as a blank box they might read as "nothing was required here".
  const [failed, setFailed] = useState(false);

  if (!path) {
    return (
      <Frame label={label}>
        <div className="flex h-full flex-col items-center justify-center gap-1.5 text-slate-400">
          <ImageOff className="h-5 w-5" strokeWidth={1.75} />
          <span className="text-xs">Not uploaded</span>
        </div>
      </Frame>
    );
  }

  const href = documentUrl(path);

  if (isPdf(path)) {
    return (
      <Frame label={label}>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="flex h-full flex-col items-center justify-center gap-1.5 text-teal transition hover:bg-mint"
        >
          <FileText className="h-5 w-5" strokeWidth={1.75} />
          <span className="inline-flex items-center gap-1 text-xs font-medium">
            Open PDF <ExternalLink className="h-3 w-3" />
          </span>
        </a>
      </Frame>
    );
  }

  if (failed) {
    return (
      <Frame label={label}>
        <div className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center">
          <ImageOff className="h-5 w-5 text-red-500" strokeWidth={1.75} />
          <span className="text-xs font-medium text-red-600">Document unavailable</span>
          <span className="text-[11px] leading-tight text-slate-400">File missing on server</span>
        </div>
      </Frame>
    );
  }

  return (
    <Frame label={label}>
      {/* Opens the full-size original in a new tab; the thumbnail is only a preview. */}
      <a href={href} target="_blank" rel="noreferrer" className="block h-full w-full">
        <img
          src={href}
          alt={label}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition hover:opacity-90"
        />
      </a>
    </Frame>
  );
}

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="h-32 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {children}
      </div>
      <p className="mt-1.5 text-xs font-medium text-slate-600">{label}</p>
    </div>
  );
}
