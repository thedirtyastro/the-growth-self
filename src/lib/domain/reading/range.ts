import { CFG } from './constants';

export interface OutlineNodeLike {
  title: string;
  dest: string | unknown[] | null;
  items?: OutlineNodeLike[];
}

export interface PdfRangeReadable {
  numPages: number;
  getOutline(): Promise<OutlineNodeLike[] | null>;
  getDestination(id: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
}

export interface FlatOutlineEntry {
  title: string;
  page: number; // 1-based
}

const FRONT_MATTER_RE =
  /^(chapter\s*(1|one)\b|ch\.?\s*1\b|1\.\s+|part\s*(1|i|one)\b|introduction\b|prologue\b)/i;

const BACK_MATTER_RE =
  /^(notes\b|endnotes\b|references\b|bibliography\b|index\b|acknowledg(e)?ments?\b|about the author\b|colophon\b|appendix\b|appendices\b|further reading\b|glossary\b)/i;

async function resolveDestPage(
  pdf: PdfRangeReadable,
  dest: string | unknown[] | null
): Promise<number | null> {
  if (!dest) return null;
  try {
    const resolved = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
    if (!Array.isArray(resolved) || resolved.length === 0 || resolved[0] == null) {
      return null;
    }
    const ref = resolved[0];
    if (typeof ref === 'number') {
      const p = ref + 1;
      return p >= 1 && p <= pdf.numPages ? p : null;
    }
    const idx = await pdf.getPageIndex(ref);
    const page = idx + 1;
    return page >= 1 && page <= pdf.numPages ? page : null;
  } catch {
    return null;
  }
}

export async function flattenOutline(
  pdf: PdfRangeReadable,
  nodes: OutlineNodeLike[] | null
): Promise<FlatOutlineEntry[]> {
  if (!nodes || nodes.length === 0) return [];
  const entries: FlatOutlineEntry[] = [];

  const walk = async (items: OutlineNodeLike[]) => {
    for (const item of items) {
      const page = await resolveDestPage(pdf, item.dest);
      if (page !== null && item.title) {
        entries.push({ title: item.title.trim(), page });
      }
      if (item.items && item.items.length > 0) {
        await walk(item.items);
      }
    }
  };

  await walk(nodes);
  return entries.sort((a, b) => a.page - b.page);
}

/**
 * Detects main-text page bounds (contentStart..contentEnd) from the PDF outline.
 * Falls back cleanly to 1..numPages when outline is missing, small (<12p), or ambiguous.
 */
export async function detectContentRange(
  pdf: PdfRangeReadable
): Promise<{ start: number; end: number }> {
  const total = Math.max(1, pdf.numPages);
  if (total < 12) {
    return { start: 1, end: total };
  }

  let entries: FlatOutlineEntry[] = [];
  try {
    const outline = await pdf.getOutline();
    entries = await flattenOutline(pdf, outline);
  } catch {
    return { start: 1, end: total };
  }

  if (entries.length === 0) {
    return { start: 1, end: total };
  }

  const frontLimit = Math.floor(total * 0.35);
  const frontEntry = entries.find(
    (e) => e.page <= frontLimit && FRONT_MATTER_RE.test(e.title)
  );
  const start = frontEntry ? Math.max(1, frontEntry.page) : 1;

  const backThreshold = Math.floor(total * CFG.BACK_MATTER_AFTER);
  const backEntry = entries.find(
    (e) => e.page > Math.max(start, backThreshold) && BACK_MATTER_RE.test(e.title)
  );
  const end = backEntry ? Math.max(start + 1, backEntry.page - 1) : total;

  if (start >= end || end > total) {
    return { start: 1, end: total };
  }

  return { start, end };
}
