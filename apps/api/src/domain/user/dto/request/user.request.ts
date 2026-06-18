import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { USER_RANK } from '@ivy/types';

/** Request DTOs — snake_case (amoeba_code_convention). */

const RANK_VALUES = Object.values(USER_RANK);

export class InviteUserRequest {
  @IsEmail()
  email: string;

  @IsString()
  @IsIn(RANK_VALUES)
  rank: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  label_codes?: string[];
}

export class AcceptInviteRequest {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  new_password: string;
}

export class UpdateRankRequest {
  @IsString()
  @IsIn(RANK_VALUES)
  rank: string;
}

export class UpdateLabelsRequest {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  label_codes: string[];
}

export class UpdateStatusRequest {
  @IsString()
  @IsIn(['active', 'suspended'])
  status: string;
}
