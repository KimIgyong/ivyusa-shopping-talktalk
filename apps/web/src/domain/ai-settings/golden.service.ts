import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client';

/** Golden-question regression (PLN-260813 W4-A/B). */

export interface GoldenQuestion {
  id: number;
  question: string;
  language: string;
  note: string | null;
  active: boolean;
  createdAt: string;
}

export interface GoldenRun {
  id: number;
  kind: 'baseline' | 'after' | 'noise' | 'manual';
  label: string | null;
  proposalId: number | null;
  configHash: string;
  questionCount: number;
  truncated: boolean;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

export interface CompareSide {
  answer: string;
  confidence: number | null;
  citations: string[];
  blocked: boolean;
}

export interface CompareItem {
  question: string;
  base: CompareSide | null;
  target: CompareSide | null;
  confidenceDelta: number | null;
  lengthDelta: number | null;
  citationsChanged: boolean;
  textChanged: boolean;
}

export interface Comparison {
  base: GoldenRun;
  target: GoldenRun;
  /** True when nothing in the config differs — so any change below is variance. */
  sameConfig: boolean;
  items: CompareItem[];
}

export const goldenService = {
  listQuestions: () => apiGet<{ items: GoldenQuestion[]; max: number }>('/ai-coach/golden/questions'),
  addQuestion: (body: { question: string; language?: string; note?: string }) =>
    apiPost<GoldenQuestion>('/ai-coach/golden/questions', body),
  updateQuestion: (id: number, body: { question?: string; active?: number }) =>
    apiPatch<GoldenQuestion>(`/ai-coach/golden/questions/${id}`, body),
  removeQuestion: (id: number) => apiDelete<{ removed: boolean }>(`/ai-coach/golden/questions/${id}`),

  listRuns: () => apiGet<{ items: GoldenRun[] }>('/ai-coach/golden/runs'),
  createRun: (kind: 'manual' | 'noise', label?: string) =>
    apiPost<GoldenRun>('/ai-coach/golden/runs', { kind, label }),
  compare: (base: number, target: number) =>
    apiGet<Comparison>('/ai-coach/golden/compare', { base, target }),

  applyVerified: (proposalId: number) =>
    apiPost<{ proposal: unknown; comparison: Comparison }>(
      `/ai-coach/proposals/${proposalId}/apply-verified`,
      {},
    ),
};
