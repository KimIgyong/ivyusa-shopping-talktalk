/**
 * Minimal Gorgias REST client for the L1 connector (PLN-260808-Issue-Workflow-P2,
 * REQ §11.2.1). Basic auth = account email + REST API key on the account
 * subdomain. Create-only + message append; webhooks (L2) come later. Throws on
 * failure — the calling service decides retry/skip (never the chat path).
 */

const TIMEOUT_MS = 8000;

export interface GorgiasConfig {
  subdomain: string;
  email: string;
  apiKey: string;
}

export interface GorgiasMessage {
  fromAgent: boolean;
  bodyText: string;
  createdAt?: string; // ISO — preserves the original conversation timestamps
}

function baseUrl(cfg: GorgiasConfig): string {
  const sub = cfg.subdomain
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\.gorgias\.com.*$/i, '')
    .replace(/\/+$/, '');
  return `https://${sub}.gorgias.com/api`;
}

function authHeader(cfg: GorgiasConfig): string {
  return `Basic ${Buffer.from(`${cfg.email.trim()}:${cfg.apiKey.trim()}`).toString('base64')}`;
}

async function request<T>(cfg: GorgiasConfig, method: string, path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl(cfg)}${path}`, {
      method,
      headers: {
        Authorization: authHeader(cfg),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      throw new Error(`Gorgias ${method} ${path} → ${res.status} ${detail}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function toApiMessage(m: GorgiasMessage, customerEmail: string) {
  return {
    channel: 'api',
    via: 'api',
    from_agent: m.fromAgent,
    body_text: m.bodyText,
    ...(m.createdAt ? { created_datetime: m.createdAt } : {}),
    // Direction bookkeeping: Gorgias matches the customer by email (dedup) —
    // sender only on customer-side messages so replies thread correctly.
    ...(m.fromAgent ? {} : { sender: { email: customerEmail } }),
  };
}

/** Create a ticket with the packaged transcript; returns the Gorgias ticket id. */
export async function createGorgiasTicket(
  cfg: GorgiasConfig,
  input: {
    customerEmail: string;
    subject: string;
    messages: GorgiasMessage[];
    tags: string[];
  },
): Promise<string> {
  const res = await request<{ id: number }>(cfg, 'POST', '/tickets', {
    channel: 'api',
    via: 'api',
    status: 'open',
    subject: input.subject.slice(0, 200),
    customer: { email: input.customerEmail },
    tags: input.tags.map((name) => ({ name })),
    messages: input.messages.map((m) => toApiMessage(m, input.customerEmail)),
  });
  return String(res.id);
}

/** Append one message to an existing ticket (re-escalation, 결정 12 L1). */
export async function appendGorgiasMessage(
  cfg: GorgiasConfig,
  ticketId: string,
  customerEmail: string,
  message: GorgiasMessage,
): Promise<void> {
  await request(cfg, 'POST', `/tickets/${ticketId}/messages`, toApiMessage(message, customerEmail));
}
