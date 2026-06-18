import { Principal } from '@ivy/types';

/** Augment Express Request with the authenticated principal set by JwtAuthGuard. */
declare global {
  namespace Express {
    interface Request {
      user?: Principal;
    }
  }
}

export {};
