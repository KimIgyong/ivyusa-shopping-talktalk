import { IsIn, IsString } from 'class-validator';

export class ApplyRequest {
  @IsString() session_token: string;
}

export class ReviewRequest {
  @IsIn(['approve', 'reject']) decision: 'approve' | 'reject';
}
