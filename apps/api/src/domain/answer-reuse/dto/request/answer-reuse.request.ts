import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** PATCH /admin/answer-reuse/:id — console edit (D-C3). snake_case per convention. */
export class UpdateAnswerReuseRequest {
  @IsOptional() @IsString() @MaxLength(4000) answer_text?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
