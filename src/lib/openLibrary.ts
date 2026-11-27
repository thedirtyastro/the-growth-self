export interface OpenLibraryResult {
  title?: string;
  author?: string;
  publishedYear?: number;
  category?: string;
  synopsis?: string;
}

/**
 * Optional client-side Open Library lookup by title/author only.
 * Never transmits any PDF bytes. Only called when user explicitly enables metadataLookup in Settings.
 */
export async function lookupBookMetadata(
  title: string,
  author?: string
): Promise<OpenLibraryResult | null> {
  const query = [title.trim(), author?.trim()].filter(Boolean).join(' ');
  if (!query) return null;

  try {
    const params = new URLSearchParams({
      q: query,
      limit: '1',
      fields: 'title,author_name,first_publish_year,subject,first_sentence',
    });
    const res = await fetch(`https://openlibrary.org/search.json?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    const doc = data?.docs?.[0];
    if (!doc) return null;

    const firstSentence = Array.isArray(doc.first_sentence)
      ? doc.first_sentence[0]
      : typeof doc.first_sentence === 'string'
        ? doc.first_sentence
        : undefined;

    return {
      title: typeof doc.title === 'string' ? doc.title : undefined,
      author: Array.isArray(doc.author_name) ? doc.author_name[0] : undefined,
      publishedYear: typeof doc.first_publish_year === 'number' ? doc.first_publish_year : undefined,
      category: Array.isArray(doc.subject) && doc.subject.length > 0 ? String(doc.subject[0]) : undefined,
      synopsis: firstSentence,
    };
  } catch {
    return null;
  }
}
