import { IsString, Matches } from 'class-validator';

/** Request DTO — snake_case (amoeba_code_convention). */
export class Cafe24ConnectRequest {
  // Cafe24 mall id (becomes the API subdomain). Accepts a bare id or a *.cafe24.com host.
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_.-]{1,80}$/)
  mall_id: string;
}
