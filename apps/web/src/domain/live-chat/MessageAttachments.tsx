import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FileText, Maximize2 } from 'lucide-react';
import type { ChatAttachment } from './live-chat.service';
import { resolveFileUrl } from '@/lib/api-client';
import { AttachmentLightbox } from './AttachmentLightbox';

/** 1.2 MB / 340 KB — sized for a chat bubble, not a file manager. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Files on one turn (PLN-260814 S2). Images become thumbnails that open a
 * lightbox; anything else becomes a card that downloads — a PDF opened inline
 * on our own origin is a needless risk, and the browser is a worse reader than
 * whatever the agent already uses.
 */
export function MessageAttachments({
  attachments,
  outbound,
}: {
  attachments: ChatAttachment[];
  outbound: boolean;
}) {
  const { t } = useTranslation('livechat');
  const [openAt, setOpenAt] = useState<number | null>(null);
  // Signed links expire and files can be disposed of by retention: a thumbnail
  // that fails to load says so, rather than leaving a broken-image glyph.
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  const images = attachments.filter((a) => a.kind === 'image');
  const files = attachments.filter((a) => a.kind !== 'image');

  return (
    <div className="mt-1 space-y-1.5">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {images.map((a, idx) =>
            broken[a.id] ? (
              <div
                key={a.id}
                className="flex h-28 w-28 items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 px-2 text-center text-[11px] text-gray-500"
              >
                {t('attachment.unavailable')}
              </div>
            ) : (
              <button
                key={a.id}
                type="button"
                onClick={() => setOpenAt(idx)}
                className="group relative overflow-hidden rounded-md border border-black/5 bg-white/40"
                aria-label={t('attachment.open', { name: a.filename })}
              >
                <img
                  // The thumbnail is a 320px webp; the original only loads when
                  // the agent actually opens it.
                  src={resolveFileUrl(a.thumbUrl || a.url)}
                  alt={a.filename}
                  loading="lazy"
                  className="h-28 w-28 object-cover transition group-hover:opacity-90"
                  onError={() => setBroken((prev) => ({ ...prev, [a.id]: true }))}
                />
                <span className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/30 text-white group-hover:flex">
                  <Maximize2 className="h-4 w-4" />
                </span>
              </button>
            ),
          )}
        </div>
      )}

      {files.map((a) => (
        <a
          key={a.id}
          href={resolveFileUrl(a.url)}
          target="_blank"
          rel="noopener noreferrer"
          className={
            outbound
              ? 'flex items-center gap-2 rounded-md bg-white/15 px-2 py-1.5 text-xs hover:bg-white/25'
              : 'flex items-center gap-2 rounded-md bg-white px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50'
          }
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{a.filename}</span>
          <span className="shrink-0 opacity-70">{formatBytes(a.size)}</span>
          <Download className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </a>
      ))}

      {openAt !== null && images[openAt] && (
        <AttachmentLightbox
          images={images}
          index={openAt}
          onIndexChange={setOpenAt}
          onClose={() => setOpenAt(null)}
        />
      )}
    </div>
  );
}
