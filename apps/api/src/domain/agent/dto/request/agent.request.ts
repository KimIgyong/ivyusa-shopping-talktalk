import { IsEmail, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

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

export class LinkCustomerRequest {
  @IsInt() @Min(1) customer_id: number;
}

export class CreateCustomerRequest {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
}

export class UpsertProfileRequest {
  @IsOptional() @IsString() languages?: string;
  @IsOptional() @IsString() skills?: string;
  @IsOptional() @IsInt() @Min(1) max_concurrent?: number;
  @IsOptional() @IsString() status?: string;
}
