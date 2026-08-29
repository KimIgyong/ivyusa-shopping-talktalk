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
  /** Adoption state (B2): the KB row this was promoted into, if any. */
  kbDocumentId?: string | null;
  /** The board copy moved past what the KB carries — re-promote to sync. */
  revisionBehind?: boolean;
}

// ---- Review: adoption + simulation (B2) ----

export interface SimulateSource {
  id: number;
  title: string;
  category: string | null;
  similarity: number | null;
  snippet: string;
  candidate: boolean;
}

export interface SimulateResult {
  answer: string;
  confidence: number;
  blocked: boolean;
  candidateCited: boolean;
  candidateSimilarity: number | null;
  sources: SimulateSource[];
}

export interface GoldenAbItem {
  question: string;
  language: string;
  baseConfidence?: number;
  withConfidence?: number;
  delta?: number;
  candidateCited?: boolean;
  candidateSimilarity?: number | null;
  failed?: boolean;
}

export interface GoldenAbResult {
  items: GoldenAbItem[];
  summary: { questions: number; cited: number; avgDelta: number };
}

export interface BoardComment {
  id: string;
  body: string;
  mentions: Array<{ id: string; name: string }>;
  authorUserId: string;
  authorName: string;
  createdAt: string;
}

export interface BoardMention {
  id: string;
  documentId: string;
  documentTitle: string;
  body: string;
  authorUserId: string;
  createdAt: string;
}

export interface BoardLinkGraph {
  backlinks: Array<{ id: string; title: string }>;
  outgoing: Array<{ title: string; documentId: string | null }>;
}

export interface PromoteResult {
  kbDocumentId: string;
  category: string;
  embedded: number;
  embedFailed: number;
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

export interface FaqImportResult {
  parsed: number;
  created: number;
  skipped: number;
  invalid: number;
  errors: Array<{ row: number; reason: string }>;
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
  promote: (id: string, category?: string) =>
    apiPost<PromoteResult>(`/board/documents/${id}/promote`, category ? { category } : {}),
  reject: (id: string) => apiPost<{ rejected: true }>(`/board/documents/${id}/reject`, {}),
  reopen: (id: string) => apiPost<{ reopened: true }>(`/board/documents/${id}/reopen`, {}),
  simulate: (id: string, question: string, language?: string) =>
    apiPost<SimulateResult>(`/board/documents/${id}/simulate`, { question, language }),
  simulateGolden: (id: string) =>
    apiPost<GoldenAbResult>(`/board/documents/${id}/simulate/golden`, {}),
  comments: (id: string) => apiGet<BoardComment[]>(`/board/documents/${id}/comments`),
  addComment: (id: string, body: string, mentionIds: number[]) =>
    apiPost<BoardComment>(`/board/documents/${id}/comments`, { body, mention_ids: mentionIds }),
  removeComment: (commentId: string) =>
    apiDelete<{ deleted: true }>(`/board/comments/${commentId}`),
  mentions: () => apiGet<BoardMention[]>('/board/mentions'),
  importFaq: (file: File, docGroup: string) => {
    const form = new FormData();
    form.append('files', file);
    form.append('doc_group', docGroup);
    return apiPostForm<FaqImportResult>('/board/import', form);
  },
  linkGraph: (id: string) => apiGet<BoardLinkGraph>(`/board/documents/${id}/backlinks`),
};
