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
  // Self-service password recovery from the tenant login page (PLN-260824).
  PASSWORD_RESET_RATE_LIMITED: { code: 'E1013', message: 'Too many recovery attempts, try again later' },
  EMAIL_UNAVAILABLE: { code: 'E1014', message: 'Email delivery is not available' },

  // E2xxx — user / invitation
  USER_NOT_FOUND: { code: 'E2001', message: 'User not found' },
  EMAIL_TAKEN: { code: 'E2002', message: 'Email already in use' },
  INVITATION_INVALID: { code: 'E2003', message: 'Invitation invalid or expired' },
  /** Platform lock-out guard (PLN-260824-Admin-Account-Invite). */
  LAST_SUPER_ADMIN: {
    code: 'E2004',
    message: 'The last active super admin cannot be deactivated',
  },

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
  // E5035-E5041 — chat attachments (PLN-260814).
  ATTACHMENT_NOT_FOUND: { code: 'E5035', message: 'Attachment not found' },
  ATTACHMENT_TYPE_NOT_ALLOWED: { code: 'E5036', message: 'File type is not allowed' },
  ATTACHMENT_TOO_LARGE: { code: 'E5037', message: 'File exceeds the size limit' },
  ATTACHMENT_LIMIT_EXCEEDED: { code: 'E5038', message: 'Too many attachments' },
  /** Signature mismatch or expired link — the download route's only 401. */
  ATTACHMENT_URL_INVALID: { code: 'E5039', message: 'Attachment link is invalid or expired' },
  ATTACHMENT_STORAGE_FAILED: { code: 'E5040', message: 'Attachment storage failed' },
  ATTACHMENT_CHANNEL_UNSUPPORTED: {
    code: 'E5041',
    message: 'This channel cannot deliver attachments',
  },
  // E5042-E5044 — HEIC/HEIF conversion (PLN-260817).
  ATTACHMENT_DECODE_FAILED: { code: 'E5042', message: 'Image could not be processed' },
  ATTACHMENT_PIXELS_EXCEEDED: { code: 'E5043', message: 'Image resolution exceeds the limit' },
  /** Decode pool saturated — a retry is the right answer, so it is not a 4xx. */
  ATTACHMENT_BUSY: { code: 'E5044', message: 'Image processing is busy, please retry' },

  // E5045-E5046 — Cafe24 mall/tenant binding guards (REQ-260819).
  /** The mall being connected is not the one this tenant's storefront runs on. */
  CAFE24_MALL_TENANT_MISMATCH: {
    code: 'E5045',
    message: 'Cafe24 mall does not match this store domain',
  },
  /** Another tenant already owns this mall — two owners make lookups ambiguous. */
  CAFE24_MALL_ALREADY_CONNECTED: {
    code: 'E5046',
    message: 'This Cafe24 mall is already connected to another store',
  },

  // E5047-E5048 — embed SDK (PLN-260819).
  /** The page embedding the widget is not on the tenant's allowlist. */
  EMBED_ORIGIN_NOT_ALLOWED: { code: 'E5047', message: 'This site is not allowed to embed the widget' },
  /** identify() signature did not verify — the visitor stays a guest. */
  EMBED_IDENTITY_INVALID: { code: 'E5048', message: 'Identity signature is invalid' },

  // E5049 — widget branding (PLN-260819 S4).
  /** Logo upload refused: wrong format, too large, or unreadable. */
  WIDGET_LOGO_REJECTED: { code: 'E5049', message: 'Logo could not be accepted' },

  // E5050-E5052 — AI agents (PLN-260820-Multi-AI-Agent-Personas).
  AI_AGENT_NOT_FOUND: { code: 'E5050', message: 'AI agent not found' },
  /** The default agent is the routing fallback — it cannot be deleted or deactivated. */
  AI_AGENT_DEFAULT_LOCKED: {
    code: 'E5051',
    message: 'The default AI agent cannot be deleted or deactivated',
  },
  AI_AGENT_CODE_TAKEN: { code: 'E5052', message: 'An AI agent with this code already exists' },

  // E5053-E5055 — livechat comments & on-demand briefing (PLN-260824).
  COMMENT_NOT_FOUND: { code: 'E5053', message: 'Comment not found' },
  /** Editing is author-only; deleting is author-or-master. */
  COMMENT_FORBIDDEN: { code: 'E5054', message: 'You cannot modify this comment' },
  /** The model call failed — distinct from "no briefing generated yet". */
  BRIEFING_FAILED: { code: 'E5055', message: 'Briefing generation failed' },

  // E5056-E5058 — session grouping / timeline·project (PLN-260824-Session-Grouping).
  GROUP_NOT_FOUND: { code: 'E5056', message: 'Chat group not found' },
  /** A group below two members is meaningless — dissolve it instead. */
  GROUP_MIN_MEMBERS: { code: 'E5057', message: 'A chat group needs at least two member sessions' },
  /** Send target must be a member session on a channel that can receive. */
  GROUP_RECIPIENT_INVALID: {
    code: 'E5058',
    message: 'Recipient is not a member of this group or cannot receive messages',
  },

  // E9xxx — system
  INTERNAL_ERROR: { code: 'E9001', message: 'Internal server error' },
  EXTERNAL_SERVICE_ERROR: { code: 'E9002', message: 'External service error' },
} as const;

export type ErrorCodeEntry = { code: string; message: string };
