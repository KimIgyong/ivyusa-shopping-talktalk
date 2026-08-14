import { DOC_GROUP } from '../../entity/kb-document.entity';
import { IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Knowledge source ingestion modes (FR-064). */
export const KNOWLEDGE_SOURCE_TYPES = ['board', 'repository', 'gdrive'] as const;

// ---- Sources ----

export class CreateSourceRequest {
  @IsString() @IsIn(KNOWLEDGE_SOURCE_TYPES as unknown as string[]) type: string;
  @IsString() name: string;
  @IsOptional() @IsInt() designated?: number;
  @IsOptional() @IsObject() config_json?: Record<string, unknown>;
}

/** Service-account key, pasted whole (PLN-260815 G1). */
export class SaveGdriveCredentialRequest {
  @IsString() key_json: string;
}

export class TestGdriveRequest {
  @IsOptional() @IsString() folder_id?: string;
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
  /** counsel | product — omit for all groups. */
  @IsOptional() @IsString() group?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() size?: string;
}

export class CreateDocumentRequest {
  @IsOptional() @IsInt() source_id?: number;
  /** counsel (default) | product — a closed set, so reject anything else. */
  @IsOptional() @IsIn(Object.values(DOC_GROUP)) doc_group?: string;
  @IsOptional() @IsString() source?: string; // knowledge_store/google_drive
  @IsString() category: string;
  @IsString() title: string;
  @IsString() content: string;
  /**
   * Where this knowledge came from — e.g. the live-chat conversation an agent
   * wrote a model answer from (PLN-260807). Provenance matters when someone
   * later asks why a document says what it says.
   */
  @IsOptional() @IsString() @MaxLength(512) source_url?: string;
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
  /** Bias retrieval toward one group; omit for no preference. */
  @IsOptional() @IsString() group?: string;
}

// ---- Board posts ----

export class CreatePostRequest {
  @IsString() title: string;
  @IsOptional() @IsString() body?: string;
}

/** Usage guide body for one product type (PLN-260807 P2). */
export class SaveUsageGuideRequest {
  @IsString() @MaxLength(255) title: string;
  @IsString() @MinLength(20) @MaxLength(20000) content: string;
}

/** POST /knowledge/gap-tasks/:id/accept — 승인 전 인라인 편집(P5). */
export class AcceptGapTaskRequest {
  @IsOptional() @IsString() @MaxLength(300) title?: string;
  @IsOptional() @IsString() content?: string;
}

/** Chat handler proposes an answer for the knowledge base (PLN-260810 S4). */
export class ProposeAnswerRequest {
  @IsOptional() @IsInt() conversation_id?: number;
  @IsString() @MaxLength(500) question: string;
  @IsString() @MinLength(10) answer: string;
}

export class ApproveProposalRequest {
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsOptional() @IsString() @MaxLength(64) category?: string;
  @IsOptional() @IsString() answer?: string;
}

export class RejectProposalRequest {
  @IsString() @MinLength(2) @MaxLength(500) reason: string;
}
