import * as pdfjsLib from 'pdfjs-dist';
import { sampleDominantColorFromCanvas, pickFallbackSpineColor } from './cover';

let workerConfigured = false;

export function ensurePdfWorker(): void {
  if (workerConfigured) return;
  if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
    workerConfigured = true;
  }
}

export interface PdfInspectionResult {
  title: string;
  author: string;
  totalPages: number;
  coverDataUrl?: string;
  coverColor: string;
}

export async function inspectPdfFile(
  fileOrBlob: Blob,
  fileName: string,
  onProgress?: (progress: number, stage: string) => void
): Promise<PdfInspectionResult> {
  ensurePdfWorker();
  onProgress?.(0.1, 'Reading PDF structure...');

  const buffer = await fileOrBlob.arrayBuffer();
  onProgress?.(0.35, 'Extracting pages...');

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  try {
    onProgress?.(0.6, 'Reading metadata...');
    const totalPages = Math.max(1, pdf.numPages);

    let metaTitle = '';
    let metaAuthor = '';
    try {
      const meta = await pdf.getMetadata();
      const info = meta?.info as Record<string, unknown> | undefined;
      if (info) {
        if (typeof info.Title === 'string' && info.Title.trim()) {
          metaTitle = info.Title.trim();
        }
        if (typeof info.Author === 'string' && info.Author.trim()) {
          metaAuthor = info.Author.trim();
        }
      }
    } catch {
      // Metadata optional
    }

    const cleanFileName = fileName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
    const title = metaTitle || cleanFileName || 'Untitled Book';
    const author = metaAuthor || 'Unknown Author';

    onProgress?.(0.8, 'Rendering cover preview...');
    let coverDataUrl: string | undefined;
    let coverColor = pickFallbackSpineColor(title);

    try {
      const firstPage = await pdf.getPage(1);
      const viewport = firstPage.getViewport({ scale: 1 });
      const targetWidth = 540;
      const scale = Math.min(2, targetWidth / Math.max(1, viewport.width));
      const scaledViewport = firstPage.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(scaledViewport.width));
      canvas.height = Math.max(1, Math.round(scaledViewport.height));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFDF8';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await firstPage.render({
          canvasContext: ctx,
          viewport: scaledViewport,
          canvas,
        }).promise;
        coverDataUrl = canvas.toDataURL('image/jpeg', 0.86);
        coverColor = sampleDominantColorFromCanvas(canvas, title);
      }
      firstPage.cleanup();
    } catch {
      // Fallback to typographic cover if page 1 render fails
    }

    onProgress?.(1, 'Ready');
    return {
      title,
      author,
      totalPages,
      coverDataUrl,
      coverColor,
    };
  } finally {
    await pdf.cleanup();
    await loadingTask.destroy();
  }
}

export async function openPdfDocument(
  blob: Blob,
  onProgress?: (loaded: number, total: number) => void
): Promise<pdfjsLib.PDFDocumentProxy> {
  ensurePdfWorker();
  const buffer = await blob.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });

  if (onProgress) {
    loadingTask.onProgress = (p: { loaded: number; total: number }) => {
      onProgress(p.loaded, p.total);
    };
  }

  return loadingTask.promise;
}

export async function extractPageWordCount(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNumber: number
): Promise<number | null> {
  if (pageNumber < 1 || pageNumber > pdf.numPages) return null;
  const page = await pdf.getPage(pageNumber);
  try {
    const content = await page.getTextContent();
    let totalWords = 0;
    let hasNonSpace = false;
    for (const item of content.items) {
      if (!('str' in item) || !item.str) continue;
      const trimmed = item.str.trim();
      if (!trimmed) continue;
      hasNonSpace = true;
      totalWords += trimmed.split(/\s+/).length;
    }
    return hasNonSpace ? totalWords : null;
  } catch {
    return null;
  } finally {
    page.cleanup();
  }
}
