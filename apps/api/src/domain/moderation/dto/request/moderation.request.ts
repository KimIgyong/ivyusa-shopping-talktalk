import { IsOptional, IsString } from 'class-validator';

export class CreateRuleRequest {
  @IsString() scope: string; // agent/ai/both
  @IsString() type: string; // word/phrase/regex/context
  @IsString() pattern_or_prompt: string;
  @IsOptional() @IsString() lang?: string;
  @IsOptional() @IsString() severity?: string;
  @IsOptional() @IsString() action?: string;
}
