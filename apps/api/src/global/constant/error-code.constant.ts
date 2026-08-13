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
  LOGIN_RATE_LIMITED: { code: 'E1008', message: 'Too many login attempts, try again later' },
  // details.password carries the failed rule keys (see password-policy.util PASSWORD_RULE).
  PASSWORD_POLICY_VIOLATION: { code: 'E1009', message: 'Password does not meet the password policy' },
  // MFA (PLN-MFA Stage M1). E1010 is reserved for Stage M3 policy enforcement.
  MFA_REQUIRED: { code: 'E1010', message: 'Multi-factor authentication required' },
  MFA_CODE_INVALID: { code: 'E1011', message: 'Invalid or already used MFA code' },
  MFA_ALREADY_ENROLLED: { code: 'E1012', message: 'MFA is already enrolled for this account' },

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
  // Agent coaching (REQ-260804 / FR-071..073)
  COACH_THREAD_NOT_FOUND: { code: 'E4012', message: 'Coaching thread not found' },
  COACH_PROPOSAL_NOT_FOUND: { code: 'E4013', message: 'Coaching proposal not found' },
  COACH_PROPOSAL_NOT_PENDING: { code: 'E4014', message: 'Coaching proposal is no longer pending' },
  // The config moved between proposing and applying, so the stored diff no
  // longer describes the change it claimed to make.
  COACH_PROPOSAL_STALE: { code: 'E4015', message: 'Target changed since this proposal was made' },
  // Knowledge documents roll back through their own revision history instead.
  COACH_REVERT_UNSUPPORTED: {
    code: 'E4016',
    message: 'Undo this from the knowledge document revision history',
  },
  // Nothing to re-ask, so a before/after comparison would be empty.
  GOLDEN_SET_EMPTY: { code: 'E4017', message: 'Add a regression question first' },

  // E5xxx — domain
  ORDER_NOT_FOUND: { code: 'E5001', message: 'Order not found' },
  RESOURCE_NOT_FOUND: { code: 'E5002', message: 'Resource not found' },
  VALIDATION_FAILED: { code: 'E5003', message: 'Validation failed' },
  DUPLICATE_RESOURCE: { code: 'E5004', message: 'Resource already exists' },
  TENANT_NOT_FOUND: { code: 'E5005', message: 'Unknown shop domain' },
  // Push module (REQ-MobileApp M1)
  PUSH_TOKEN_INVALID: { code: 'E5006', message: 'Invalid push token' },
  // E5006 was taken by push on main first; this one moved rather than renumbering a
  // code already shipped to clients.
  IDENTITY_ERASED: { code: 'E5007', message: 'This person requested erasure of their data' },
  // E5010-E5014 — Cafe24 integration (PLN-260807).
  CAFE24_APP_NOT_CONFIGURED: { code: 'E5010', message: 'Cafe24 app is not configured' },
  CAFE24_OAUTH_STATE_INVALID: { code: 'E5011', message: 'Invalid or expired Cafe24 OAuth state' },
  CAFE24_TOKEN_EXCHANGE_FAILED: { code: 'E5012', message: 'Cafe24 token exchange failed' },
  CAFE24_NOT_CONNECTED: { code: 'E5013', message: 'Cafe24 store is not connected' },
  CAFE24_API_ERROR: { code: 'E5014', message: 'Cafe24 API error' },
  // E5015-E5018 — Cafe24 customer (member) authentication (PLN-260808 P-A2).
  CAFE24_CUSTOMER_STATE_INVALID: { code: 'E5015', message: 'Invalid or expired Cafe24 customer-auth state' },
  CAFE24_CUSTOMER_TOKEN_FAILED: { code: 'E5016', message: 'Cafe24 customer token exchange failed' },
  CAFE24_CUSTOMER_IDENTIFIER_FAILED: { code: 'E5017', message: 'Cafe24 customer identifier lookup failed' },
  CAFE24_CUSTOMER_TICKET_INVALID: { code: 'E5018', message: 'Invalid or expired Cafe24 sign-in ticket' },
  /** Cafe24 itself declined the authorize request (e.g. invalid_scope, access_denied). */
  CAFE24_OAUTH_REFUSED: { code: 'E5019', message: 'Cafe24 declined the authorization request' },
  // E5020-E5021 — issue workflow P1 (PLN-260808-Issue-Workflow-P1).
  ISSUE_NOT_FOUND: { code: 'E5020', message: 'Issue not found' },
  ISSUE_TRANSITION_INVALID: { code: 'E5021', message: 'Issue state transition not allowed' },
  // P2 (PLN-260808-Issue-Workflow-P2)
  AGENT_AT_CAPACITY: { code: 'E5022', message: 'Agent is at max concurrent conversations' },
  // E5023-E5027 — external messenger channels (PLN-260810 PR-M1).
  MESSENGER_CHANNEL_NOT_FOUND: { code: 'E5023', message: 'Messenger channel not found' },
  MESSENGER_PROVIDER_UNSUPPORTED: { code: 'E5024', message: 'Messenger provider is not supported' },
  MESSENGER_CREDENTIAL_MISSING: { code: 'E5025', message: 'Messenger channel credential is not set' },
  MESSENGER_SEND_FAILED: { code: 'E5026', message: 'Messenger outbound delivery failed' },
  /** Reply refused by the platform: receive-only thread, or its send window closed. */
  MESSENGER_REPLY_NOT_ALLOWED: { code: 'E5027', message: 'Replying to this channel thread is not allowed' },

  // E5028 — live-chat handback (PLN-260810 S1).
  CONVERSATION_NOT_WITH_AGENT: {
    code: 'E5028',
    message: 'Only a conversation an agent is handling can be handed back',
  },
  // E5029-E5031 — menu provisioning & access (PLN-260812).
  /** The tenant's plan/provisioning does not include this menu at all. */
  MENU_NOT_PROVIDED: { code: 'E5029', message: 'This menu is not provided for this tenant' },
  /** Provided to the tenant, but this member is not allowed to reach it. */
  MENU_ACCESS_DENIED: { code: 'E5030', message: 'You do not have access to this menu' },
  MENU_CODE_UNKNOWN: { code: 'E5031', message: 'Unknown menu code' },

  // E5032-E5034 — AMA SSO (PLN-260813-AMA-Iframe-SSO S2).
  AMA_SSO_DISABLED: { code: 'E5032', message: 'AMA SSO is not configured' },
  AMA_TOKEN_INVALID: { code: 'E5033', message: 'AMA token exchange failed' },
  AMA_SSO_USER_NOT_MAPPED: {
    code: 'E5034',
    message: 'No active console account matches the AMA identity for this tenant',
  },
  // E9xxx — system
  INTERNAL_ERROR: { code: 'E9001', message: 'Internal server error' },
  EXTERNAL_SERVICE_ERROR: { code: 'E9002', message: 'External service error' },
} as const;

export type ErrorCodeEntry = { code: string; message: string };
