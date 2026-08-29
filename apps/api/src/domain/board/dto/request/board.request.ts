import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DOC_GROUP } from '../../../knowledge/entity/kb-document.entity';
import { BOARD_DOC_STATUS } from '../../entity/board-document.entity';

export class CreateBoardDocumentRequest {
  @IsOptional() @IsIn(Object.values(DOC_GROUP)) doc_group?: string;
  @IsString() @MinLength(1) @MaxLength(64) category1: string;
  @IsOptional() @IsString() @MaxLength(64) category2?: string;
  @IsString() @MinLength(1) @MaxLength(255) title: string;
  @IsOptional() @IsString() @MaxLength(32) team_label?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(64, { each: true })
  tags?: string[];
  /** draft (default) | published — promoted/rejected are B2 transitions. */
  @IsOptional() @IsIn([BOARD_DOC_STATUS.DRAFT, BOARD_DOC_STATUS.PUBLISHED]) status?: string;
}

export class UpdateBoardDocumentRequest {
  @IsOptional() @IsIn(Object.values(DOC_GROUP)) doc_group?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(64) category1?: string;
  /** Empty string clears it — a second level is optional by design. */
  @IsOptional() @IsString() @MaxLength(64) category2?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) title?: string;
  @IsOptional() @IsString() @MaxLength(32) team_label?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(64, { each: true })
  tags?: string[];
  @IsOptional() @IsIn([BOARD_DOC_STATUS.DRAFT, BOARD_DOC_STATUS.PUBLISHED]) status?: string;
}

export class ListBoardDocumentsQuery {
  @IsOptional() @IsString() group?: string;
  @IsOptional() @IsString() category1?: string;
  @IsOptional() @IsString() category2?: string;
  @IsOptional() @IsString() tag?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() size?: string;
}

export class CreateBoardCommentRequest {
  @IsString() @MinLength(1) body: string;
  /** Tenant user ids the author tagged; server re-validates ownership. */
  @IsOptional() @IsArray() mention_ids?: number[];
}

export class AddBoardLinkRequest {
  @IsString() @MaxLength(1024) url: string;
  @IsOptional() @IsString() @MaxLength(255) label?: string;
}
