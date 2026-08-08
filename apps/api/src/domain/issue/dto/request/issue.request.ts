import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ISSUE_REJECT_REASON, ISSUE_STATUS } from '../../entity/issue.entity';

/** POST /agent/issues/:id/transition — snake_case per convention. */
export class TransitionIssueRequest {
  @IsIn(Object.values(ISSUE_STATUS))
  to: string;

  @IsOptional()
  @IsIn(Object.values(ISSUE_REJECT_REASON))
  reject_reason?: string;

  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
