import { generateKeyPairSync } from 'node:crypto';
import { DriveAuthError, DriveRequestError, GdriveClient, GOOGLE_DOC } from './gdrive.client';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const sa = { clientEmail: 'kb@proj.iam.gserviceaccount.com', privateKey: privateKey as string };

const jsonRes = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response;
const textRes = (body: string, ok = true, status = 200) =>
  ({ ok, status, text: async () => body }) as Response;

describe('GdriveClient.getAccessToken', () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('exchanges a signed JWT for a token', async () => {
    fetchMock.mockResolvedValue(jsonRes({ access_token: 'tok-1', expires_in: 3600 }));
    const token = await new GdriveClient().getAccessToken(sa);
    expect(token).toBe('tok-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const [header, claims] = (body.get('assertion') as string).split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    });
    const parsed = JSON.parse(Buffer.from(claims, 'base64url').toString());
    expect(parsed.iss).toBe(sa.clientEmail);
    // Read-only: a mistake here must not be able to modify a tenant's files.
    expect(parsed.scope).toBe('https://www.googleapis.com/auth/drive.readonly');
  });

  it('reuses a cached token instead of signing every call', async () => {
    fetchMock.mockResolvedValue(jsonRes({ access_token: 'tok-1', expires_in: 3600 }));
    const client = new GdriveClient();
    await client.getAccessToken(sa, 1_000);
    await client.getAccessToken(sa, 2_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes a minute before expiry', async () => {
    // A token that expires mid-sync fails the run for no reason an operator
    // could act on.
    fetchMock.mockResolvedValue(jsonRes({ access_token: 'tok', expires_in: 3600 }));
    const client = new GdriveClient();
    await client.getAccessToken(sa, 0);
    await client.getAccessToken(sa, 3_600_000 - 59_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails on a malformed key before making any request', async () => {
    await expect(
      new GdriveClient().getAccessToken({ clientEmail: 'a@b.c', privateKey: 'not-a-pem' }),
    ).rejects.toThrow(DriveAuthError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes through Google's wording when the token is refused", async () => {
    // A disabled Drive API and a deleted key look the same here; guessing a
    // friendlier message would hide which one it is.
    fetchMock.mockResolvedValue(jsonRes({ error: 'invalid_grant' }, false, 400));
    await expect(new GdriveClient().getAccessToken(sa)).rejects.toThrow(/invalid_grant/);
  });

  it('rejects a 200 that carries no token', async () => {
    fetchMock.mockResolvedValue(jsonRes({ expires_in: 3600 }));
    await expect(new GdriveClient().getAccessToken(sa)).rejects.toThrow(/no access_token/);
  });
});

describe('GdriveClient.listFolder', () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('follows pagination to the end', async () => {
    // A folder larger than one page would otherwise look like it shrank, and
    // the pipeline would hide everything past the first 200 files.
    fetchMock
      .mockResolvedValueOnce(jsonRes({ files: [{ id: '1', name: 'a', mimeType: GOOGLE_DOC }], nextPageToken: 'p2' }))
      .mockResolvedValueOnce(jsonRes({ files: [{ id: '2', name: 'b', mimeType: GOOGLE_DOC }] }));
    const files = await new GdriveClient().listFolder('tok', 'folder-1');
    expect(files.map((f) => f.id)).toEqual(['1', '2']);
    expect(fetchMock.mock.calls[1][0]).toContain('pageToken=p2');
  });

  it('scopes the query to the folder and skips trash', async () => {
    fetchMock.mockResolvedValue(jsonRes({ files: [] }));
    await new GdriveClient().listFolder('tok', 'folder-1');
    // URLSearchParams encodes spaces as '+', which decodeURIComponent leaves alone.
    const url = decodeURIComponent((fetchMock.mock.calls[0][0] as string).replace(/\+/g, ' '));
    expect(url).toContain("'folder-1' in parents");
    expect(url).toContain('trashed = false');
  });

  it('reports a failed listing rather than returning nothing', async () => {
    // Returning [] on an error would read as "the folder is empty" — the exact
    // confusion the pipeline's empty-listing guard exists to prevent.
    fetchMock.mockResolvedValue(textRes('forbidden', false, 403));
    await expect(new GdriveClient().listFolder('tok', 'f')).rejects.toThrow(DriveRequestError);
  });
});

describe('GdriveClient.readFile', () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('exports a Google Doc as plain text', async () => {
    fetchMock.mockResolvedValue(textRes('Return policy: 30 days.'));
    const text = await new GdriveClient().readFile('tok', { id: 'd1', name: 'Policy', mimeType: GOOGLE_DOC });
    expect(text).toBe('Return policy: 30 days.');
    expect(fetchMock.mock.calls[0][0]).toContain('/export?mimeType=text%2Fplain');
  });

  it('downloads a text or markdown file directly', async () => {
    fetchMock.mockResolvedValue(textRes('# Notes'));
    const text = await new GdriveClient().readFile('tok', { id: 'd2', name: 'n.md', mimeType: 'text/markdown' });
    expect(text).toBe('# Notes');
    expect(fetchMock.mock.calls[0][0]).toContain('alt=media');
  });

  it('returns null for a type carrying no indexable text', async () => {
    for (const mimeType of ['application/pdf', 'image/png', 'application/vnd.google-apps.spreadsheet']) {
      expect(await new GdriveClient().readFile('tok', { id: 'x', name: 'x', mimeType })).toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('agrees with isSupported about what it will read', () => {
    expect(GdriveClient.isSupported(GOOGLE_DOC)).toBe(true);
    expect(GdriveClient.isSupported('text/plain')).toBe(true);
    expect(GdriveClient.isSupported('text/markdown')).toBe(true);
    expect(GdriveClient.isSupported('application/pdf')).toBe(false);
    expect(GdriveClient.isSupported('application/vnd.google-apps.folder')).toBe(false);
  });
});
