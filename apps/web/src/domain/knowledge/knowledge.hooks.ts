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

export function useCreateDocument() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (body: { title: string; category: string; content: string; source_id?: number }) =>
      knowledgeService.createDocument(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge', tenantKey, 'documents'] });
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
      body: { title?: string; category?: string; content?: string; active?: number };
    }) => knowledgeService.updateDocument(vars.id, vars.body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['knowledge', tenantKey, 'documents'] });
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
      toast.success('Document deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
