import { apiGet, apiGetList, apiPost, apiPatch, apiDelete } from '@/lib/api-client';
import type { Paginated } from '@/lib/types';

/** Shapes mirror KnowledgeMapper (apps/api knowledge.mapper.ts). */
export interface KnowledgeSource {
  id: string;
  type: string; // board/repository/gdrive
  name: string;
  status: string; // active/inactive
  designated: number;
  createdAt?: string;
}

export interface KnowledgeDocument {
  id: string;
  source: string; // knowledge_store/google_drive
  sourceId: string | null;
  category: string | null;
  title: string;
  active: number;
  status: string; // embedded/pending
  updatedAt?: string;
}

/** Detail adds the LONGTEXT content the list endpoint omits (PERF-9). */
export interface KnowledgeDocumentDetail extends KnowledgeDocument {
  content: string | null;
}

export interface DocumentListParams {
  page: number;
  size: number;
  category?: string;
}

export const knowledgeService = {
  sources: () => apiGet<KnowledgeSource[]>('/knowledge/sources'),
  createSource: (body: { name: string; type: string }) =>
    apiPost<KnowledgeSource>('/knowledge/sources', body),
  setSourceStatus: (id: string, status: 'active' | 'inactive') =>
    apiPatch<KnowledgeSource>(`/knowledge/sources/${id}`, { status }),
  documents: (params: DocumentListParams): Promise<Paginated<KnowledgeDocument>> =>
    apiGetList<KnowledgeDocument>('/knowledge/documents', {
      page: params.page,
      size: params.size,
      ...(params.category ? { category: params.category } : {}),
    }),
  document: (id: string) => apiGet<KnowledgeDocumentDetail>(`/knowledge/documents/${id}`),
  createDocument: (body: { title: string; category: string; content: string; source_id?: number }) =>
    apiPost<KnowledgeDocumentDetail>('/knowledge/documents', body),
  updateDocument: (
    id: string,
    body: { title?: string; category?: string; content?: string; active?: number },
  ) => apiPatch<KnowledgeDocumentDetail>(`/knowledge/documents/${id}`, body),
  deleteDocument: (id: string) => apiDelete<{ deleted: true }>(`/knowledge/documents/${id}`),
};
