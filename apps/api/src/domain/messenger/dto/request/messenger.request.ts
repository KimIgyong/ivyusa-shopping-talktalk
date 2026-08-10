import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { MESSENGER_CONSENT_MODE, MESSENGER_PROVIDER } from '@ivy/types';

const PROVIDERS = Object.values(MESSENGER_PROVIDER);
const CONSENT_MODES = Object.values(MESSENGER_CONSENT_MODE);

/** Create or replace a channel (request DTOs are snake_case per convention). */
export class UpsertMessengerChannelRequest {
  @ApiProperty({ enum: PROVIDERS })
  @IsIn(PROVIDERS)
  provider: string;

  @ApiProperty({ description: 'Operator-facing name; also the natural key with provider' })
  @IsString()
  @Length(1, 64)
  label: string;

  /**
   * Credential fields per MESSENGER_FIELDS (e.g. `{ bot_token }`). Write-only —
   * never echoed back. Omit to keep the stored credential unchanged.
   */
  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  secret?: Record<string, string>;

  @ApiPropertyOptional({ type: Object, description: 'Non-secret provider settings' })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  auto_reply?: boolean;

  @ApiPropertyOptional({ enum: CONSENT_MODES })
  @IsOptional()
  @IsIn(CONSENT_MODES)
  consent_mode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateMessengerChannelRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  label?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  secret?: Record<string, string>;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  auto_reply?: boolean;

  @ApiPropertyOptional({ enum: CONSENT_MODES })
  @IsOptional()
  @IsIn(CONSENT_MODES)
  consent_mode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
