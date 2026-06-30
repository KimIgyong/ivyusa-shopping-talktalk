import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

class ScenarioButtonDto {
  @IsString() id: string;
  @IsString() label: string;
  @IsString() action: string;
  @IsBoolean() enabled: boolean;
}

/** Request DTO — snake_case. */
export class UpdateAiConfigRequest {
  @IsOptional() @IsString() persona?: string;

  @IsOptional() @IsArray() @IsString({ each: true }) rules?: string[];

  @IsOptional() @IsArray() scenario_buttons?: ScenarioButtonDto[];
}
