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
}

// ---- Board posts ----

export class CreatePostRequest {
  @IsString() title: string;
  @IsOptional() @IsString() body?: string;
}
