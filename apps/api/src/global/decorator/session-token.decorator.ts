import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

/**
 * Resolve the widget session token, preferring the `X-Session-Token` header over
 * the `session_token` query param and the `:token` path param (PRV-M7/FE-M3).
 * The header keeps the token out of URLs — off browser history, proxy logs, and
 * the Referer header — while query/path remain accepted for back-compat.
 *
 * Throws 401 when no token resolves: a missing token must never fall through to
 * `findOne({ where: { sessionToken: undefined } })`, which TypeORM treats as an
 * unconstrained query that returns an arbitrary session.
 */
export const SessionToken = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<Request>();
  const header = req.header('x-session-token');
  if (header && header.trim()) return header.trim();
  const query = req.query?.session_token;
  if (typeof query === 'string' && query) return query;
  const param = (req.params as Record<string, string> | undefined)?.token;
  if (param) return param;
  throw new UnauthorizedException('Session token required');
});
