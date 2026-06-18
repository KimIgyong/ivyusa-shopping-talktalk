import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { Principal } from '@ivy/types';
import { IS_PUBLIC_KEY } from '../decorator/public.decorator';
import { BusinessException } from '../exception/business.exception';
import { ERROR_CODE } from '../constant/error-code.constant';
import { HttpStatus } from '@nestjs/common';

/**
 * Verifies the access JWT and attaches the decoded principal to req.user.
 * Routes marked @Public() are skipped.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
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
    try {
      const payload = await this.jwt.verifyAsync<Principal>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
      req.user = payload;
      return true;
    } catch {
      throw new BusinessException(ERROR_CODE.TOKEN_EXPIRED, HttpStatus.UNAUTHORIZED);
    }
  }

  private extractToken(req: Request): string | null {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    return null;
  }
}
