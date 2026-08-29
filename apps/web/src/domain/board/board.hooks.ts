import { useTranslation } from 'react-i18next';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { boardService } from './board.service';
import type { BoardDocumentInput, BoardListParams } from './board.service';
import { toast } from '@/store/toast-store';
import { useTenantKey } from '@/lib/use-tenant-key';

export function useBoardDocuments(params: BoardListParams) {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['board', tenantKey, 'documents', params],
    queryFn: () => boardService.documents(params),
    placeholderData: keepPreviousData,
  });
}

export function useBoardCategoryCounts() {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['board', tenantKey, 'category-counts'],
    queryFn: () => boardService.categoryCounts(),
  });
}

export function useBoardDocument(id: string | null) {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['board', tenantKey, 'document', id],
    queryFn: () => boardService.document(id!),
    enabled: id !== null,
  });
}

function useBoardInvalidator() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: ['board', tenantKey, 'documents'] });
    void qc.invalidateQueries({ queryKey: ['board', tenantKey, 'category-counts'] });
    if (id) void qc.invalidateQueries({ queryKey: ['board', tenantKey, 'document', id] });
  };
}

export function useCreateBoardDocument() {
  const invalidate = useBoardInvalidator();
  const { t } = useTranslation('board');
  return useMutation({
    mutationFn: (body: BoardDocumentInput) => boardService.create(body),
    onSuccess: () => {
      invalidate();
      toast.success(t('saved'));
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateBoardDocument() {
  const invalidate = useBoardInvalidator();
  const { t } = useTranslation('board');
  return useMutation({
    mutationFn: (v: { id: string; body: Partial<BoardDocumentInput> }) =>
      boardService.update(v.id, v.body),
    onSuccess: (_r, v) => {
      invalidate(v.id);
      toast.success(t('saved'));
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteBoardDocument() {
  const invalidate = useBoardInvalidator();
  const { t } = useTranslation('board');
  return useMutation({
    mutationFn: (id: string) => boardService.remove(id),
    onSuccess: () => {
      invalidate();
      toast.success(t('deleted'));
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useBoardRevisions(id: string | null) {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['board', tenantKey, 'revisions', id],
    queryFn: () => boardService.revisions(id!),
    enabled: id !== null,
  });
}

export function useRestoreBoardRevision() {
  const invalidate = useBoardInvalidator();
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  const { t } = useTranslation('board');
  return useMutation({
    mutationFn: (v: { id: string; revisionId: string }) =>
      boardService.restore(v.id, v.revisionId),
    onSuccess: (_r, v) => {
      invalidate(v.id);
      void qc.invalidateQueries({ queryKey: ['board', tenantKey, 'revisions', v.id] });
      toast.success(t('restored'));
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUploadBoardAttachments() {
  const invalidate = useBoardInvalidator();
  const { t } = useTranslation('board');
  return useMutation({
    mutationFn: (v: { id: string; files: File[] }) => boardService.upload(v.id, v.files),
    onSuccess: (r, v) => {
      invalidate(v.id);
      toast.success(t('attachmentsAdded', { count: r.length }));
    },
    onError: (err: Error & { code?: string }) => {
      const known = err.code && ['E5071', 'E5072'].includes(err.code);
      toast.error(known ? t(`attachError.${err.code}`) : err.message);
    },
  });
}

export function useAddBoardLink() {
  const invalidate = useBoardInvalidator();
  const { t } = useTranslation('board');
  return useMutation({
    mutationFn: (v: { id: string; url: string; label?: string }) =>
      boardService.addLink(v.id, v.url, v.label),
    onSuccess: (_r, v) => {
      invalidate(v.id);
      toast.success(t('linkAdded'));
    },
    onError: (err: Error & { code?: string }) =>
      toast.error(err.code === 'E5073' ? t('attachError.E5073') : err.message),
  });
}

export function useRemoveBoardAttachment() {
  const invalidate = useBoardInvalidator();
  const { t } = useTranslation('board');
  return useMutation({
    mutationFn: (v: { attachmentId: string; documentId: string }) =>
      boardService.removeAttachment(v.attachmentId),
    onSuccess: (_r, v) => {
      invalidate(v.documentId);
      toast.success(t('attachmentRemoved'));
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
