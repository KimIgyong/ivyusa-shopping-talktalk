import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { uploadAttachment } from '../services/chatService';
import type { ChatAttachment } from '../lib/types';

/** Mirrors the server policy (PLN-260814 §5) so a doomed upload never leaves the browser. */
export const MAX_IMAGE_MB = 10;
export const MAX_FILE_MB = 20;
export const MAX_PER_MESSAGE = 5;
// heic/heif are what an iPhone actually produces; the server converts them to
// JPEG on the way in (PLN-260817), so nothing here has to decode anything.
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif'];
const FILE_EXT = ['pdf', 'txt', 'csv', 'doc', 'docx', 'xls', 'xlsx'];

export interface PendingUpload {
  /** Local id while in flight; replaced by the server's uuid once stored. */
  key: string;
  name: string;
  progress: number;
  error?: string;
  /** Object URL for an image preview — revoked when the entry is dropped. */
  previewUrl?: string;
  attachment?: ChatAttachment;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/**
 * "Upload failed" is the wrong thing to say when the bytes arrived and the
 * server could not read the photo — the shopper would retry the same file
 * forever. E5042/E5043 tell them what to do instead (PLN-260817 §4.2).
 */
function uploadErrorMessage(
  err: unknown,
  name: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const code = (err as { code?: string } | null)?.code;
  if (code === 'E5042') return t('chat.attachment.convertFailed', { name });
  if (code === 'E5043') return t('chat.attachment.tooManyPixels', { name });
  return t('chat.attachment.uploadFailed', { name });
}

/**
 * Client-side half of the upload flow. The server re-checks everything here —
 * this exists so the shopper hears "that file is too big" the instant they
 * pick it, instead of after pushing 30 MB up a phone connection.
 */
export function useAttachmentUpload(sessionToken: string | null) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingUpload[]>([]);
  /**
   * Synchronous mirror of `pending`. `add` used to fill its `accepted` list
   * inside the setState updater — which React 18 only runs eagerly while the
   * update queue is empty. Any other in-flight update deferred the updater to
   * render time, `accepted` stayed empty, and the upload silently never
   * started: the chip sat at 0% forever (found on-device, FIX-260828). All
   * mutations go through `apply` so decisions can be made on `pendingRef`
   * synchronously and the updater passed to React stays pure.
   */
  const pendingRef = useRef<PendingUpload[]>([]);
  const counter = useRef(0);

  const apply = useCallback((mutate: (prev: PendingUpload[]) => PendingUpload[]) => {
    pendingRef.current = mutate(pendingRef.current);
    setPending(pendingRef.current);
  }, []);

  const reject = useCallback(
    (file: File): string | null => {
      const ext = extensionOf(file.name);
      const isImage = IMAGE_EXT.includes(ext);
      if (!isImage && !FILE_EXT.includes(ext)) {
        return t('chat.attachment.typeNotAllowed', { name: file.name });
      }
      const limitMb = isImage ? MAX_IMAGE_MB : MAX_FILE_MB;
      if (file.size > limitMb * 1024 * 1024) {
        return t('chat.attachment.tooLarge', { name: file.name, limit: limitMb });
      }
      return null;
    },
    [t],
  );

  const add = useCallback(
    async (files: File[]): Promise<string | null> => {
      if (!sessionToken || !files.length) return null;

      // Decide everything against the synchronous mirror, then hand React a
      // pure append — see pendingRef above.
      let firstError: string | null = null;
      const accepted: { key: string; file: File }[] = [];
      const entries: PendingUpload[] = [];

      const room = MAX_PER_MESSAGE - pendingRef.current.length;
      if (room <= 0) {
        return t('chat.attachment.tooMany', { max: MAX_PER_MESSAGE });
      }
      for (const file of files.slice(0, room)) {
        const problem = reject(file);
        if (problem) {
          firstError = firstError ?? problem;
          continue;
        }
        const key = `up-${counter.current++}`;
        accepted.push({ key, file });
        entries.push({
          key,
          name: file.name,
          progress: 0,
          previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
        });
      }
      if (files.length > room) {
        firstError = firstError ?? t('chat.attachment.tooMany', { max: MAX_PER_MESSAGE });
      }
      apply((prev) => [...prev, ...entries]);

      await Promise.all(
        accepted.map(async ({ key, file }) => {
          try {
            const attachment = await uploadAttachment(sessionToken, file, (percent) =>
              apply((prev) =>
                prev.map((p) => (p.key === key ? { ...p, progress: percent } : p)),
              ),
            );
            apply((prev) =>
              prev.map((p) => (p.key === key ? { ...p, progress: 100, attachment } : p)),
            );
          } catch (err) {
            // Keep the row with an error rather than dropping it: the shopper
            // picked this file on purpose and deserves a retry, not a silent
            // disappearance (dev-kit §4.3).
            const message = uploadErrorMessage(err, file.name, t);
            apply((prev) =>
              prev.map((p) => (p.key === key ? { ...p, error: message } : p)),
            );
          }
        }),
      );

      return firstError;
    },
    [apply, reject, sessionToken, t],
  );

  const remove = useCallback(
    (key: string) => {
      apply((prev) => {
        const gone = prev.find((p) => p.key === key);
        if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
        return prev.filter((p) => p.key !== key);
      });
    },
    [apply],
  );

  const clear = useCallback(() => {
    apply((prev) => {
      for (const p of prev) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      return [];
    });
  }, [apply]);

  /** Only fully uploaded files can be sent; anything still in flight is not ready. */
  const ready = pending.filter((p) => p.attachment).map((p) => p.attachment as ChatAttachment);
  const busy = pending.some((p) => !p.attachment && !p.error);

  return { pending, add, remove, clear, ready, busy };
}
