import { Injectable, Logger } from '@nestjs/common';
import { createSign } from 'node:crypto';
import { GoogleServiceAccount } from './gdrive-credential.util';

/**
 * Minimal Google Drive read client (PLN-260815 G2).
 *
 * No SDK: the repo already talks to Cafe24 and Shopify with plain `fetch`, and
 * a service-account token is a signed JWT swapped for an access token — two
 * requests. Pulling in googleapis for that would add a large dependency for
 * code that fits on a screen.
 *
 * Read-only by design: the scope requested is `drive.readonly`, so a mistake
 * here cannot modify a tenant's documents.
 */
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

/** MIME types worth turning into knowledge (D11). */
export const GOOGLE_DOC = 'application/vnd.google-apps.document';
export const GOOGLE_FOLDER = 'application/vnd.google-apps.folder';
const PLAIN_TEXT = new Set(['text/plain', 'text/markdown', 'text/x-markdown']);

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

export class DriveAuthError extends Error {}
export class DriveRequestError extends Error {}

const base64url = (input: Buffer | string): string =>
  Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

@Injectable()
export class GdriveClient {
  private readonly logger = new Logger(GdriveClient.name);
  /** Tokens live an hour; caching avoids a signature per file listing. */
  private cache = new Map<string, { token: string; expiresAt: number }>();

  async getAccessToken(sa: GoogleServiceAccount, now = Date.now()): Promise<string> {
    const cached = this.cache.get(sa.clientEmail);
    // Refresh a minute early: a token that expires mid-sync fails the run for
    // no reason a operator could act on.
    if (cached && cached.expiresAt - 60_000 > now) return cached.token;

    const iat = Math.floor(now / 1000);
    const claims = {
      iss: sa.clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat,
      exp: iat + 3600,
    };
    const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(
      JSON.stringify(claims),
    )}`;

    let assertion: string;
    try {
      const signer = createSign('RSA-SHA256');
      signer.update(unsigned);
      assertion = `${unsigned}.${base64url(signer.sign(sa.privateKey))}`;
    } catch (e) {
      // A malformed PEM fails here, long before any HTTP call; say so plainly.
      throw new DriveAuthError(`could not sign with the service account key: ${(e as Error).message}`);
    }

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // The token endpoint reports a disabled Drive API and a deleted key the
      // same way; pass Google's own wording through rather than guessing.
      throw new DriveAuthError(`token request failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new DriveAuthError('token response had no access_token');

    this.cache.set(sa.clientEmail, {
      token: json.access_token,
      expiresAt: now + (json.expires_in ?? 3600) * 1000,
    });
    return json.access_token;
  }

  /** Every supported file directly in a folder, following pagination. */
  async listFolder(token: string, folderId: string): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType)',
        pageSize: '200',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const json = await this.request<{ files?: DriveFile[]; nextPageToken?: string }>(
        token,
        `${DRIVE_API}/files?${params.toString()}`,
      );
      files.push(...(json.files ?? []));
      pageToken = json.nextPageToken;
    } while (pageToken);
    return files;
  }

  /** Text of a file, or null when the type carries no text worth indexing. */
  async readFile(token: string, file: DriveFile): Promise<string | null> {
    if (file.mimeType === GOOGLE_DOC) {
      return this.requestText(
        token,
        `${DRIVE_API}/files/${file.id}/export?mimeType=${encodeURIComponent('text/plain')}`,
      );
    }
    if (PLAIN_TEXT.has(file.mimeType)) {
      return this.requestText(token, `${DRIVE_API}/files/${file.id}?alt=media`);
    }
    return null;
  }

  static isSupported(mimeType: string): boolean {
    return mimeType === GOOGLE_DOC || PLAIN_TEXT.has(mimeType);
  }

  private async request<T>(token: string, url: string): Promise<T> {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new DriveRequestError(`drive request failed (${res.status}): ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  private async requestText(token: string, url: string): Promise<string> {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new DriveRequestError(`drive read failed (${res.status}): ${body.slice(0, 200)}`);
    }
    return res.text();
  }
}
