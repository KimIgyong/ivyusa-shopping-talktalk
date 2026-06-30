import { IsOptional, IsString } from 'class-validator';

export class ConversationSearchQuery {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() escalated?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() size?: string;
}
