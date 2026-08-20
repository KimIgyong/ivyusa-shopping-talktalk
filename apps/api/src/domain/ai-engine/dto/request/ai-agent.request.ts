import { IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** Request DTOs — snake_case (amoeba_code_convention). */
export class CreateAiAgentRequest {
  /** Routing key for embed snippets/channel bindings; lowercased, locked after create. */
  @IsString() @MaxLength(64) code: string;

  @IsString() @MaxLength(100) name: string;

  @IsOptional() @IsString() @MaxLength(4000) persona?: string;

  @IsOptional() @IsArray() @IsString({ each: true }) rules?: string[];
}

export class UpdateAiAgentRequest {
  @IsOptional() @IsString() @MaxLength(100) name?: string;

  @IsOptional() @IsString() @MaxLength(4000) persona?: string;

  @IsOptional() @IsArray() @IsString({ each: true }) rules?: string[];

  @IsOptional() @IsBoolean() active?: boolean;
}
