import { apiGet, apiGetList, apiPost, apiPostForm, apiPatch, apiDelete } from '@/lib/api-client';
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
  /** counsel | product */
  docGroup?: string;
  externalKey?: string | null;
  createdAt?: string;
  updatedAt?: string;
  // Provenance & staleness (PLN D7). `stale`/`reviewDueAt` are derived server-side.
  sourceUrl?: string | null;
  ownerUserId?: string | null;
  effectiveFrom?: string | null;
  reviewIntervalDays?: number | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  supersededBy?: string | null;
  stale?: boolean;
  reviewDueAt?: string | null;
}

/** Detail adds the LONGTEXT content the list endpoint omits (PERF-9). */
export interface KnowledgeDocumentDetail extends KnowledgeDocument {
  content: string | null;
}

/** KB QA answer with the source documents behind it (PLN-Knowledge-QA F1). */
export interface KnowledgeSource_ {
  id: number;
  title: string;
  category: string | null;
  similarity: number | null;
  snippet: string;
  /** Origin system: knowledge_store / google_drive. */
  source?: string | null;
  /** Past its review cadence. */
  stale?: boolean;
  /** Named in an open conflict with another document. */
  conflicted?: boolean;
}

export interface KnowledgeAnswer {
  answer: string;
  confidence: number;
  /** True when moderation would block this answer — the text is withheld. */
  blocked: boolean;
  sources: KnowledgeSource_[];
}

export interface CategoryCount {
  /** counsel | product */
  group: string;
  category: string | null;
  total: number;
  active: number;
}

export interface ProductImportResult {
  parsed: number;
  created: number;
  updated: number;
  skipped: number;
  invalid: number;
  embedded: number;
  embedFailed: number;
  errors: Array<{ row: number; reason: string }>;
}

/** One side of a conflicting pair, as rendered on the review card. */
export interface ConflictDoc {
  id: string;
  title: string;
  category: string | null;
  source: string;
  sourceUrl: string | null;
  content: string;
  effectiveFrom: string | null;
  updatedAt: string | null;
  reviewedAt: string | null;
  active: boolean;
  stale: boolean;
}

export interface KnowledgeConflict {
  id: string;
  similarity: number | null;
  verdict: string | null; // conflict/duplicate/complementary — null when failed
  rationale: string | null;
  /** Verdict stands; the moderation gate suppressed its explanation. */
  rationaleWithheld?: boolean;
  /** model_error | parse_fail | bad_verdict — set only when status is failed. */
  failureReason?: string | null;
  attempts?: number;
  retriesLeft?: number;
  lastAttemptAt?: string | null;
  status: string; // pending/resolved/dismissed/failed
  resolution: string | null;
  detectedAt: string;
  resolvedAt: string | null;
  docA: ConflictDoc | null;
  docB: ConflictDoc | null;
}

export interface ScanResult {
  scanned: number;
  candidates: number;
  judged: number;
  conflicts: number;
  failed: number;
  withheld: number;
}

export interface DocumentRevision {
  id: string;
  revisionNo: number;
  title: string;
  category: string | null;
  changedFields: string[];
  /** baseline | create | update | restore | delete */
  changeKind: string;
  actorUserId: string | null;
  restoredFrom: number | null;
  createdAt: string;
}

/** Detail adds the snapshotted body; lists omit it. */
export interface DocumentRevisionDetail extends DocumentRevision {
  content: string | null;
  sourceUrl: string | null;
  effectiveFrom: string | null;
  reviewIntervalDays: number | null;
  active: number;
}

export interface DocumentListParams {
  page: number;
  size: number;
  category?: string;
  group?: string;
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
      ...(params.group ? { group: params.group } : {}),
    }),
  document: (id: string) => apiGet<KnowledgeDocumentDetail>(`/knowledge/documents/${id}`),
  createDocument: (body: { title: string; category: string; content: string; source_id?: number }) =>
    apiPost<KnowledgeDocumentDetail>('/knowledge/documents', body),
  updateDocument: (
    id: string,
    body: {
      title?: string;
      category?: string;
      content?: string;
      active?: number;
      // snake_case: request DTOs are snake_case by convention.
      source_url?: string | null;
      effective_from?: string | null;
      review_interval_days?: number | null;
    },
  ) => apiPatch<KnowledgeDocumentDetail>(`/knowledge/documents/${id}`, body),
  markReviewed: (id: string) =>
    apiPost<KnowledgeDocumentDetail>(`/knowledge/documents/${id}/reviewed`, {}),
  deleteDocument: (id: string) => apiDelete<{ deleted: true }>(`/knowledge/documents/${id}`),
  categories: (group?: string) =>
    apiGet<CategoryCount[]>('/knowledge/categories', group ? { group } : undefined),
  importProducts: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    // Left to the browser on purpose: setting Content-Type by hand drops the
    // multipart boundary and the server sees an empty body.
    return apiPostForm<ProductImportResult>('/knowledge/documents/import/product', form);
  },
  ask: (question: string, language: string) =>
    apiPost<KnowledgeAnswer>('/knowledge/ask', { question, language }),
  conflicts: (params: { status?: string; page: number; size: number }) =>
    apiGetList<KnowledgeConflict>('/knowledge/conflicts', params),
  scanConflicts: () => apiPost<ScanResult>('/knowledge/conflicts/scan', {}),
  resolveConflict: (id: string, resolution: 'kept_a' | 'kept_b' | 'kept_both') =>
    apiPost<KnowledgeConflict>(`/knowledge/conflicts/${id}/resolve`, { resolution }),
  dismissConflict: (id: string) =>
    apiPost<KnowledgeConflict>(`/knowledge/conflicts/${id}/dismiss`, {}),
  retryConflict: (id: string) =>
    apiPost<KnowledgeConflict>(`/knowledge/conflicts/${id}/retry`, {}),
  rejudgeConflict: (id: string) =>
    apiPost<KnowledgeConflict>(`/knowledge/conflicts/${id}/rejudge`, {}),
  revisions: (documentId: string) =>
    apiGet<DocumentRevision[]>(`/knowledge/documents/${documentId}/revisions`),
  revision: (documentId: string, revisionId: string) =>
    apiGet<DocumentRevisionDetail>(`/knowledge/documents/${documentId}/revisions/${revisionId}`),
  restoreRevision: (documentId: string, revisionId: string) =>
    apiPost<KnowledgeDocumentDetail>(
      `/knowledge/documents/${documentId}/revisions/${revisionId}/restore`,
      {},
    ),
};
