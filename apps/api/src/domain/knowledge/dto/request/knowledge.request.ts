import { IsIn, IsInt, IsObject, IsOptional, IsString } from 'class-validator';

/** Knowledge source ingestion modes (FR-064). */
export const KNOWLEDGE_SOURCE_TYPES = ['board', 'repository', 'gdrive'] as const;

// ---- Sources ----

export class CreateSourceRequest {
  @IsString() @IsIn(KNOWLEDGE_SOURCE_TYPES as unknown as string[]) type: string;
  @IsString() name: string;
  @IsOptional() @IsInt() designated?: number;
  @IsOptional() @IsObject() config_json?: Record<string, unknown>;
}

export class UpdateSourceRequest {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() status?: string; // active/inactive
  @IsOptional() @IsInt() designated?: number;
}

// ---- Documents ----

export class ListDocumentsQuery {
  @IsOptional() @IsString() source_id?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() size?: string;
}

export class CreateDocumentRequest {
  @IsOptional() @IsInt() source_id?: number;
  @IsOptional() @IsString() source?: string; // knowledge_store/google_drive
  @IsString() category: string;
  @IsString() title: string;
  @IsString() content: string;
}

export class UpdateDocumentRequest {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsInt() active?: number;
  // Provenance & staleness (PLN D7). Nullable on purpose: clearing a review
  // cadence is a legitimate edit, so `null` is distinct from "not sent".
  @IsOptional() @IsString() source_url?: string | null;
  @IsOptional() @IsString() effective_from?: string | null;
  @IsOptional() @IsInt() review_interval_days?: number | null;
  @IsOptional() @IsInt() owner_user_id?: number | null;
}

/** Conflict review queue filter. */
export class ListConflictsQuery {
  /** pending (default view) | resolved | dismissed */
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() size?: string;
}

export class ResolveConflictRequest {
  /** kept_a | kept_b | kept_both */
  @IsString() resolution: string;
}

/** Console knowledge QA (PLN-Knowledge-QA-Console F1). */
export class AskKnowledgeRequest {
  @IsString() question: string;
  @IsOptional() @IsString() language?: string; // en/es/ko
}

// ---- Board posts ----

export class CreatePostRequest {
  @IsString() title: string;
  @IsOptional() @IsString() body?: string;
}
