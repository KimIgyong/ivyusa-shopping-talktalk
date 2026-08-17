/**
 * HEIC/HEIF decode, run off the request thread (PLN-260817 §2.1).
 *
 * libheif is a WASM build: decoding is pure synchronous CPU work — measured at
 * ~0.9s for a 12MP iPhone photo on the staging runtime (PLN §1). Doing that on
 * the event loop would stall every other request for the duration, so it lives
 * here and the pool in `image-decode.service.ts` owns the lifetime.
 *
 * One worker handles many decodes: the WASM heap is expensive to set up and
 * reuses its allocation across runs, which is why RSS flattens after the first
 * few images instead of climbing.
 */
import { parentPort } from 'worker_threads';

interface DecodeRequest {
  id: number;
  buffer: ArrayBuffer;
  maxPixels: number;
}

export interface DecodeSuccess {
  id: number;
  ok: true;
  width: number;
  height: number;
  /** Raw RGBA pixels, transferred (not copied) back to the main thread. */
  data: ArrayBuffer;
}

export interface DecodeFailure {
  id: number;
  ok: false;
  /** `pixels` maps to E5043; anything else to E5042. */
  reason: 'pixels' | 'decode';
  message: string;
}

export type DecodeResponse = DecodeSuccess | DecodeFailure;

/* eslint-disable @typescript-eslint/no-explicit-any */
type HeifImage = {
  get_width(): number;
  get_height(): number;
  display(target: { data: Uint8ClampedArray; width: number; height: number }, cb: (out: unknown) => void): void;
};

let decoderFactory: any;

function loadLibheif(): any {
  if (!decoderFactory) {
    // The bundled build carries its own WASM payload — no external file to ship
    // and nothing to resolve at runtime beyond this require.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    decoderFactory = require('libheif-js/wasm-bundle');
  }
  return decoderFactory;
}

/**
 * Decode the primary image of a HEIF container to raw RGBA.
 *
 * Only the first image is read: a Live Photo or burst carries several, and the
 * shopper meant the one they saw in the picker (PLN-260817 §2, out of scope).
 */
export async function decodeHeif(
  bytes: Buffer,
  maxPixels: number,
): Promise<{ width: number; height: number; data: Buffer }> {
  const libheif = loadLibheif();
  const decoder = new libheif.HeifDecoder();
  const images: HeifImage[] = decoder.decode(bytes);
  if (!images?.length) throw new Error('no image in HEIF container');

  const image = images[0];
  const width = image.get_width();
  const height = image.get_height();
  if (!width || !height) throw new Error('HEIF image has no dimensions');

  // Checked before allocating: the RGBA buffer is 4 bytes per pixel, so a 36MP
  // photo would claim ~144MB here (PLN §1 measured 771MB RSS for one).
  if (width * height > maxPixels) {
    const err = new Error(`image is ${width}x${height}, over the pixel limit`);
    (err as Error & { reason?: string }).reason = 'pixels';
    throw err;
  }

  const data = new Uint8ClampedArray(width * height * 4);
  await new Promise<void>((resolve, reject) => {
    image.display({ data, width, height }, (out) => {
      if (out) resolve();
      else reject(new Error('HEIF decode produced no pixels'));
    });
  });

  return { width, height, data: Buffer.from(data.buffer) };
}

if (parentPort) {
  const port = parentPort;
  port.on('message', (req: DecodeRequest) => {
    void (async () => {
      try {
        const decoded = await decodeHeif(Buffer.from(req.buffer), req.maxPixels);
        const out = decoded.data.buffer.slice(
          decoded.data.byteOffset,
          decoded.data.byteOffset + decoded.data.byteLength,
        ) as ArrayBuffer;
        const message: DecodeSuccess = {
          id: req.id,
          ok: true,
          width: decoded.width,
          height: decoded.height,
          data: out,
        };
        // Transfer the pixel buffer instead of structured-cloning it: a 12MP
        // image is 48MB and copying it would double the cost we just paid.
        port.postMessage(message, [out]);
      } catch (e) {
        const err = e as Error & { reason?: string };
        const message: DecodeFailure = {
          id: req.id,
          ok: false,
          reason: err.reason === 'pixels' ? 'pixels' : 'decode',
          message: err.message ?? 'decode failed',
        };
        port.postMessage(message);
      }
    })();
  });
}
