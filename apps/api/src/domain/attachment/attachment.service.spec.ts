import { promises as fs } from 'fs';
import { join, sep } from 'path';
import { tmpdir } from 'os';
import { AttachmentService, UploadInput, UploadOwner } from './attachment.service';
import { MessageAttachment } from './entity/message-attachment.entity';
import { BusinessException } from '../../global/exception/business.exception';

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function upload(over: Partial<UploadInput> = {}): UploadInput {
  return {
    originalname: 'photo.png',
    mimetype: 'image/png',
    size: PNG_1x1.length,
    buffer: PNG_1x1,
    ...over,
  };
}

const OWNER: UploadOwner = {
  tenantId: 1,
  conversationId: null,
  sessionId: 9,
  uploaderType: 'user',
  source: 'widget',
};

/**
 * Storage-level behaviour: what reaches the disk, what never does, and what is
 * removed again. The repository is faked so each test can assert on rows and on
 * real files in a scratch UPLOAD_DIR.
 */
describe('AttachmentService', () => {
  let root: string;
  let rows: MessageAttachment[];
  let nextId: number;

  function build(config: Record<string, unknown> = {}) {
    rows = [];
    nextId = 1;
    const repo = {
      create: (r: Partial<MessageAttachment>) => r as MessageAttachment,
      save: jest.fn(async (r: MessageAttachment) => {
        const saved = { ...r, id: nextId++, createdAt: r.createdAt ?? new Date() };
        rows.push(saved);
        return saved;
      }),
      count: jest.fn(async () => rows.filter((r) => r.messageId == null).length),
      find: jest.fn(async () => rows),
      findOne: jest.fn(async () => rows[0] ?? null),
      update: jest.fn(async () => ({ affected: 1 })),
      delete: jest.fn(async () => ({ affected: rows.length })),
    };
    const configService = {
      get: (key: string, fallback: unknown) =>
        key === 'UPLOAD_DIR' ? root : ((config[key] as unknown) ?? fallback),
    };
    const svc = new AttachmentService(repo as never, configService as never);
    return { svc, repo };
  }

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'ivy-attach-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('stores an image under the tenant, with a thumbnail and dimensions', async () => {
    const { svc } = build();
    const saved = await svc.store(upload(), OWNER);

    expect(saved.storagePath.startsWith(`1${sep}`)).toBe(true);
    expect(saved.kind).toBe('image');
    expect(saved.mime).toBe('image/png');
    expect(saved.width).toBe(1);
    await expect(fs.stat(join(root, saved.storagePath))).resolves.toBeDefined();
    // sharp is a dependency here, so the thumbnail is expected — but the code
    // degrades to null if the native binary is ever missing (PLN §11).
    expect(saved.thumbPath).toBeTruthy();
    await expect(fs.stat(join(root, saved.thumbPath as string))).resolves.toBeDefined();
  });

  it('names the file by uuid, never by what the customer called it', async () => {
    const { svc } = build();
    const saved = await svc.store(upload({ originalname: '../../escape.png' }), OWNER);
    expect(saved.storagePath).toContain(saved.uuid);
    expect(saved.storagePath).not.toContain('..');
    // The original name survives for display only.
    expect(saved.filename).toBe('escape.png');
  });

  it('writes nothing when the type is rejected', async () => {
    const { svc, repo } = build();
    const elf = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
    await expect(
      svc.store(upload({ originalname: 'x.png', buffer: elf, size: elf.length }), OWNER),
    ).rejects.toBeInstanceOf(BusinessException);
    expect(repo.save).not.toHaveBeenCalled();
    await expect(fs.readdir(root)).resolves.toEqual([]);
  });

  it('rejects an image over the configured limit', async () => {
    const { svc } = build({ ATTACHMENT_MAX_IMAGE_MB: 0.00001 });
    await expect(svc.store(upload(), OWNER)).rejects.toBeInstanceOf(BusinessException);
    await expect(fs.readdir(root)).resolves.toEqual([]);
  });

  it('caps how many uploads one session can park unsent', async () => {
    const { svc, repo } = build();
    repo.count = jest.fn(async () => 20);
    await expect(svc.store(upload(), OWNER)).rejects.toBeInstanceOf(BusinessException);
  });

  it('refuses to read outside the upload root even if a stored path says so', () => {
    const { svc } = build();
    expect(() =>
      svc.openStream({ storagePath: '../../etc/passwd', thumbPath: null } as MessageAttachment, 'full'),
    ).toThrow(BusinessException);
  });

  it('deletes the files along with the rows', async () => {
    const { svc } = build();
    const saved = await svc.store(upload(), OWNER);
    const deleted = await svc.deleteByIds([Number(saved.id)]);

    expect(deleted).toBe(1);
    await expect(fs.stat(join(root, saved.storagePath))).rejects.toThrow();
    await expect(fs.stat(join(root, saved.thumbPath as string))).rejects.toThrow();
  });

  it('treats an already-missing file as deleted rather than an error', async () => {
    const { svc } = build();
    const saved = await svc.store(upload(), OWNER);
    await fs.rm(join(root, saved.storagePath));
    await expect(svc.deleteByIds([Number(saved.id)])).resolves.toBe(1);
  });

  it('only claims unattached rows of the same tenant and session', async () => {
    const { svc, repo } = build();
    repo.find = jest.fn(async () => [
      { id: 1, uuid: 'a', sessionId: 9, messageId: null } as MessageAttachment,
      { id: 2, uuid: 'b', sessionId: 77, messageId: null } as MessageAttachment,
    ]);

    const claimed = await svc.attachToMessage(['a', 'b'], {
      tenantId: 1,
      messageId: 100,
      conversationId: 5,
      sessionId: 9,
    });

    // 'b' belongs to another session — replaying its id must attach nothing.
    expect(claimed.map((c) => c.uuid)).toEqual(['a']);
    expect(claimed[0].messageId).toBe(100);
  });

  it('ignores an empty id list without touching the database', async () => {
    const { svc, repo } = build();
    await expect(
      svc.attachToMessage([], { tenantId: 1, messageId: 1, conversationId: 1 }),
    ).resolves.toEqual([]);
    expect(repo.update).not.toHaveBeenCalled();
  });
});
