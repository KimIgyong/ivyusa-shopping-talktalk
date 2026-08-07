import { IsInt, IsOptional, IsString, Length, MaxLength, Min } from 'class-validator';

export class CreateDiaryNoteRequest {
  @IsString() session_token: string;
  @IsString() @Length(1, 1000) body: string;
  @IsOptional() @IsString() @MaxLength(255) product_handle?: string;
}

export class RemoveDiaryNoteRequest {
  @IsString() session_token: string;
  @IsInt() @Min(1) id: number;
}
