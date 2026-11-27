import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useLibraryStore } from './store/library';
import { useUiStore } from './store/ui';
import { TopNav } from './components/shell/TopNav';
import { Footer } from './components/shell/Footer';
import { DocumentMeta } from './components/shell/DocumentMeta';
import { AddBookModal } from './components/shell/AddBookModal';
import { AddNoteModal } from './components/shell/AddNoteModal';
import { ProfileDrawer } from './components/shell/ProfileDrawer';
import { HomePage } from './pages/HomePage';
import { CollectionPage } from './pages/CollectionPage';
import { BookDetailPage } from './pages/BookDetailPage';
import { JournalPage } from './pages/JournalPage';
import { ReportPage } from './pages/ReportPage';
import { ReaderPage } from './pages/ReaderPage';

function AppShell() {
  const { pathname } = useLocation();
  const hydrate = useLibraryStore((s) => s.hydrate);
  const bannerMessage = useUiStore((s) => s.bannerMessage);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const isReaderRoute = pathname.startsWith('/read/');

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <DocumentMeta />
      {!isReaderRoute && <TopNav />}

      <div className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/books" element={<CollectionPage />} />
          <Route path="/books/:id" element={<BookDetailPage />} />
          <Route path="/read/:id" element={<ReaderPage />} />
          <Route path="/journal" element={<JournalPage />} />
          <Route path="/reports" element={<ReportPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </div>

      {!isReaderRoute && <Footer />}

      <AddBookModal />
      <AddNoteModal />
      <ProfileDrawer />

      {bannerMessage && (
        <div
          role="status"
          aria-live="polite"
          className="animate-banner-in fixed bottom-5 right-6 z-50 border border-[var(--border)] bg-[var(--foreground)] px-5 py-2.5 text-xs font-medium tracking-[0.06em] text-[var(--surface)] shadow-lg"
        >
          {bannerMessage}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
