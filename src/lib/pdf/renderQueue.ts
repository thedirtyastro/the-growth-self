import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { ReaderQuality } from '../../types/models';

export interface TextSpanItem {
  str: string;
  x: number; // normalized 0..1
  y: number; // normalized 0..1 (top-down)
  width: number; // normalized 0..1
  height: number; // normalized 0..1
  fontSize: number; // normalized to page height
  fontName: string;
  angle: number;
}

export interface RenderedPageResult {
  pageNumber: number;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  aspectRatio: number;
  scaleUsed: number;
  textItems: TextSpanItem[];
  hasTextLayer: boolean;
}

interface CacheEntry {
  key: string;
  pageNumber: number;
  scale: number;
  result: RenderedPageResult;
  lastUsed: number;
}

export function getQualityScale(quality: ReaderQuality, zoomMultiplier: number = 1): number {
  const base = quality === 'ultra' ? 2.8 : quality === 'high' ? 2.2 : 1.65;
  const deviceMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8;
  const memCap = deviceMemory <= 2 ? 1.5 : deviceMemory <= 4 ? 2.1 : 3.0;
  return Math.min(memCap, base * zoomMultiplier);
}

/**
 * LRU page render queue that renders active pages at full quality and neighbor pages
 * at lighter resolution, cancelling stale renders when page turns happen rapidly.
 */
export class PdfRenderQueue {
  private pdf: PDFDocumentProxy;
  private cache = new Map<string, CacheEntry>();
  private inFlight = new Map<string, { promise: Promise<RenderedPageResult>; cancelled: boolean }>();
  private maxEntries: number;
  private maxTextureDim: number;

  constructor(pdf: PDFDocumentProxy, maxEntries = 14, maxTextureDim = 2048) {
    this.pdf = pdf;
    this.maxEntries = maxEntries;
    this.maxTextureDim = maxTextureDim;
  }

  private makeKey(pageNumber: number, scaleBucket: number): string {
    return `${pageNumber}@${scaleBucket.toFixed(2)}`;
  }

  public getCached(pageNumber: number, minScale = 0): RenderedPageResult | undefined {
    let best: CacheEntry | undefined;
    for (const entry of this.cache.values()) {
      if (entry.pageNumber === pageNumber && entry.scale >= minScale) {
        if (!best || entry.scale > best.scale) {
          best = entry;
        }
      }
    }
    if (best) {
      best.lastUsed = performance.now();
      return best.result;
    }
    return undefined;
  }

  public cancelExcept(keepPages: Set<number>): void {
    for (const [key, task] of this.inFlight.entries()) {
      const pageNum = Number(key.split('@')[0]);
      if (!keepPages.has(pageNum)) {
        task.cancelled = true;
        this.inFlight.delete(key);
      }
    }
  }

  public async renderPage(
    pageNumber: number,
    desiredScale: number,
    options?: { skipText?: boolean }
  ): Promise<RenderedPageResult> {
    const safePage = Math.max(1, Math.min(pageNumber, this.pdf.numPages));
    const scaleBucket = Math.round(desiredScale * 4) / 4;
    const key = this.makeKey(safePage, scaleBucket);

    const existing = this.cache.get(key);
    if (existing) {
      existing.lastUsed = performance.now();
      return existing.result;
    }

    const active = this.inFlight.get(key);
    if (active && !active.cancelled) {
      return active.promise;
    }

    const taskState = { cancelled: false };
    const promise = (async () => {
      const page: PDFPageProxy = await this.pdf.getPage(safePage);
      try {
        if (taskState.cancelled) {
          throw new Error('Render cancelled');
        }

        const baseViewport = page.getViewport({ scale: 1 });
        const maxDimScale = this.maxTextureDim / Math.max(baseViewport.width, baseViewport.height, 1);
        const effectiveScale = Math.max(0.5, Math.min(scaleBucket, maxDimScale));
        const viewport = page.getViewport({ scale: effectiveScale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) {
          throw new Error('Could not obtain 2D canvas context');
        }

        ctx.fillStyle = '#FFFDF8';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const renderTask = page.render({
          canvasContext: ctx,
          viewport,
          canvas,
        });

        await renderTask.promise;

        if (taskState.cancelled) {
          canvas.width = 0;
          canvas.height = 0;
          throw new Error('Render cancelled');
        }

        let textItems: TextSpanItem[] = [];
        if (!options?.skipText) {
          try {
            const textContent = await page.getTextContent();
            const pageW = baseViewport.width || 1;
            const pageH = baseViewport.height || 1;
            const items: TextSpanItem[] = [];

            for (const item of textContent.items) {
              if (!('str' in item) || !item.str) continue;
              // transform = [a, b, c, d, tx, ty] in PDF user space (bottom-left origin)
              const tx = item.transform;
              const fontHeight = Math.hypot(tx[2], tx[3]) || Math.hypot(tx[0], tx[1]) || 12;
              const angle = Math.atan2(tx[1], tx[0]);
              const [vx, vy] = baseViewport.convertToViewportPoint(tx[4], tx[5]);

              const normW = Math.max(0.002, (item.width || 0) / pageW);
              const normH = Math.max(0.006, fontHeight / pageH);
              const normX = vx / pageW;
              const normY = (vy - fontHeight * 0.85) / pageH;

              items.push({
                str: item.str,
                x: normX,
                y: normY,
                width: normW,
                height: normH,
                fontSize: fontHeight / pageH,
                fontName: item.fontName || 'serif',
                angle,
              });
            }
            textItems = items;
          } catch {
            textItems = [];
          }
        }

        const result: RenderedPageResult = {
          pageNumber: safePage,
          canvas,
          width: canvas.width,
          height: canvas.height,
          aspectRatio: baseViewport.width / Math.max(1, baseViewport.height),
          scaleUsed: effectiveScale,
          textItems,
          hasTextLayer: textItems.some((t) => t.str.trim().length > 0),
        };

        this.putInCache(key, safePage, scaleBucket, result);
        return result;
      } finally {
        page.cleanup();
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, { promise, cancelled: false });
    return promise;
  }

  private putInCache(
    key: string,
    pageNumber: number,
    scale: number,
    result: RenderedPageResult
  ): void {
    this.cache.set(key, {
      key,
      pageNumber,
      scale,
      result,
      lastUsed: performance.now(),
    });

    while (this.cache.size > this.maxEntries) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, v] of this.cache.entries()) {
        if (v.lastUsed < oldestTime) {
          oldestTime = v.lastUsed;
          oldestKey = k;
        }
      }
      if (!oldestKey) break;
      const evicted = this.cache.get(oldestKey);
      if (evicted) {
        evicted.result.canvas.width = 0;
        evicted.result.canvas.height = 0;
      }
      this.cache.delete(oldestKey);
    }
  }

  public dispose(): void {
    for (const task of this.inFlight.values()) {
      task.cancelled = true;
    }
    this.inFlight.clear();
    for (const entry of this.cache.values()) {
      entry.result.canvas.width = 0;
      entry.result.canvas.height = 0;
    }
    this.cache.clear();
  }
}
