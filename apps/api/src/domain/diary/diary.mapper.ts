import type { DiaryNoteResponse } from './dto/response/diary.response';
import { DiaryNote } from './entity/diary-note.entity';

/** Map a diary row to the response shape (camelCase). */
export function toDiaryNoteResponse(note: DiaryNote): DiaryNoteResponse {
  return {
    id: note.id,
    body: note.body,
    productHandle: note.productHandle,
    createdAt: note.createdAt,
  };
}
