import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { BaseSingleResponse } from '@ivy/types';
import { BusinessException } from '../exception/business.exception';
import { ERROR_CODE } from '../constant/error-code.constant';

/**
 * Global exception filter → standard error envelope (amoeba_code_convention).
 * BusinessException carries an Exxxx code; HttpException maps to generic codes;
 * everything else is E9001 (and logged).
 */
@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ERROR_CODE.INTERNAL_ERROR.code;
    let message: string = ERROR_CODE.INTERNAL_ERROR.message;
    let details: Record<string, string[]> | undefined;

    if (exception instanceof BusinessException) {
      status = exception.getStatus();
      code = exception.errorCode;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message = typeof body === 'string' ? body : ((body as any).message ?? message);
      if (Array.isArray(message)) {
        details = { _: message as string[] };
        message = ERROR_CODE.VALIDATION_FAILED.message;
        code = ERROR_CODE.VALIDATION_FAILED.code;
      } else if (status === HttpStatus.UNAUTHORIZED) {
        code = ERROR_CODE.UNAUTHORIZED.code;
      } else if (status === HttpStatus.FORBIDDEN) {
        code = ERROR_CODE.FORBIDDEN.code;
      } else {
        code = ERROR_CODE.RESOURCE_NOT_FOUND.code;
      }
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    const payload: BaseSingleResponse<null> = {
      success: false,
      data: null,
      error: { code, message, details },
      timestamp: new Date().toISOString(),
    };
    res.status(status).json(payload);
  }
}
