import { IsString, MinLength } from 'class-validator';

/** Request DTO — snake_case (amoeba_code_convention). PLN-260813-AMA-Iframe-SSO S2. */
export class AmaSsoLoginRequest {
  /** Short-lived SSO JWT minted by the AMA portal (validated via ama_session exchange). */
  @IsString()
  @MinLength(20)
  ama_token: string;

  /** Tenant console the iframe points at (decision D2 — slug names the tenant). */
  @IsString()
  @MinLength(1)
  tenant_slug: string;
}
