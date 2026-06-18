import { IsIn, IsInt, IsObject, IsOptional, IsString } from 'class-validator';

/** Tenant-selectable AI functions (FR-070). */
export const AI_FUNCTIONS = ['chat', 'rag', 'summary', 'assist', 'moderation'] as const;

// ---- Platform engine catalog ----

export class CreateEngineRequest {
  @IsString() provider: string; // anthropic/openai/google/azure/custom
  @IsString() name: string;
  @IsString() model: string;
  @IsOptional() @IsString() endpoint?: string;
  @IsOptional() @IsString() api_key?: string;
  @IsOptional() @IsString() capabilities?: string;
  @IsOptional() @IsInt() is_default?: number;
  @IsOptional() @IsInt() tenant_id?: number | null;
}

export class UpdateEngineRequest {
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() endpoint?: string;
  @IsOptional() @IsString() api_key?: string;
  @IsOptional() @IsString() capabilities?: string;
  @IsOptional() @IsString() status?: string; // enabled/disabled
  @IsOptional() @IsInt() is_default?: number;
}

// ---- Tenant AI settings ----

export class UpsertAiSettingRequest {
  @IsInt() engine_id: number;
  @IsOptional() @IsObject() params?: Record<string, unknown>;
}

export class FunctionParam {
  @IsString() @IsIn(AI_FUNCTIONS as unknown as string[]) function: string;
}
