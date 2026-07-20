import { IsInt, IsString, MinLength } from 'class-validator';

/** Request DTOs — snake_case (amoeba_code_convention). */
export class SendMessageRequest {
  @IsString() session_token: string;
  @IsString() @MinLength(1) message: string;
}

export class EscalateRequest {
  @IsString() session_token: string;
  @IsInt() conversation_id: number;
}

export class ScenarioRequest {
  @IsString() session_token: string;
  @IsString() @MinLength(1) action: string;
}
