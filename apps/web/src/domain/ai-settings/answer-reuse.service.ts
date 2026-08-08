import { apiDelete, apiGetList, apiPatch, apiPost } from '@/lib/api-client';

/** Console view of a reusable answer (PLN-260808 Track C, D-C3). */
export interface AnswerReuseItem {
  id: string;
  lang: string;
  questionText: string;
  answerText: string;
  source: string; // agent | ai
  confidence: number | null;
  active: boolean;
  hitCount: number;
  lastHitAt: string | null;
  createdAt: string;
}

export const answerReuseService = {
  list: (page: number, size: number, q?: string, activeOnly?: boolean) =>
    apiGetList<AnswerReuseItem>('/admin/answer-reuse', {
      page,
      size,
      ...(q ? { q } : {}),
      ...(activeOnly ? { active: '1' } : {}),
    }),
  update: (id: string, patch: { answerText?: string; active?: boolean }) =>
    apiPatch<AnswerReuseItem>(`/admin/answer-reuse/${id}`, {
      ...(patch.answerText !== undefined ? { answer_text: patch.answerText } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
    }),
  remove: (id: string) => apiDelete<{ deleted: boolean }>(`/admin/answer-reuse/${id}`),
  deactivateAll: () => apiPost<{ deactivated: number }>('/admin/answer-reuse/deactivate-all', {}),
};
