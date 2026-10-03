import type { SelectedImage, SnapErrorCode } from './types';

/* ------------------------------------------------------------------
   Image intake.

   Validate, then re-encode through a canvas: this normalises the MIME
   type, strips any metadata the camera attached, and keeps the upload
   small enough to be quick. The photo stays in memory — it is never
   written to disk or sent anywhere but our own endpoint.
   ------------------------------------------------------------------ */

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ACCEPT_ATTRIBUTE = ACCEPTED_TYPES.join(',');
export const MAX_INPUT_BYTES = 8 * 1024 * 1024;

/** Long edge after downscaling — enough for handwriting to stay legible. */
const MAX_EDGE = 1400;
const JPEG_QUALITY = 0.9;

export type PrepareResult =
  | { ok: true; image: SelectedImage }
  | { ok: false; error: SnapErrorCode };

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode_failed'));
    img.src = url;
  });
}

export async function prepareImage(file: File): Promise<PrepareResult> {
  if (!ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number])) {
    return { ok: false, error: 'unsupported_type' };
  }
  if (file.size > MAX_INPUT_BYTES) {
    return { ok: false, error: 'image_too_large' };
  }
  if (file.size === 0) {
    return { ok: false, error: 'no_image' };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { ok: false, error: 'read_failed' };
    /* White backdrop so transparent PNGs do not become black. */
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    if (!base64) return { ok: false, error: 'read_failed' };

    return {
      ok: true,
      image: {
        dataUrl,
        base64,
        mimeType: 'image/jpeg',
        name: file.name,
        width,
        height,
        sizeBytes: Math.round(base64.length * 0.75),
      },
    };
  } catch {
    return { ok: false, error: 'read_failed' };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
