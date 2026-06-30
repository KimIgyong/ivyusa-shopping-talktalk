import { IsOptional, IsString } from 'class-validator';

export class ListAuditQuery {
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() actor_type?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() size?: string;
}
