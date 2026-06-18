import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Principal } from '@ivy/types';

/** Injects the authenticated principal (admin or tenant user) attached by JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as Principal;
  },
);
