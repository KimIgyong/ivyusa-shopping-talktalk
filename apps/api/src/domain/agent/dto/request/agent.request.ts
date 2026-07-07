import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class ListSessionsQuery {
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() size?: string;
}

export class ListStatsQuery {
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() size?: string;
}

export class ListAlertsQuery {
  @IsOptional() @IsString() status?: string;
}

export class AgentMessageRequest {
  @IsString() @MinLength(1) body: string;
}

export class UpsertProfileRequest {
  @IsOptional() @IsString() languages?: string;
  @IsOptional() @IsString() skills?: string;
  @IsOptional() @IsInt() @Min(1) max_concurrent?: number;
  @IsOptional() @IsString() status?: string;
}
