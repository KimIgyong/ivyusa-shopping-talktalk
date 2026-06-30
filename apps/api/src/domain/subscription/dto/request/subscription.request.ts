import { IsString } from 'class-validator';

export class CancelRequest {
  @IsString() session_token: string;
}
