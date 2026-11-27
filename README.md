# The Growth Shelf

A local-first personal bookshelf and PDF reading studio with a 3D hardcover reader, text highlighting, reading journal, and progress reports.

## Running Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Unit Tests & Type Checking

```bash
npx tsx --test src/lib/domain/domain.test.ts
npm run lint
npm run build
```

## Architecture & Assumptions

- **Framework Adaptation**: Built in the React + TypeScript + Vite SPA workspace (`src/pages/*`, `src/components/*`, `src/lib/*`, `src/store/*`) with client-side routing (`/`, `/books`, `/books/:id`, `/read/:id`, `/journal`, `/reports`).
- **Local-First Persistence**: All books, PDF `Blob`s, cover images, highlights (stored in normalized `0..1` page coordinates), reading sessions, journal entries, bookmarks, and preferences live strictly in IndexedDB (`growth-shelf`) via `idb`. Zustand stores hold lightweight state only and never store PDF binaries.
- **No Fake User Data**: A new library opens empty. Clicking **Load sample library** (on the empty shelf or in Preferences) generates local multi-page sample PDFs and realistic reading sessions clearly marked as sample data for demonstration.
- **PDF Rendering & Scanned PDFs**: Powered by `pdfjs-dist` running in a dedicated module worker (`pdf.worker.min.mjs`) with an LRU page render queue. If a PDF lacks an embedded text layer (scanned pages), the reader surfaces an **Area Highlight** rectangle tool and explains that text selection requires a text-based PDF.
- **3D Hardcover Engine & Automatic Fallback**: Lazy-loaded on `/read/:id` with Three.js (`RoomEnvironment` studio lighting, custom GLSL cylindrical page-turn shader, opening/closing sequences, and screen-projected hybrid DOM text/highlight layers). Automatically detects software WebGL for safe frame pacing and falls back seamlessly to the editorial `FlatReader` if WebGL is unavailable, context is lost, or single-page/flat mode is chosen.
- **Optional Metadata Lookup**: Disabled by default (`settings.metadataLookup = false`). When enabled in Preferences, only title and author text are sent to Open Library; PDFs never leave the device.
