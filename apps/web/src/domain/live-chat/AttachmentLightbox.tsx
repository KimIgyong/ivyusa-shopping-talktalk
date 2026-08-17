import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Download, ExternalLink, X } from 'lucide-react';
import type { ChatAttachment } from './live-chat.service';
import { resolveFileUrl } from '@/lib/api-client';
import { formatBytes } from './MessageAttachments';

/**
 * Full-size preview of one image with arrow-key navigation across the images in
 * the same turn (PLN-260814 §6.2).
 *
 * Download is a plain link, not a fetch: the signed URL is already the
 * authorisation, and letting the browser handle it keeps the file out of the
 * console's memory.
 */
export function AttachmentLightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: ChatAttachment[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('livechat');
  const closeRef = useRef<HTMLButtonElement>(null);
  const current = images[index];

  const go = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next >= 0 && next < images.length) onIndexChange(next);
    },
    [index, images.length, onIndexChange],
  );

  useEffect(() => {
    // Focus the close button so the dialog is reachable by keyboard the moment
    // it opens, and Escape has something to act on.
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  if (!current) return null;
  const href = resolveFileUrl(current.url);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={current.filename}
      className="fixed inset-0 z-50 flex flex-col bg-black/85"
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-white">
        <div className="min-w-0 truncate">
          <span className="truncate font-medium">{current.filename}</span>
          <span className="ml-2 opacity-70">
            {formatBytes(current.size)}
            {current.width && current.height ? ` · ${current.width}×${current.height}` : ''}
          </span>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="rounded p-1 hover:bg-white/10"
          aria-label={t('attachment.close')}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        className="flex min-h-0 flex-1 items-center justify-between gap-2 px-2"
        // Clicks inside the image area must not fall through to the backdrop's
        // close handler — the agent is zooming in, not dismissing.
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index === 0}
          className="rounded-full p-2 text-white/80 hover:bg-white/10 disabled:invisible"
          aria-label={t('attachment.previous')}
        >
          <ChevronLeft className="h-7 w-7" />
        </button>
        <img
          src={href}
          alt={current.filename}
          className="max-h-full min-h-0 max-w-full object-contain"
        />
        <button
          type="button"
          onClick={() => go(1)}
          disabled={index === images.length - 1}
          className="rounded-full p-2 text-white/80 hover:bg-white/10 disabled:invisible"
          aria-label={t('attachment.next')}
        >
          <ChevronRight className="h-7 w-7" />
        </button>
      </div>

      <div
        className="flex items-center justify-center gap-4 px-4 py-4 text-sm text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {images.length > 1 && (
          <span className="opacity-70">
            {index + 1} / {images.length}
          </span>
        )}
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded border border-white/30 px-3 py-1.5 hover:bg-white/10"
        >
          <ExternalLink className="h-4 w-4" /> {t('attachment.openOriginal')}
        </a>
        <a
          href={href}
          download={current.filename}
          className="flex items-center gap-1.5 rounded border border-white/30 px-3 py-1.5 hover:bg-white/10"
        >
          <Download className="h-4 w-4" /> {t('attachment.download')}
        </a>
      </div>
    </div>
  );
}
