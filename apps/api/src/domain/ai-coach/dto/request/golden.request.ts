import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { GOLDEN_RUN_KIND } from '../../entity/golden-run.entity';

/** Request DTOs — snake_case (code convention §2). */

export class CreateGoldenQuestionRequest {
  @IsString() @MinLength(2) @MaxLength(500) question: string;
  @IsOptional() @IsString() @MaxLength(8) language?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class UpdateGoldenQuestionRequest {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(500) question?: string;
  @IsOptional() @IsString() @MaxLength(8) language?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
  @IsOptional() @Type(() => Number) @IsInt() active?: number;
}

export class CreateGoldenRunRequest {
  /**
   * `manual` is a plain snapshot; `noise` re-runs the same config so the natural
   * variance can be told apart from an actual effect.
   */
  @IsOptional() @IsIn([GOLDEN_RUN_KIND.MANUAL, GOLDEN_RUN_KIND.NOISE]) kind?: string;
  @IsOptional() @IsString() @MaxLength(120) label?: string;
}

export class CompareRunsQuery {
  @Type(() => Number) @IsInt() base: number;
  @Type(() => Number) @IsInt() target: number;
}
