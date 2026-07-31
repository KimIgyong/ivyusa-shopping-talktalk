import { Injectable, Logger } from '@nestjs/common';
import {
  PushMessage,
  PushProvider,
  PushReceipt,
  PushTicket,
} from './push-provider.interface';

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
/** Expo hard limit per send request. */
const CHUNK_SIZE = 100;

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Expo Push Service provider (PLN-MobileApp D-2). Sends via HTTP (no SDK dep);
 * `EXPO_PUSH_ACCESS_TOKEN` (optional) enables enhanced security mode. Network
 * errors are logged and returned as failed tickets — never thrown (the in-app
 * notification row is the delivery fallback).
 */
@Injectable()
export class ExpoPushProvider implements PushProvider {
  private readonly logger = new Logger(ExpoPushProvider.name);

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json',
    };
    const token = process.env.EXPO_PUSH_ACCESS_TOKEN;
    if (token) headers.authorization = `Bearer ${token}`;
    return headers;
  }

  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    const tickets: PushTicket[] = [];
    for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
      const chunk = messages.slice(i, i + CHUNK_SIZE);
      try {
        const res = await fetch(EXPO_SEND_URL, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify(
            chunk.map((m) => ({
              to: m.to,
              title: m.title,
              body: m.body ?? undefined,
              data: m.data ?? undefined,
              badge: m.badge,
              sound: 'default',
            })),
          ),
        });
        if (!res.ok) {
          this.logger.warn(`expo send HTTP ${res.status}`);
          tickets.push(...chunk.map((m) => this.failedTicket(m.to, `http_${res.status}`)));
          continue;
        }
        const json = (await res.json()) as { data?: ExpoTicket[] };
        const data = json.data ?? [];
        chunk.forEach((m, idx) => {
          const t = data[idx];
          if (!t) {
            tickets.push(this.failedTicket(m.to, 'missing_ticket'));
          } else if (t.status === 'ok') {
            tickets.push({ token: m.to, ok: true, shouldRevoke: false, receiptId: t.id });
          } else {
            tickets.push({
              token: m.to,
              ok: false,
              shouldRevoke: t.details?.error === 'DeviceNotRegistered',
              error: t.details?.error ?? t.message ?? 'unknown',
            });
          }
        });
      } catch (err) {
        this.logger.warn(`expo send failed: ${String(err)}`);
        tickets.push(...chunk.map((m) => this.failedTicket(m.to, 'network_error')));
      }
    }
    return tickets;
  }

  async getReceipts(receiptIds: string[]): Promise<PushReceipt[]> {
    const receipts: PushReceipt[] = [];
    for (let i = 0; i < receiptIds.length; i += CHUNK_SIZE) {
      const chunk = receiptIds.slice(i, i + CHUNK_SIZE);
      try {
        const res = await fetch(EXPO_RECEIPTS_URL, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({ ids: chunk }),
        });
        if (!res.ok) {
          this.logger.warn(`expo receipts HTTP ${res.status}`);
          continue;
        }
        const json = (await res.json()) as { data?: Record<string, ExpoTicket> };
        for (const [id, r] of Object.entries(json.data ?? {})) {
          receipts.push({
            receiptId: id,
            ok: r.status === 'ok',
            shouldRevoke: r.details?.error === 'DeviceNotRegistered',
            error: r.status === 'ok' ? undefined : (r.details?.error ?? r.message ?? 'unknown'),
          });
        }
      } catch (err) {
        this.logger.warn(`expo receipts failed: ${String(err)}`);
      }
    }
    return receipts;
  }

  private failedTicket(token: string, error: string): PushTicket {
    return { token, ok: false, shouldRevoke: false, error };
  }
}
