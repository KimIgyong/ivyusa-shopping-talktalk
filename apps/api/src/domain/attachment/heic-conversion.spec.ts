import { HttpStatus } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync } from 'fs';
import { AttachmentService, UploadInput, UploadOwner } from './attachment.service';
import { ImageDecodeService } from './image-decode.service';
import { resolveType, withExtension } from './file-type.util';
import { BusinessException } from '../../global/exception/business.exception';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/**
 * HEIC acceptance (PLN-260817). The fixture is a synthetic gradient encoded to
 * HEIC by the platform encoder — the same HEVC coding an iPhone produces, which
 * is exactly what sharp's prebuilt libvips cannot read on its own.
 */
const FIXTURE = join(__dirname, '__fixtures__', 'sample.heic');

function serviceWith(decoder?: ImageDecodeService, dir?: string) {
  const saved: Record<string, unknown>[] = [];
  const repo = {
    create: (v: Record<string, unknown>) => v,
    save: async (v: Record<string, unknown>) => {
      saved.push(v);
      return { id: 1, ...v };
    },
    count: async () => 0,
  };
  const config = {
    get: (key: string, fallback?: unknown) => (key === 'UPLOAD_DIR' ? dir : fallback),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new AttachmentService(repo as any, config as any, decoder);
  return { service, saved };
}

const OWNER: UploadOwner = {
  tenantId: 7,
  conversationId: 11,
  sessionId: null,
  uploaderType: 'user',
  source: 'widget',
};

async function upload(name = 'IMG_0001.HEIC', mime = 'image/heic'): Promise<UploadInput> {
  const buffer = await fs.readFile(FIXTURE);
  return { originalname: name, mimetype: mime, size: buffer.length, buffer };
}

describe('HEIC attachments — type policy', () => {
  it('accepts a real HEIC by its ftyp brand', async () => {
    const file = await upload();
    const type = resolveType(file.originalname, file.mimetype, file.buffer.subarray(0, 64));
    expect(type).toEqual({
      ext: 'heic',
      mime: 'image/heic',
      kind: 'image',
      decoder: 'heif',
    });
  });

  it('accepts image/heif as the declared type for a .heic upload', async () => {
    const file = await upload('IMG_0001.heic', 'image/heif');
    expect(resolveType(file.originalname, file.mimetype, file.buffer.subarray(0, 64))).not.toBeNull();
  });

  it('rejects a PNG wearing a .heic name', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(resolveType('fake.heic', '', png)).toBeNull();
  });

  it('rejects an MP4 renamed to .heic — same ftyp header, different brand', () => {
    // isom major + the usual MP4 compatible list; none of it is HEIF.
    const mp4 = Buffer.concat([
      Buffer.from([0, 0, 0, 0x1c]),
      Buffer.from('ftypisom', 'latin1'),
      Buffer.from([0, 0, 2, 0]),
      Buffer.from('isomiso2mp41', 'latin1'),
    ]);
    expect(resolveType('clip.heic', '', mp4)).toBeNull();
    expect(resolveType('clip.avif', '', mp4)).toBeNull();
  });

  it('accepts an AVIF that declares its brand only as compatible', () => {
    // Some encoders write mif1 as the major brand and avif further down the list.
    const avif = Buffer.concat([
      Buffer.from([0, 0, 0, 0x1c]),
      Buffer.from('ftypmif1', 'latin1'),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('mif1avifmiaf', 'latin1'),
    ]);
    expect(resolveType('pic.avif', 'image/avif', avif)).toMatchObject({ ext: 'avif', storeAs: 'jpg' });
  });

  it('keeps the display name consistent with the stored bytes', () => {
    expect(withExtension('IMG_0001.HEIC', 'jpg')).toBe('IMG_0001.jpg');
    expect(withExtension('photo.jpg', 'jpg')).toBe('photo.jpg');
    expect(withExtension('noextension', 'jpg')).toBe('noextension.jpg');
  });
});

describe('HEIC attachments — conversion', () => {
  let dir: string;
  let decoder: ImageDecodeService;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'ivy-heic-'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    decoder = new ImageDecodeService({ get: (_k: string, d: unknown) => d } as any);
  });

  afterAll(async () => {
    await decoder.onModuleDestroy();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('stores a HEIC as JPEG, with a thumbnail and no EXIF', async () => {
    const { service, saved } = serviceWith(decoder, dir);
    const row = await service.store(await upload(), OWNER);

    expect(row.mime).toBe('image/jpeg');
    expect(row.filename).toBe('IMG_0001.jpg');
    expect(row.storagePath).toMatch(/^7\/\d{6}\/[0-9a-f-]+\.jpg$/);
    expect(row.thumbPath).toMatch(/_t\.webp$/);
    expect(row.width).toBe(640);
    expect(row.height).toBe(480);

    const bytes = await fs.readFile(join(dir, row.storagePath));
    // JPEG magic — the stored file is the conversion, not the upload.
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(row.size).toBe(bytes.length);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sharp = require('sharp');
    const meta = await sharp(bytes).metadata();
    expect(meta.format).toBe('jpeg');
    // The source carries an Exif box; re-encoding is what removes it, and this
    // is the assertion that keeps a "store it as uploaded" fallback from ever
    // quietly reintroducing the shopper's location data.
    expect(meta.exif).toBeUndefined();
    expect(saved).toHaveLength(1);
  }, 30_000);

  it('rejects an image over the pixel cap without writing anything', async () => {
    // 0.1MP cap — the 640x480 fixture is 0.3MP.
    const capped = new ImageDecodeService({
      get: (k: string, d: unknown) => (k === 'ATTACHMENT_MAX_MEGAPIXELS' ? 0.1 : d),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    try {
      const { service, saved } = serviceWith(capped, dir);
      await expect(service.store(await upload(), OWNER)).rejects.toMatchObject({
        errorCode: ERROR_CODE.ATTACHMENT_PIXELS_EXCEEDED.code,
      });
      expect(saved).toHaveLength(0);
    } finally {
      // This pool is separate from the shared one; leaving it running would
      // hold worker threads open past the test.
      await capped.onModuleDestroy();
    }
  }, 30_000);

  it('rejects rather than queueing without limit when the pool is saturated', async () => {
    const tiny = new ImageDecodeService({
      get: (k: string, d: unknown) =>
        k === 'HEIC_MAX_QUEUE' ? 1 : k === 'HEIC_WORKERS' ? 1 : d,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    try {
      const { service } = serviceWith(tiny, dir);
      const results = await Promise.allSettled([
        service.store(await upload('q1.heic'), OWNER),
        service.store(await upload('q2.heic'), OWNER),
        service.store(await upload('q3.heic'), OWNER),
      ]);
      const busy = results.filter(
        (r) => r.status === 'rejected' && r.reason?.errorCode === ERROR_CODE.ATTACHMENT_BUSY.code,
      );
      // One runs, one waits, the rest are turned away instead of piling up.
      expect(busy.length).toBeGreaterThan(0);
    } finally {
      await tiny.onModuleDestroy();
    }
  }, 30_000);

  it('flattens transparency instead of turning it black', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sharp = require('sharp');
    const transparent = await sharp({
      create: { width: 32, height: 32, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } },
    })
      .avif({ quality: 40 })
      .toBuffer();

    const { service } = serviceWith(decoder, dir);
    const row = await service.store(
      { originalname: 'clear.avif', mimetype: 'image/avif', size: transparent.length, buffer: transparent },
      OWNER,
    );

    const bytes = await fs.readFile(join(dir, row.storagePath));
    const { data } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
    // White, not the near-black a bare .jpeg() would have produced.
    expect(data[0]).toBeGreaterThan(200);
    expect(data[1]).toBeGreaterThan(200);
    expect(data[2]).toBeGreaterThan(200);
  }, 30_000);

  it('refuses a corrupt HEIC rather than storing the original bytes', async () => {
    const { service, saved } = serviceWith(decoder, dir);
    const file = await upload();
    // Keep the header (so it still resolves as HEIC) and destroy the payload.
    file.buffer.fill(0, 64);

    await expect(service.store(file, OWNER)).rejects.toBeInstanceOf(BusinessException);
    expect(saved).toHaveLength(0);
  }, 30_000);

  it('is fail-closed when no decoder is wired in', async () => {
    const { service } = serviceWith(undefined, dir);
    await expect(service.store(await upload(), OWNER)).rejects.toMatchObject({
      errorCode: ERROR_CODE.ATTACHMENT_DECODE_FAILED.code,
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('honours the kill switch', async () => {
    const repo = {
      create: (v: Record<string, unknown>) => v,
      save: async (v: Record<string, unknown>) => v,
      count: async () => 0,
    };
    const config = {
      get: (key: string, fallback?: unknown) => {
        if (key === 'ATTACHMENT_ALLOW_HEIC') return 'false';
        if (key === 'UPLOAD_DIR') return dir;
        return fallback;
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new AttachmentService(repo as any, config as any, decoder);
    await expect(service.store(await upload(), OWNER)).rejects.toMatchObject({
      errorCode: ERROR_CODE.ATTACHMENT_TYPE_NOT_ALLOWED.code,
    });
  });

  it('stores an AVIF as JPEG rather than paying for AV1 encoding', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sharp = require('sharp');
    const avif = await sharp({
      create: { width: 64, height: 48, channels: 3, background: { r: 10, g: 120, b: 200 } },
    })
      .avif({ quality: 40 })
      .toBuffer();

    const { service } = serviceWith(decoder, dir);
    const row = await service.store(
      { originalname: 'shot.avif', mimetype: 'image/avif', size: avif.length, buffer: avif },
      OWNER,
    );

    expect(row.mime).toBe('image/jpeg');
    expect(row.filename).toBe('shot.jpg');
    const bytes = await fs.readFile(join(dir, row.storagePath));
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  }, 30_000);

  it('runs concurrent decodes through a pool that stays bounded', async () => {
    const pooled = new ImageDecodeService({
      get: (k: string, d: unknown) => (k === 'HEIC_WORKERS' ? 2 : d),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    try {
      const { service } = serviceWith(pooled, dir);
      const rows = await Promise.all([
        service.store(await upload('a.heic'), OWNER),
        service.store(await upload('b.heic'), OWNER),
        service.store(await upload('c.heic'), OWNER),
        service.store(await upload('d.heic'), OWNER),
      ]);
      expect(rows.map((r) => r.filename)).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
      for (const row of rows) {
        await expect(fs.stat(join(dir, row.storagePath))).resolves.toBeDefined();
      }
      // Four uploads, never more than two workers — the point of the pool. Four
      // files landing proves nothing about that on its own.
      expect(pooled.workerCount).toBeLessThanOrEqual(2);
    } finally {
      await pooled.onModuleDestroy();
    }
  }, 60_000);
});
