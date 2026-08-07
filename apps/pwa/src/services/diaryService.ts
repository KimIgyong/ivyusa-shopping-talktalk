import { apiClient } from '../lib/api-client';
import type { DiaryNote } from '../lib/types';

/** Free-form diary memos — diary_notes (F3, A-7). Body carries session_token (saveService parity). */

export function listDiaryNotes(sessionToken: string): Promise<DiaryNote[]> {
  return apiClient.get<DiaryNote[]>('/me/diary', sessionToken);
}

export function addDiaryNote(
  sessionToken: string,
  body: string,
  productHandle?: string,
): Promise<DiaryNote> {
  return apiClient.post<DiaryNote>(
    '/me/diary',
    { session_token: sessionToken, body, product_handle: productHandle },
    sessionToken,
  );
}

export function removeDiaryNote(sessionToken: string, noteId: string | number): Promise<unknown> {
  return apiClient.post<unknown>(
    '/me/diary/remove',
    // API DTO field is `id` and @IsInt — must be numeric (no implicit conversion).
    { session_token: sessionToken, id: Number(noteId) },
    sessionToken,
  );
}
