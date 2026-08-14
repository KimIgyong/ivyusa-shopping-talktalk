import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { liveChatService, type ChatAttachment } from './live-chat.service';

/** Mirrors the server policy (PLN-260814 §5) so a doomed upload never leaves the browser. */
export const MAX_IMAGE_MB = 10;
export const MAX_FILE_MB = 20;
export const MAX_PER_MESSAGE = 5;
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const FILE_EXT = ['pdf', 'txt', 'csv', 'docx', 'xlsx'];

export interface PendingUpload {
  key: string;
  name: string;
  progress: number;
  error?: string;
  previewUrl?: string;
  attachment?: ChatAttachment;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/**
 * Agent-side upload tray (PLN-260814 S4). Same shape as the widget's hook, but
 * scoped to a conversation: the console uploads through the agent endpoint,
 * which checks tenant ownership of that conversation before storing anything.
 */
export function useAgentUpload(conversationId: string | null) {
  const { t } = useTranslation('livechat');
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const counter = useRef(0);

  const reject = useCallback(
    (file: File): string | null => {
      const ext = extensionOf(file.name);
      const isImage = IMAGE_EXT.includes(ext);
      if (!isImage && !FILE_EXT.includes(ext)) {
        return t('attachment.typeNotAllowed', { name: file.name });
      }
      const limitMb = isImage ? MAX_IMAGE_MB : MAX_FILE_MB;
      if (file.size > limitMb * 1024 * 1024) {
        return t('attachment.tooLarge', { name: file.name, limit: limitMb });
      }
      return null;
    },
    [t],
  );

  const add = useCallback(
    async (files: File[]): Promise<string | null> => {
      if (!conversationId || !files.length) return null;

      let firstError: string | null = null;
      const accepted: { key: string; file: File }[] = [];

      setPending((prev) => {
        const room = MAX_PER_MESSAGE - prev.length;
        if (room <= 0) {
          firstError = t('attachment.tooMany', { max: MAX_PER_MESSAGE });
          return prev;
        }
        const next = [...prev];
        for (const file of files.slice(0, room)) {
          const problem = reject(file);
          if (problem) {
            firstError = firstError ?? problem;
            continue;
          }
          const key = `up-${counter.current++}`;
          accepted.push({ key, file });
          next.push({
            key,
            name: file.name,
            progress: 0,
            previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
          });
        }
        if (files.length > room) {
          firstError = firstError ?? t('attachment.tooMany', { max: MAX_PER_MESSAGE });
        }
        return next;
      });

      await Promise.all(
        accepted.map(async ({ key, file }) => {
          try {
            const attachment = await liveChatService.uploadAttachment(
              conversationId,
              file,
              (percent) =>
                setPending((prev) =>
                  prev.map((p) => (p.key === key ? { ...p, progress: percent } : p)),
                ),
            );
            setPending((prev) =>
              prev.map((p) => (p.key === key ? { ...p, progress: 100, attachment } : p)),
            );
          } catch (e) {
            setPending((prev) =>
              prev.map((p) =>
                p.key === key
                  ? { ...p, error: (e as Error).message || t('attachment.uploadFailed', { name: p.name }) }
                  : p,
              ),
            );
          }
        }),
      );

      return firstError;
    },
    [conversationId, reject, t],
  );

  const remove = useCallback((key: string) => {
    setPending((prev) => {
      const gone = prev.find((p) => p.key === key);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((p) => p.key !== key);
    });
  }, []);

  const clear = useCallback(() => {
    setPending((prev) => {
      for (const p of prev) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      return [];
    });
  }, []);

  const ready = pending.filter((p) => p.attachment).map((p) => p.attachment as ChatAttachment);
  const busy = pending.some((p) => !p.attachment && !p.error);

  return { pending, add, remove, clear, ready, busy };
}
