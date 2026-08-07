import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { REVIEW_STATUS, ReviewStatus } from '../../entity/review.entity';

export class CreateReviewRequest {
  @IsString() session_token: string;
  // Widget echoes the id back as a string (bigint PKs serialize as strings).
  @Type(() => Number) @IsInt() order_item_id: number;
  @IsInt() @Min(1) @Max(5) rating: number;
  @IsOptional() @IsString() body?: string;
}

/** Console hide/unhide (D3). */
export class UpdateReviewStatusRequest {
  @IsIn([REVIEW_STATUS.SUBMITTED, REVIEW_STATUS.HIDDEN]) status: ReviewStatus;
}
