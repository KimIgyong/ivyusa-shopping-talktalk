import { mkdtempSync, promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ConfigService } from '@nestjs/config';
import { WidgetLogoService } from './widget-logo.service';
import { ERROR_CODE } from '../../global/constant/error-code.constant';

/**
 * Brand mark storage (PLN-260819 S4 FR-T1). Real bytes through real sharp: the
 * checks that matter here are about what we refuse and what the re-encode
 * removes, and neither survives a mocked image pipeline.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');

function serviceIn(dir: string): WidgetLogoService {
  const config = {
    get: (key: string, fallback?: unknown) => (key === 'UPLOAD_DIR' ? dir : fallback),
  } as unknown as ConfigService;
  return new WidgetLogoService(config);
}

async function png(width = 240, height = 64): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 120, b: 220 } },
  })
    .png()
    .toBuffer();
}

function upload(buffer: Buffer, name = 'logo.png', mimetype = 'image/png') {
  return { originalname: name, mimetype, size: buffer.length, buffer };
}

describe('WidgetLogoService', () => {
  let dir: string;
  let service: WidgetLogoService;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'ivy-logo-'));
    service = serviceIn(dir);
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('stores a PNG under the tenant, outside the conversation tree', async () => {
    const logo = await service.store(7, upload(await png()));
    expect(logo).toMatchObject({ ext: 'png', mime: 'image/png', width: 240, height: 64 });
    // branding/, not the attachment path: retention and DSAR delete along the
    // conversation axis and must never reach a tenant's logo.
    await expect(fs.stat(join(dir, '7', 'branding', `${logo.id}.png`))).resolves.toBeDefined();
  }, 30_000);

  it('strips metadata by re-encoding', async () => {
    const withExif = await sharp({
      create: { width: 100, height: 40, channels: 3, background: '#fff' },
    })
      .withMetadata({ exif: { IFD0: { Copyright: 'someone' } } })
      .jpeg()
      .toBuffer();
    const logo = await service.store(7, upload(withExif, 'logo.jpg', 'image/jpeg'));
    const stored = await fs.readFile(join(dir, '7', 'branding', `${logo.id}.jpg`));
    expect((await sharp(stored).metadata()).exif).toBeUndefined();
  }, 30_000);

  it('fits an oversized logo instead of refusing it', async () => {
    const logo = await service.store(7, upload(await png(4000, 2000)));
    expect(logo.width).toBeLessThanOrEqual(1000);
    expect(logo.height).toBeLessThanOrEqual(400);
  }, 30_000);

  it('refuses SVG — it would be script running on our own origin', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await expect(service.store(7, upload(svg, 'logo.svg', 'image/svg+xml'))).rejects.toMatchObject({
      errorCode: ERROR_CODE.WIDGET_LOGO_REJECTED.code,
    });
  });

  it('refuses a file that lies about being an image', async () => {
    await expect(
      service.store(7, upload(Buffer.from('not an image at all'), 'logo.png')),
    ).rejects.toMatchObject({ errorCode: ERROR_CODE.WIDGET_LOGO_REJECTED.code });
  });

  it('refuses anything over 1MB', async () => {
    const big = Buffer.concat([await png(), Buffer.alloc(1024 * 1024)]);
    await expect(service.store(7, upload(big))).rejects.toMatchObject({
      errorCode: ERROR_CODE.WIDGET_LOGO_REJECTED.code,
    });
  });

  it('removes a stored logo, and treats a missing file as already gone', async () => {
    const logo = await service.store(7, upload(await png()));
    await service.remove(7, logo);
    await expect(fs.stat(join(dir, '7', 'branding', `${logo.id}.png`))).rejects.toBeDefined();
    await expect(service.remove(7, logo)).resolves.toBeUndefined();
    await expect(service.remove(7, null)).resolves.toBeUndefined();
  }, 30_000);
});
