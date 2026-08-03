import { apiGet } from '@/lib/api-client';

/** The four lenses a question can be counted through (PLN D2). */
export const DIMENSIONS = ['intent', 'category', 'document', 'keyword', 'cluster'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** Tabs shown in the console; `category` rides along inside the document tab. */
export const DIMENSION_TABS: Dimension[] = ['intent', 'document', 'keyword', 'cluster'];

export interface StatRow {
  key: string;
  label: string | null;
  asked: number;
  escalated: number;
  noSource: number;
  escalationRate: number;
  avgConfidence: number | null;
}

export interface QuestionStats {
  top: StatRow[];
  trend: Array<{ date: string; asked: number }>;
  total: number;
}

export interface QuestionStatsParams {
  dimension: Dimension;
  from: string;
  to: string;
  limit?: number;
}

export const statisticsService = {
  questions: (params: QuestionStatsParams) =>
    apiGet<QuestionStats>('/analytics/questions', {
      dimension: params.dimension,
      from: params.from,
      to: params.to,
      limit: params.limit,
    }),
};
