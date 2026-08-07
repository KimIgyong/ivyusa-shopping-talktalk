import { apiClient } from '../lib/api-client';
import type { SaveItem, SaveList } from '../lib/types';

/** 찜(wish) / 담아두기(later) — F2 saves API (A-4). Anonymous sessions get 401. */
export function listSaves(sessionToken: string, list: SaveList): Promise<SaveItem[]> {
  return apiClient.get<SaveItem[]>('/saves', sessionToken, { list });
}

export function addSave(
  sessionToken: string,
  productHandle: string,
  list: SaveList,
): Promise<unknown> {
  return apiClient.post(
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
  return apiClient.post(
    '/saves/remove',
    { session_token: sessionToken, product_handle: productHandle, list },
    sessionToken,
  );
}
