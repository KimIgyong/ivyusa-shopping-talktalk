import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateNudgeRequest {
  @IsString() session_token: string;
  @IsString() @MaxLength(255) product_handle: string;
  @IsOptional() @IsString() @MaxLength(280) message?: string;
}
