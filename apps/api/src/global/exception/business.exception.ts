import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCodeEntry } from '../constant/error-code.constant';

/**
 * Business exception carrying an Amoeba error code (Exxxx). Caught by
 * BusinessExceptionFilter and rendered into the standard error envelope.
 */
export class BusinessException extends HttpException {
  readonly errorCode: string;
  readonly details?: Record<string, string[]>;

  constructor(
    error: ErrorCodeEntry,
    httpStatus: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: Record<string, string[]>,
  ) {
    super(error.message, httpStatus);
    this.errorCode = error.code;
    this.details = details;
  }
}
