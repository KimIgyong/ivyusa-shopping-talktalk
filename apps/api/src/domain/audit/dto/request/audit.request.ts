import { IsOptional, IsString } from 'class-validator';

export class ListAuditQuery {
  @IsOptional() @IsString() action?: string;
  /** Action-prefix filter, e.g. `agent.` for the agent work log. */
  @IsOptional() @IsString() action_prefix?: string;
  @IsOptional() @IsString() actor_type?: string;
  /** Numeric id sent as a string — the query string has no other type. */
  @IsOptional() @IsString() actor_id?: string;
  /** Inclusive date-time lower bound (ISO-8601 or YYYY-MM-DD). */
  @IsOptional() @IsString() from?: string;
  /** Exclusive upper bound; a bare date is widened to the end of that day. */
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() size?: string;
}
