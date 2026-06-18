import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { knowledgeService } from './knowledge.service';
import { toast } from '@/store/toast-store';

export function useSources() {
  return useQuery({
    queryKey: ['knowledge', 'sources'],
    queryFn: () => knowledgeService.sources(),
  });
}

export function useCreateSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; type: string }) => knowledgeService.createSource(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge', 'sources'] });
      toast.success('Source added');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useToggleSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; enabled: boolean }) =>
      knowledgeService.toggleSource(vars.id, vars.enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge', 'sources'] });
      toast.success('Source updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDocuments() {
  return useQuery({
    queryKey: ['knowledge', 'documents'],
    queryFn: () => knowledgeService.documents(),
  });
}

export function useCreateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; sourceId?: string; content?: string }) =>
      knowledgeService.createDocument(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge', 'documents'] });
      toast.success('Document added');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => knowledgeService.deleteDocument(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge', 'documents'] });
      toast.success('Document deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
