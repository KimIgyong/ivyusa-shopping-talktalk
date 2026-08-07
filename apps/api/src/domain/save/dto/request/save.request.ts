import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { SAVE_LIST, SaveList } from '../../entity/product-save.entity';

const SAVE_LISTS = [SAVE_LIST.WISH, SAVE_LIST.LATER] as const;

export class CreateSaveRequest {
  @IsString() session_token: string;
  @IsString() @MaxLength(255) product_handle: string;
  @IsIn(SAVE_LISTS) list: SaveList;
  @IsOptional() @IsString() @MaxLength(280) note?: string;
}

export class RemoveSaveRequest {
  @IsString() session_token: string;
  @IsString() @MaxLength(255) product_handle: string;
  @IsIn(SAVE_LISTS) list: SaveList;
}
