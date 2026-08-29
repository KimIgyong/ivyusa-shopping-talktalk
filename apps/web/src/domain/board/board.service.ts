import { apiGet, apiGetList, apiPost, apiPostForm, apiPatch, apiDelete } from '@/lib/api-client';
import type { Paginated } from '@/lib/types';

/** Shapes mirror BoardMapper (apps/api domain/board). */
export interface BoardInfo {
  id: string;
  name: string;
  createdAt: string;
}

export interface BoardDocumentSummary {
  id: string;
  docGroup: string;
  category1: string;
  category2: string | null;
  title: string;
  teamLabel: string | null;
  tags: string[];
  status: string; // draft | published | promoted | rejected
  authorUserId: string | null;
  updatedBy: string | null;
  promotedDocumentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BoardAttachment {
  id: string;
  kind: 'file' | 'link';
  filename: string;
  mime: string | null;
  size: number | null;
  /** Files: freshly signed download path. Links: the external URL. */
  url: string | null;
  createdAt: string;
}

export interface BoardDocumentDetail extends BoardDocumentSummary {
  content: string;
  links: string[];
  attachments: BoardAttachment[];
}

export interface BoardRevision {
  id: string;
  revisionNo: number;
  title: string;
  category1: string | null;
  category2: string | null;
  changedFields: string[];
  changeKind: string;
  actorUserId: string | null;
  createdAt: string;
  content?: string;
}

export interface BoardCategoryCount {
  group: string;
  category1: string;
  category2: string | null;
  total: number;
}

export interface BoardListParams {
  group?: string;
  category1?: string;
  category2?: string;
  tag?: string;
  status?: string;
  search?: string;
  page?: number;
  size?: number;
}

export interface BoardDocumentInput {
  doc_group?: string;
  category1: string;
  category2?: string;
  title: string;
  team_label?: string;
  content?: string;
  tags?: string[];
  status?: string;
}

export const boardService = {
  board: () => apiGet<BoardInfo>('/board'),
  documents: (params: BoardListParams): Promise<Paginated<BoardDocumentSummary>> =>
    apiGetList<BoardDocumentSummary>('/board/documents', {
      ...(params.group ? { group: params.group } : {}),
      ...(params.category1 ? { category1: params.category1 } : {}),
      ...(params.category2 ? { category2: params.category2 } : {}),
      ...(params.tag ? { tag: params.tag } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.search ? { search: params.search } : {}),
      page: params.page ?? 1,
      size: params.size ?? 20,
    }),
  categoryCounts: () => apiGet<BoardCategoryCount[]>('/board/documents/category-counts'),
  document: (id: string) => apiGet<BoardDocumentDetail>(`/board/documents/${id}`),
  create: (body: BoardDocumentInput) => apiPost<BoardDocumentDetail>('/board/documents', body),
  update: (id: string, body: Partial<BoardDocumentInput>) =>
    apiPatch<BoardDocumentDetail>(`/board/documents/${id}`, body),
  remove: (id: string) => apiDelete<{ deleted: true }>(`/board/documents/${id}`),
  revisions: (id: string) => apiGet<BoardRevision[]>(`/board/documents/${id}/revisions`),
  revision: (id: string, revisionId: string) =>
    apiGet<BoardRevision>(`/board/documents/${id}/revisions/${revisionId}`),
  restore: (id: string, revisionId: string) =>
    apiPost<BoardDocumentDetail>(`/board/documents/${id}/revisions/${revisionId}/restore`, {}),
  upload: (id: string, files: File[]) => {
    const form = new FormData();
    for (const f of files) form.append('files', f);
    return apiPostForm<BoardAttachment[]>(`/board/documents/${id}/attachments`, form);
  },
  addLink: (id: string, url: string, label?: string) =>
    apiPost<BoardAttachment>(`/board/documents/${id}/attachments/link`, { url, label }),
  removeAttachment: (attachmentId: string) =>
    apiDelete<{ deleted: true }>(`/board/attachments/${attachmentId}`),
};
