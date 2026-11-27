import { SPINE_PALETTE } from '../../types/models';

/**
 * Samples a balanced, non-washed-out dominant color from a canvas or image element.
 * Falls back to a deterministic editorial palette color if image is mostly blank/white.
 */
export function sampleDominantColorFromCanvas(
  canvas: HTMLCanvasElement,
  fallbackSeed: string = ''
): string {
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return pickFallbackSpineColor(fallbackSeed);

    const w = canvas.width;
    const h = canvas.height;
    if (w === 0 || h === 0) return pickFallbackSpineColor(fallbackSeed);

    const stepX = Math.max(1, Math.floor(w / 24));
    const stepY = Math.max(1, Math.floor(h / 24));
    const data = ctx.getImageData(0, 0, w, h).data;

    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let count = 0;

    for (let y = 0; y < h; y += stepY) {
      for (let x = 0; x < w; x += stepX) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        if (a < 180) continue;

        // Skip near-pure white paper pixels unless nothing else exists
        const brightness = (r + g + b) / 3;
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;

        if (brightness > 238 && saturation < 0.08) continue;

        const weight = 1 + saturation * 2;
        rSum += r * weight;
        gSum += g * weight;
        bSum += b * weight;
        count += weight;
      }
    }

    if (count < 4) {
      return pickFallbackSpineColor(fallbackSeed);
    }

    const r = Math.round(Math.max(20, Math.min(220, rSum / count)));
    const g = Math.round(Math.max(20, Math.min(220, gSum / count)));
    const b = Math.round(Math.max(20, Math.min(220, bSum / count)));

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  } catch {
    return pickFallbackSpineColor(fallbackSeed);
  }
}

export function pickFallbackSpineColor(seed: string): string {
  if (!seed) return SPINE_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return SPINE_PALETTE[hash % SPINE_PALETTE.length];
}

export async function processUploadedCoverFile(
  file: File,
  seed: string
): Promise<{ coverDataUrl: string; coverColor: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read cover image'));
    reader.readAsDataURL(file);
  });

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 680;
      const scale = Math.min(1, maxW / Math.max(1, img.width));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const color = sampleDominantColorFromCanvas(canvas, seed);
        resolve({ coverDataUrl: canvas.toDataURL('image/jpeg', 0.88), coverColor: color });
      } else {
        resolve({ coverDataUrl: dataUrl, coverColor: pickFallbackSpineColor(seed) });
      }
    };
    img.onerror = () => {
      resolve({ coverDataUrl: dataUrl, coverColor: pickFallbackSpineColor(seed) });
    };
    img.src = dataUrl;
  });
}
