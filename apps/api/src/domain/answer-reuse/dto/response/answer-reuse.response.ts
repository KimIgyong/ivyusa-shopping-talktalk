/** Console view of a reusable answer (camelCase per convention). */
export interface AnswerReuseItemResponse {
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
