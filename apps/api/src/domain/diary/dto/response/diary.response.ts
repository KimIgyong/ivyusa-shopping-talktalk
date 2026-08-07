/** A shopping-diary memo as the customer sees it. */
export interface DiaryNoteResponse {
  id: number;
  body: string;
  productHandle: string | null;
  createdAt: Date;
}
