import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

/** Request DTOs — snake_case (code convention §2). */

export class ListThreadsQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) size?: number;
}

export class CreateThreadRequest {
  @IsOptional() @IsString() @MaxLength(200) title?: string;

  /** Which AI agent to coach (PLN-260820); omitted = the default agent. */
  @IsOptional() @IsInt() ai_agent_id?: number;
}

export class SendCoachMessageRequest {
  @IsString() @MinLength(1) @MaxLength(4000) message: string;

  /**
   * A chat message id to coach on — the AI turn whose behavior is under
   * discussion. Its question, answer and recorded retrieval trace are attached
   * as evidence. Wired to the preview panel in W3.
   */
  @IsOptional() @Type(() => Number) @IsInt() ref_message_id?: number;
}

export class ApplyProposalRequest {
  /** Admin's edited persona text, when accepting a persona proposal with changes. */
  @IsOptional() @IsString() @MaxLength(4000) persona?: string;

  /** Admin's edited rule text, when accepting a rule proposal with changes. */
  @IsOptional() @IsString() @MaxLength(500) rule?: string;

  /** Admin's edited knowledge-document body. */
  @IsOptional() @IsString() @MaxLength(20000) doc_content?: string;

  /** Admin's edited scenario reply. Replaces the text for every language the proposal carried. */
  @IsOptional() @IsString() @MaxLength(2000) scenario_reply?: string;
}
