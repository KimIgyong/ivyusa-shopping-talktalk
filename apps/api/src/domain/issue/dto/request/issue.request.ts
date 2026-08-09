import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
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

/** POST /agent/issues/:id/assign — transfer/reassign (P2, manager+). */
export class AssignIssueRequest {
  @IsInt() @Min(1) user_id: number;
}

/** PATCH /agent/issues/:id/priority — 결정 5의 2단계 우선순위 (P4). */
export class SetIssuePriorityRequest {
  @IsIn(['normal', 'urgent'])
  priority: string;
}
