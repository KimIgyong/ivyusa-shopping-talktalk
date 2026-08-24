import {
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ListSessionsQuery {
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() size?: string;
  /** Customer name/email filter (decrypt-then-filter window — see CustomerService). */
  @IsOptional() @IsString() q?: string;
  /** 'all' (default, includes live AI threads) | 'queue' | 'ended'. */
  @IsOptional() @IsString() status?: string;
  /** Origin channel filter: 'all' (default) | widget | telegram | zalo | email … */
  @IsOptional() @IsString() channel?: string;
}

/** Transcript paging for the console (PLN-260807): recent tail, then older blocks. */
export class ConversationQuery {
  @IsOptional() @IsString() limit?: string;
  /** Load the block older than this message id. */
  @IsOptional() @IsString() before_id?: string;
}

export class ListStatsQuery {
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() size?: string;
}

export class ListAlertsQuery {
  @IsOptional() @IsString() status?: string;
}

/** Operator display name for a session; blank/omitted clears it (PLN-260812). */
export class SetSessionAliasRequest {
  @IsOptional() @IsString() @MaxLength(60) alias?: string | null;
}

/** Per-session auto-reply choice: inherit | on | off (PLN-260812). */
export class SetAutoReplyRequest {
  @IsString() mode: string;
}

/** Approve the pending draft; `body` replaces it when the agent edited it. */
export class ApproveDraftRequest {
  @IsOptional() @IsString() body?: string;
}

export class AgentMessageRequest {
  /** May be empty when files carry the reply (PLN-260814); the controller
   * refuses a reply that has neither text nor attachments. */
  @IsString() body: string;
  /** Attachment uuids from the console upload endpoint, in display order. */
  @IsOptional() @IsArray() @IsString({ each: true }) attachment_ids?: string[];
}

/** Internal operator note on a thread or its session (REQ-260824 R4). */
export class CreateCommentRequest {
  @IsIn(['conversation', 'session']) scope: 'conversation' | 'session';
  @IsString() @MinLength(1) @MaxLength(2000) body: string;
}

export class UpdateCommentRequest {
  @IsString() @MinLength(1) @MaxLength(2000) body: string;
}

/** Translate a stored briefing into one of the system languages (REQ-260824 R3). */
export class TranslateBriefingRequest {
  @IsString() @MaxLength(8) lang: string;
}

export class LinkCustomerRequest {
  @IsInt() @Min(1) customer_id: number;
}

export class CreateCustomerRequest {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
}

export class UpsertProfileRequest {
  @IsOptional() @IsString() languages?: string;
  @IsOptional() @IsString() skills?: string;
  @IsOptional() @IsInt() @Min(1) max_concurrent?: number;
  @IsOptional() @IsString() status?: string;
}
