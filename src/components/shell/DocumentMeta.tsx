import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useLibraryStore } from '../../store/library';

const BASE_TITLE = 'The Growth Shelf — Personal Library & Reading Studio';

function upsertMetaTag(
  attrName: 'name' | 'property',
  attrValue: string,
  content: string
) {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${attrName}="${attrValue}"]`
  );
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attrName, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLinkRel(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function DocumentMeta() {
  const { pathname } = useLocation();
  const books = useLibraryStore((s) => s.books);

  useEffect(() => {
    const canonicalUrl = `${window.location.origin}${window.location.pathname}`;
    upsertLinkRel('canonical', canonicalUrl);
    upsertMetaTag('property', 'og:url', canonicalUrl);

    let title = BASE_TITLE;
    if (pathname === '/books') {
      title = 'The Collection — The Growth Shelf';
    } else if (pathname === '/journal') {
      title = 'Reading Journal — The Growth Shelf';
    } else if (pathname === '/reports') {
      title = 'Reading Reports — The Growth Shelf';
    } else if (pathname.startsWith('/books/') || pathname.startsWith('/read/')) {
      const id = pathname.split('/')[2];
      const book = books.find((b) => b.id === id);
      if (book) {
        title = pathname.startsWith('/read/')
          ? `Reading ${book.title} — The Growth Shelf`
          : `${book.title} — The Growth Shelf`;
      }
    }

    document.title = title;
    upsertMetaTag('property', 'og:title', title);
    upsertMetaTag('name', 'twitter:title', title);
  }, [pathname, books]);

  return null;
}
