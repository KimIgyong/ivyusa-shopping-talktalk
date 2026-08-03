import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { knowledgeService } from './knowledge.service';
import type { DocumentListParams } from './knowledge.service';
import { toast } from '@/store/toast-store';
import { useTenantKey } from '@/lib/use-tenant-key';

export function useSources() {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['knowledge', tenantKey, 'sources'],
    queryFn: () => knowledgeService.sources(),
  });
}

export function useCreateSource() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (body: { name: string; type: string }) => knowledgeService.createSource(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge', tenantKey, 'sources'] });
      toast.success('Source added');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSetSourceStatus() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (vars: { id: string; status: 'active' | 'inactive' }) =>
      knowledgeService.setSourceStatus(vars.id, vars.status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge', tenantKey, 'sources'] });
      toast.success('Source updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDocuments(params: DocumentListParams) {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['knowledge', tenantKey, 'documents', params],
    queryFn: () => knowledgeService.documents(params),
    placeholderData: keepPreviousData,
  });
}

export function useDocument(id: string | null) {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['knowledge', tenantKey, 'document', id],
    queryFn: () => knowledgeService.document(id as string),
    enabled: id !== null,
  });
}

export function useCategories() {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['knowledge', tenantKey, 'categories'],
    queryFn: () => knowledgeService.categories(),
  });
}

/** Ask the KB a question. A mutation, not a query: it runs on demand only. */
export function useAskKnowledge() {
  return useMutation({
    mutationFn: (vars: { question: string; language: string }) =>
      knowledgeService.ask(vars.question, vars.language),
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useCreateDocument() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (body: { title: string; category: string; content: string; source_id?: number }) =>
      knowledgeService.createDocument(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge', tenantKey, 'documents'] });
      qc.invalidateQueries({ queryKey: ['knowledge', tenantKey, 'categories'] });
      toast.success('Document added');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateDocument() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      body: {
        title?: string;
        category?: string;
        content?: string;
        active?: number;
        source_url?: string | null;
        effective_from?: string | null;
        review_interval_days?: number | null;
      };
    }) => knowledgeService.updateDocument(vars.id, vars.body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['knowledge', tenantKey, 'documents'] });
      qc.invalidateQueries({ queryKey: ['knowledge', tenantKey, 'categories'] });
      qc.invalidateQueries({ queryKey: ['knowledge', tenantKey, 'document', vars.id] });
      toast.success('Document updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (id: string) => knowledgeService.deleteDocument(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge', tenantKey, 'documents'] });
      qc.invalidateQueries({ queryKey: ['knowledge', tenantKey, 'categories'] });
      toast.success('Document deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useMarkReviewed() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (id: string) => knowledgeService.markReviewed(id),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['knowledge', tenantKey, 'documents'] });
      qc.invalidateQueries({ queryKey: ['knowledge', tenantKey, 'document', id] });
      toast.success('Marked as reviewed');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

/** Conflict review queue (PLN S4). */
export function useConflicts(params: { status?: string; page: number; size: number }) {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['knowledge', tenantKey, 'conflicts', params],
    queryFn: () => knowledgeService.conflicts(params),
  });
}

export function useScanConflicts() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: () => knowledgeService.scanConflicts(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['knowledge', tenantKey, 'conflicts'] });
      // The count matters: "scan finished" with nothing found reads as a
      // failure otherwise.
      toast.success(`Scan complete — ${r.conflicts} conflict(s) from ${r.candidates} candidate pair(s)`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useResolveConflict() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (vars: { id: string; resolution: 'kept_a' | 'kept_b' | 'kept_both' }) =>
      knowledgeService.resolveConflict(vars.id, vars.resolution),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge', tenantKey, 'conflicts'] });
      // Resolving hides a document, so the list and category counts move too.
      qc.invalidateQueries({ queryKey: ['knowledge', tenantKey, 'documents'] });
      qc.invalidateQueries({ queryKey: ['knowledge', tenantKey, 'categories'] });
      toast.success('Conflict resolved');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDismissConflict() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (id: string) => knowledgeService.dismissConflict(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge', tenantKey, 'conflicts'] });
      toast.success('Dismissed');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
