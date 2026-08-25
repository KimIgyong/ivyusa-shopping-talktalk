import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api-client';

export interface JourneyReportSummary {
  id: string;
  groupId: string;
  kind: 'journey' | 'comparison';
  periodFrom: string | null;
  periodTo: string | null;
  criteriaVersion: number;
  sessionCount: number;
  status: 'pending' | 'ready' | 'failed';
  error: string | null;
  language: string;
  provider: string | null;
  model: string | null;
  sourceReportIds: string[] | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface JourneyReportDetail extends JourneyReportSummary {
  bodyMd: string | null;
  /** What the code counted. The body is written from this — never instead. */
  metrics: Record<string, unknown> | null;
}

export interface JourneyCriteria {
  id: string;
  version: number;
  sections: Record<string, string>;
  topQuestionsN: number;
  sampleCap: number;
  quoteMaxChars: number;
  tone: string | null;
  banned: string[];
  createdAt: string;
}

export const journeyService = {
  reports: (groupId: string) =>
    apiGet<JourneyReportSummary[]>(`/journey/groups/${groupId}/reports`),
  report: (id: string) => apiGet<JourneyReportDetail>(`/journey/reports/${id}`),
  create: (groupId: string, body: { period_from?: string; period_to?: string }) =>
    apiPost<JourneyReportSummary>(`/journey/groups/${groupId}/reports`, body),
  compare: (reportIds: string[]) =>
    apiPost<JourneyReportSummary>('/journey/reports/compare', {
      report_ids: reportIds.map(Number),
    }),
  hide: (id: string) => apiDelete<{ hidden: boolean }>(`/journey/reports/${id}`),
  criteria: () =>
    apiGet<{ current: JourneyCriteria; history: JourneyCriteria[] }>('/journey/criteria'),
  saveCriteria: (body: Partial<Record<string, unknown>>) =>
    apiPut<JourneyCriteria>('/journey/criteria', body),
};
