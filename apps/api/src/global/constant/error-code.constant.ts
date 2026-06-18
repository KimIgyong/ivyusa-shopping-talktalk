/**
 * Error-code system (amoeba_basic_SPEC) — E1xxx auth, E2xxx user, E3xxx chat,
 * E4xxx agent/AI, E5xxx domain, E9xxx system. Backend messages are English;
 * the frontend localizes by code.
 */
export const ERROR_CODE = {
  // E1xxx — auth / authorization
  UNAUTHORIZED: { code: 'E1001', message: 'Authentication required' },
  INVALID_CREDENTIALS: { code: 'E1002', message: 'Invalid email or password' },
  TOKEN_EXPIRED: { code: 'E1003', message: 'Token expired' },
  FORBIDDEN: { code: 'E1004', message: 'Insufficient permission' },
  MUST_CHANGE_PASSWORD: { code: 'E1005', message: 'Password change required' },
  TENANT_MISMATCH: { code: 'E1006', message: 'Cross-tenant access denied' },
  GUEST_LOOKUP_LIMIT: { code: 'E1007', message: 'Too many lookup attempts, try later' },

  // E2xxx — user / invitation
  USER_NOT_FOUND: { code: 'E2001', message: 'User not found' },
  EMAIL_TAKEN: { code: 'E2002', message: 'Email already in use' },
  INVITATION_INVALID: { code: 'E2003', message: 'Invitation invalid or expired' },

  // E3xxx — chat / conversation
  SESSION_NOT_FOUND: { code: 'E3001', message: 'Session not found' },
  CONVERSATION_NOT_FOUND: { code: 'E3002', message: 'Conversation not found' },
  CONSENT_REQUIRED: { code: 'E3003', message: 'Consent required to proceed' },

  // E4xxx — agent / AI
  AI_ENGINE_UNAVAILABLE: { code: 'E4001', message: 'AI engine unavailable' },
  MODERATION_BLOCKED: { code: 'E4002', message: 'Message blocked by moderation policy' },
  AGENT_UNAVAILABLE: { code: 'E4003', message: 'No agent available' },
  AI_DAILY_QUOTA: { code: 'E4010', message: 'Daily AI quota exceeded' },
  AI_MONTHLY_QUOTA: { code: 'E4011', message: 'Monthly AI quota exceeded' },

  // E5xxx — domain
  ORDER_NOT_FOUND: { code: 'E5001', message: 'Order not found' },
  RESOURCE_NOT_FOUND: { code: 'E5002', message: 'Resource not found' },
  VALIDATION_FAILED: { code: 'E5003', message: 'Validation failed' },
  DUPLICATE_RESOURCE: { code: 'E5004', message: 'Resource already exists' },

  // E9xxx — system
  INTERNAL_ERROR: { code: 'E9001', message: 'Internal server error' },
  EXTERNAL_SERVICE_ERROR: { code: 'E9002', message: 'External service error' },
} as const;

export type ErrorCodeEntry = { code: string; message: string };
