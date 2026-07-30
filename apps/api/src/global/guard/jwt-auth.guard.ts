import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { Principal } from '@ivy/types';
import { IS_PUBLIC_KEY } from '../decorator/public.decorator';
import { ALLOW_PENDING_PASSWORD_KEY } from '../decorator/allow-pending-password.decorator';
import { BusinessException } from '../exception/business.exception';
import { ERROR_CODE } from '../constant/error-code.constant';
import { HttpStatus } from '@nestjs/common';

/**
 * Verifies the access JWT and attaches the decoded principal to req.user.
 * Routes marked @Public() are skipped.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const token = this.extractToken(req);
    if (!token) {
      throw new BusinessException(ERROR_CODE.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
    }
    let payload: Principal & { pwdPending?: boolean; purpose?: string };
    try {
      payload = await this.jwt.verifyAsync<Principal & { pwdPending?: boolean; purpose?: string }>(
        token,
        {
          secret: this.config.get<string>('JWT_ACCESS_SECRET'),
          algorithms: ['HS256'],
        },
      );
    } catch {
      throw new BusinessException(ERROR_CODE.TOKEN_EXPIRED, HttpStatus.UNAUTHORIZED);
    }
    // Purpose-limited tokens (e.g. the MFA step-up token, purpose:'mfa') are NOT
    // access tokens — they only work at their dedicated endpoint (PLN-MFA M1).
    // 4xx are not server-logged by default, so warn here.
    if (payload.purpose) {
      this.logger.warn(`rejected purpose-limited token (purpose=${payload.purpose}) on a normal API route`);
      throw new BusinessException(ERROR_CODE.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
    }
    // Must-change-password lockout (SEC-M2): a token issued while the account
    // still carries a seeded/temporary password can only reach the routes
    // needed to complete the change.
    if (payload.pwdPending) {
      const allowPending = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]);
      if (!allowPending) {
        throw new BusinessException(ERROR_CODE.MUST_CHANGE_PASSWORD, HttpStatus.FORBIDDEN);
      }
    }
    req.user = payload;
    return true;
  }

  private extractToken(req: Request): string | null {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    return null;
  }
}
