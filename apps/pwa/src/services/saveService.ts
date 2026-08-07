import { apiClient } from '../lib/api-client';
import type { SaveItem, SaveList } from '../lib/types';

/** 찜(wish) / 담아두기(later) — product_saves (F2, A-4). */

export function listSaves(sessionToken: string): Promise<SaveItem[]> {
  return apiClient.get<SaveItem[]>('/saves', sessionToken);
}

export function addSave(
  sessionToken: string,
  productHandle: string,
  list: SaveList,
): Promise<SaveItem> {
  return apiClient.post<SaveItem>(
    '/saves',
    { session_token: sessionToken, product_handle: productHandle, list },
    sessionToken,
  );
}

export function removeSave(
  sessionToken: string,
  productHandle: string,
  list: SaveList,
): Promise<unknown> {
  return apiClient.post<unknown>(
    '/saves/remove',
    { session_token: sessionToken, product_handle: productHandle, list },
    sessionToken,
  );
}
