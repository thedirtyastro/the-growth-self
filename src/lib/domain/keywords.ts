import type { Highlight, JournalEntry } from '../../types/models';

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'had',
  'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how',
  'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did',
  'let', 'put', 'say', 'she', 'too', 'use', 'that', 'with', 'have', 'this',
  'will', 'your', 'from', 'they', 'know', 'want', 'been', 'good', 'much',
  'some', 'time', 'very', 'when', 'come', 'here', 'just', 'like', 'long',
  'make', 'many', 'more', 'only', 'over', 'such', 'take', 'than', 'them',
  'well', 'were', 'what', 'which', 'their', 'about', 'after', 'again', 'being',
  'could', 'every', 'first', 'found', 'great', 'house', 'large', 'learn',
  'never', 'other', 'place', 'plant', 'point', 'right', 'small', 'sound',
  'spell', 'still', 'study', 'there', 'these', 'thing', 'think', 'those',
  'three', 'under', 'water', 'where', 'while', 'world', 'would', 'write',
  'years', 'into', 'most', 'also', 'back', 'even', 'give', 'must', 'much',
  'because', 'before', 'between', 'should', 'through', 'without', 'within',
  'around', 'always', 'something', 'nothing', 'everything', 'really', 'though',
  'until', 'pages', 'page', 'book', 'read', 'reading', 'note', 'quote',
]);

export function lightStem(word: string): string {
  if (word.length <= 4) return word;
  if (word.endsWith('ies') && word.length > 5) {
    return word.slice(0, -3) + 'y';
  }
  if (word.endsWith('sses') || word.endsWith('xes') || word.endsWith('ches') || word.endsWith('shes')) {
    return word.slice(0, -2);
  }
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is')) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Extracts normalized keywords from text:
 * lowercase, strip punctuation, drop stop words and tokens < 3 chars, light plural stemming.
 */
export function extractKeywords(text: string): string[] {
  if (!text) return [];
  const tokens = text
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !STOP_WORDS.has(t));

  const stemmed = new Set<string>();
  for (const token of tokens) {
    const root = lightStem(token);
    if (root.length >= 3 && !STOP_WORDS.has(root)) {
      stemmed.add(root);
    }
  }
  return Array.from(stemmed);
}

export interface KeywordInsight {
  word: string;
  count: number;
  bookIds: string[];
  highlightIds: string[];
  journalIds: string[];
}

export function aggregateKeywords(
  highlights: Highlight[],
  journalEntries: JournalEntry[]
): KeywordInsight[] {
  const map = new Map<
    string,
    {
      count: number;
      bookIds: Set<string>;
      highlightIds: Set<string>;
      journalIds: Set<string>;
    }
  >();

  const addWord = (
    word: string,
    bookId: string,
    source: { type: 'highlight' | 'journal'; id: string }
  ) => {
    const entry = map.get(word) ?? {
      count: 0,
      bookIds: new Set<string>(),
      highlightIds: new Set<string>(),
      journalIds: new Set<string>(),
    };
    entry.count += 1;
    entry.bookIds.add(bookId);
    if (source.type === 'highlight') {
      entry.highlightIds.add(source.id);
    } else {
      entry.journalIds.add(source.id);
    }
    map.set(word, entry);
  };

  for (const hl of highlights) {
    const combined = `${hl.text} ${hl.note ?? ''}`.trim();
    const words = hl.keywords.length > 0 ? hl.keywords : extractKeywords(combined);
    for (const w of new Set(words)) {
      addWord(w, hl.bookId, { type: 'highlight', id: hl.id });
    }
  }

  for (const j of journalEntries) {
    const combined = `${j.quote ?? ''} ${j.content}`.trim();
    const words = j.keywords.length > 0 ? j.keywords : extractKeywords(combined);
    for (const w of new Set(words)) {
      addWord(w, j.bookId, { type: 'journal', id: j.id });
    }
  }

  return Array.from(map.entries())
    .map(([word, data]) => ({
      word,
      count: data.count,
      bookIds: Array.from(data.bookIds),
      highlightIds: Array.from(data.highlightIds),
      journalIds: Array.from(data.journalIds),
    }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}
