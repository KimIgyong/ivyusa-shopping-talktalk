import { apiClient } from '../lib/api-client';
import type { DiaryNote } from '../lib/types';

/** 다이어리 자유 메모 (A-7 diary_notes). Anonymous sessions get 401. */
export function listDiaryNotes(sessionToken: string): Promise<DiaryNote[]> {
  return apiClient.get<DiaryNote[]>('/me/diary', sessionToken);
}

export function addDiaryNote(
  sessionToken: string,
  body: string,
  productHandle?: string,
): Promise<unknown> {
  return apiClient.post(
    '/me/diary',
    { session_token: sessionToken, body, product_handle: productHandle },
    sessionToken,
  );
}

export function removeDiaryNote(sessionToken: string, id: string | number): Promise<unknown> {
  // API DTO field is @IsInt — must be numeric (no implicit conversion on the pipe).
  return apiClient.post('/me/diary/remove', { session_token: sessionToken, id: Number(id) }, sessionToken);
}
