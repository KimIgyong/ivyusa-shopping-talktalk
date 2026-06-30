import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateReviewRequest {
  @IsString() session_token: string;
  @IsInt() order_item_id: number;
  @IsInt() @Min(1) @Max(5) rating: number;
  @IsOptional() @IsString() body?: string;
}
