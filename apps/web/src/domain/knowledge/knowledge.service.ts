import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client';

export interface KnowledgeSource {
  id: string;
  name: string;
  type?: string;
  enabled: boolean;
  documentCount?: number;
  createdAt?: string;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  sourceId?: string;
  status?: string;
  createdAt?: string;
}

export const knowledgeService = {
  sources: () => apiGet<KnowledgeSource[]>('/knowledge/sources'),
  createSource: (body: { name: string; type: string }) =>
    apiPost<KnowledgeSource>('/knowledge/sources', body),
  toggleSource: (id: string, enabled: boolean) =>
    apiPatch<KnowledgeSource>(`/knowledge/sources/${id}`, { enabled }),
  documents: () => apiGet<KnowledgeDocument[]>('/knowledge/documents'),
  createDocument: (body: { title: string; sourceId?: string; content?: string }) =>
    apiPost<KnowledgeDocument>('/knowledge/documents', body),
  deleteDocument: (id: string) => apiDelete<{ ok: true }>(`/knowledge/documents/${id}`),
};
