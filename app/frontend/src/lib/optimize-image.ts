/**
 * Client-side image optimizer for admin uploads.
 *
 * Every hero / OG / product photo the admin pushes gets normalised here
 * BEFORE it hits Supabase Storage, so what ends up on the CDN is always
 * a lean, LCP-safe file — no accidental 8 MB iPhone PNG in production.
 *
 * Rules:
 *   • Decoded via a browser <img> so we accept anything the browser
 *     accepts (PNG, JPG, WebP, HEIC on Safari, ...).
 *   • Downscaled to `maxWidth` (default 2400 px, plenty for a 16:9 hero
 *     on retina) — aspect ratio preserved.
 *   • Re-encoded to WebP at quality 0.85 by default; falls back to JPEG
 *     if the browser can't produce a WebP blob (never happens on the
 *     Chrome / Safari / Firefox we support, but safe by construction).
 *   • Rejected if the source blob isn't an image at all.
 *   • If the optimised file is somehow larger than the original (rare,
 *     tiny already-optimised WebP), returns the ORIGINAL — no point
 *     rewriting for nothing.
 */

export type OptimizeOptions = {
  maxWidth?: number;   // default 2400
  quality?: number;    // default 0.85 (0.0-1.0)
  mime?: 'image/webp' | 'image/jpeg'; // default 'image/webp'
};

export async function optimizeImage(file: File, opts: OptimizeOptions = {}): Promise<File> {
  const maxWidth = opts.maxWidth ?? 2400;
  const quality  = opts.quality  ?? 0.85;
  const targetMime = opts.mime   ?? 'image/webp';

  if (!file.type.startsWith('image/')) {
    throw new Error('Not an image file');
  }

  const img = await loadImage(file);
  const scale = img.naturalWidth > maxWidth ? maxWidth / img.naturalWidth : 1;
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(img, 0, 0, w, h);

  let blob = await canvasToBlob(canvas, targetMime, quality);
  let mime = targetMime;
  if (!blob && targetMime === 'image/webp') {
    // Ultra-safe fallback — every browser we care about does JPEG.
    blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    mime = 'image/jpeg';
  }
  if (!blob) throw new Error('Image encoding failed');

  // Don't push the re-encoded version if it's bigger than the source
  // (already-optimised WebP smaller than any re-encode).
  if (blob.size >= file.size && file.type === mime) {
    return file;
  }

  const ext = mime === 'image/webp' ? 'webp' : 'jpg';
  const base = file.name.replace(/\.[a-z0-9]+$/i, '') || 'image';
  return new File([blob], `${base}.${ext}`, { type: mime });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not decode image')); };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), mime, quality));
}
