import { BoardAttachmentService } from './board-attachment.service';

jest.mock('fs/promises', () => ({
  mkdir: jest.fn(async () => undefined),
  writeFile: jest.fn(async () => undefined),
  unlink: jest.fn(async () => undefined),
}));

describe('BoardAttachmentService', () => {
  function build() {
    const rows: Array<Record<string, unknown>> = [];
    let nextId = 1;
    const repo = {
      find: jest.fn(async () => rows),
      findOne: jest.fn(async ({ where }: any) => {
        if (where.storagePath !== undefined) {
          return rows.find((r) => r.storagePath === where.storagePath) ?? null;
        }
        return rows.find((r) => String(r.id) === String(where.id) || r.uuid === where.uuid) ?? null;
      }),
      create: (d: Record<string, unknown>) => d,
      save: jest.fn(async (d: Record<string, unknown>) => {
        const row = { id: nextId++, ...d };
        rows.push(row);
        return row;
      }),
      delete: jest.fn(async ({ id }: any) => {
        const i = rows.findIndex((r) => String(r.id) === String(id));
        if (i >= 0) rows.splice(i, 1);
      }),
    };
    const config = { get: (_k: string, d: string) => d };
    const svc = new BoardAttachmentService(repo as never, config as never);
    return { svc, rows };
  }

  const file = (name: string) => ({
    originalname: name,
    mimetype: 'application/octet-stream',
    size: 10,
    buffer: Buffer.from('x'),
  });

  it('stores the nine allowed formats and keys each by uuid', async () => {
    const h = build();
    const rows = await h.svc.upload(1, 5, [file('규정.pdf'), file('사진.webp'), file('백업.rar')], 7);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => typeof (r as any).uuid === 'string')).toBe(true);
    expect((rows[0] as any).storagePath).toContain('board/1/');
  });

  it('rejects a disallowed extension with the specific code', async () => {
    const h = build();
    await expect(h.svc.upload(1, 5, [file('script.exe')], 7)).rejects.toMatchObject({
      errorCode: 'E5071',
    });
    expect(h.rows).toHaveLength(0);
  });

  it('rejects more than 10 files in one request', async () => {
    const h = build();
    const many = Array.from({ length: 11 }, (_, i) => file(`f${i}.pdf`));
    await expect(h.svc.upload(1, 5, many, 7)).rejects.toMatchObject({ errorCode: 'E5072' });
  });

  it('link attachments accept only http(s) URLs', async () => {
    const h = build();
    const row = await h.svc.addLink(1, 5, 'https://drive.google.com/file/d/abc', '정책 원본', 7);
    expect(row).toMatchObject({ kind: 'link', filename: '정책 원본' });
    await expect(h.svc.addLink(1, 5, 'ftp://x/y', undefined, 7)).rejects.toMatchObject({
      errorCode: 'E5073',
    });
  });

  it('attachSharedCopy writes the bytes once and gives every document its own row', async () => {
    const h = build();
    const { writeFile } = jest.requireMock('fs/promises');
    (writeFile as jest.Mock).mockClear();
    const n = await h.svc.attachSharedCopy(
      1,
      [11, 12, 13],
      { filename: '원본.pdf', mime: 'application/pdf', buffer: Buffer.from('pdf') },
      7,
    );
    expect(n).toBe(3);
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(h.rows).toHaveLength(3);
    const paths = new Set(h.rows.map((r) => r.storagePath));
    expect(paths.size).toBe(1);
    expect(new Set(h.rows.map((r) => r.uuid)).size).toBe(3);
  });

  it('removing a shared attachment unlinks the file only at the LAST reference (P6-7)', async () => {
    const h = build();
    const { unlink } = jest.requireMock('fs/promises');
    (unlink as jest.Mock).mockClear();
    await h.svc.attachSharedCopy(
      1,
      [11, 12],
      { filename: '원본.pdf', mime: 'application/pdf', buffer: Buffer.from('pdf') },
      7,
    );
    const [first, second] = h.rows.map((r) => Number(r.id));
    await h.svc.remove(1, first);
    expect(unlink).not.toHaveBeenCalled();
    await h.svc.remove(1, second);
    expect(unlink).toHaveBeenCalledTimes(1);
  });

  it('signed download refuses a bad signature', async () => {
    const h = build();
    await expect(h.svc.openSigned('some-uuid', Math.floor(Date.now() / 1000) + 60, 'bogus')).rejects.toThrow();
  });
});
