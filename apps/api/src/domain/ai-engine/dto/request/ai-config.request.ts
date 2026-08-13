import { IsArray, IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

class ScenarioButtonDto {
  @IsString() id: string;
  @IsString() label: string;
  @IsString() action: string;
  @IsBoolean() enabled: boolean;
}

/** /ai-setting preview sandbox session (PLN-AiSetting-Preview W1). */
export class CreatePreviewSessionRequest {
  @IsOptional() @IsString() language?: string; // en/es/ko
}

/** Request DTO — snake_case. */
export class UpdateAiConfigRequest {
  @IsOptional() @IsString() persona?: string;

  @IsOptional() @IsArray() @IsString({ each: true }) rules?: string[];

  @IsOptional() @IsArray() scenario_buttons?: ScenarioButtonDto[];

  /**
   * Per-action script edits keyed by scenario action. Shape is validated and
   * pruned in AiConfigService.sanitizeOverrides (blank fields fall back to the
   * built-in script), so an object check is the right depth here.
   */
  @IsOptional() @IsObject() scenario_overrides?: Record<string, unknown>;

  /** Escalation routing; shape is documented on HandoffConfig (entity). */
  @IsOptional() @IsObject() handoff_config?: Record<string, unknown>;

  /** Why this change was made — stored on the revision, never sent to the model. */
  @IsOptional() @IsString() note?: string;
}
