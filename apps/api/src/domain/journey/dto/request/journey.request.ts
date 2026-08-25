import { IsArray, IsInt, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/** POST /journey/groups/:groupId/reports — 전체는 두 값을 비운다. */
export class CreateJourneyReportRequest {
  @IsOptional() @IsString() @MaxLength(10) period_from?: string;
  @IsOptional() @IsString() @MaxLength(10) period_to?: string;
}

/** POST /journey/reports/compare — 사용자가 고른 두 건(D5). */
export class CompareJourneyReportsRequest {
  @IsArray() @IsInt({ each: true }) report_ids: number[];
}

/** PUT /journey/criteria — 저장은 항상 새 버전이 된다. */
export class SaveJourneyCriteriaRequest {
  @IsOptional() @IsObject() sections?: Record<string, string>;
  @IsOptional() @IsInt() top_questions_n?: number;
  @IsOptional() @IsInt() sample_cap?: number;
  @IsOptional() @IsInt() quote_max_chars?: number;
  @IsOptional() @IsString() @MaxLength(64) tone?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) banned?: string[];
}
