import { IsOptional, IsString } from 'class-validator';

export class SubscribeRequest {
  @IsOptional() @IsString() session_token?: string;
  @IsString() product_id: string;
  @IsOptional() @IsString() channel?: string;
}
