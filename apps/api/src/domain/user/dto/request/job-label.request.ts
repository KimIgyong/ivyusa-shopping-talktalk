import { IsString, MaxLength, MinLength } from 'class-validator';

/** Request DTOs — snake_case (amoeba_code_convention). */

export class CreateJobLabelRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(24)
  code: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name: string;
}

export class UpdateJobLabelRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name: string;
}
