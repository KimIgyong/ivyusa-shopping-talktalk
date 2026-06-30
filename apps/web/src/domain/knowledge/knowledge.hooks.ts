import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { knowledgeService } from './knowledge.service';
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

export function useToggleSource() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (vars: { id: string; enabled: boolean }) =>
      knowledgeService.toggleSource(vars.id, vars.enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge', tenantKey, 'sources'] });
      toast.success('Source updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDocuments() {
  const tenantKey = useTenantKey();
  return useQuery({
    queryKey: ['knowledge', tenantKey, 'documents'],
    queryFn: () => knowledgeService.documents(),
  });
}

export function useCreateDocument() {
  const qc = useQueryClient();
  const tenantKey = useTenantKey();
  return useMutation({
    mutationFn: (body: { title: string; sourceId?: string; content?: string }) =>
      knowledgeService.createDocument(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge', tenantKey, 'documents'] });
      toast.success('Document added');
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
