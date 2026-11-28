import { subDays, format } from 'date-fns';
import type {
  Book,
  Bookmark,
  CompletionType,
  Highlight,
  JournalEntry,
  Progress,
  ReadingSession,
} from '../types/models';
import { extractKeywords } from './domain/keywords';
import { buildTextPdfBlob, type SamplePdfPage } from './pdf/simplePdfGenerator';
import { getContrastTextColor } from './domain/status';
import { createInitialProgress } from './domain/reading';

interface SampleBookSpec {
  id: string;
  title: string;
  author: string;
  category: string;
  tags: string[];
  totalPages: number;
  currentPage: number;
  status: Book['status'];
  coverColor: string;
  publishedYear: number;
  synopsis: string;
  subtitle?: string;
  samplePages: SamplePdfPage[];
}

const SAMPLE_SPECS: SampleBookSpec[] = [
  {
    id: 'sample-atomic-habits',
    title: 'Atomic Habits',
    subtitle: 'An Easy & Proven Way to Build Good Habits & Break Bad Ones',
    author: 'James Clear',
    category: 'Discipline',
    tags: ['Habits', 'Systems', 'Daily Practice'],
    totalPages: 320,
    currentPage: 68,
    status: 'ongoing',
    coverColor: '#2D4438',
    publishedYear: 2018,
    synopsis:
      'Atomic Habits argues that lasting change comes from small, consistent improvements rather than dramatic resolutions. James Clear lays out a loop of cue, craving, response and reward, and shows how to design each step so good habits feel obvious and easy while bad ones become hard to start. Throughout, he ties habits to identity: every action is a vote for the kind of person you want to become.',
    samplePages: [
      {
        paragraphs: [
          'An Easy & Proven Way to Build Good Habits & Break Bad Ones.',
          'Small habits do not add up. They compound. That is the quiet mathematics behind lasting personal discipline and daily systems.',
        ],
      },
      {
        heading: 'Chapter 1: The Surprising Power of Tiny Gains',
        paragraphs: [
          'It is so easy to overestimate the importance of one defining moment and underestimate the value of making small improvements on a daily basis.',
          'Too often, we convince ourselves that massive success requires massive action. Yet improving by one percent every day builds an extraordinary system over months.',
          'Habits are the compound interest of self-improvement. The same way that money multiplies through compound interest, the effects of your habits multiply as you repeat them.',
        ],
      },
      {
        heading: 'Chapter 2: Identity and Systems',
        paragraphs: [
          'Your outcomes are a lagging measure of your habits. Your knowledge is a lagging measure of your learning. Your clutter is a lagging measure of your environment.',
          'You do not rise to the level of your goals. You fall to the level of your systems. Focus on building identity through consistent daily actions.',
          'Every action you take is a vote for the type of person you wish to become. No single instance transforms your beliefs, but as the votes build up, so does the evidence of your new identity.',
        ],
      },
      {
        heading: 'Chapter 3: The Four Laws of Behavior Change',
        paragraphs: [
          'Whenever you want to change your behavior, ask yourself four simple questions: How can I make it obvious? How can I make it attractive? How can I make it easy? How can I make it satisfying?',
          'Environment is the invisible hand that shapes human behavior. Design your room, your desk, and your reading shelf so the cues of your good habits are unmistakable.',
        ],
      },
    ],
  },
  {
    id: 'sample-the-alchemist',
    title: 'The Alchemist',
    author: 'Paulo Coelho',
    category: 'Philosophy',
    tags: ['Classic', 'Fable', 'Purpose'],
    totalPages: 208,
    currentPage: 52,
    status: 'ongoing',
    coverColor: '#B86B4E',
    publishedYear: 1988,
    synopsis:
      'A young Andalusian shepherd named Santiago sets out across the desert in search of a hidden treasure, discovering that the true alchemy lies in attention, patience, and listening to the language of the world.',
    samplePages: [
      {
        paragraphs: [
          'A fable about following your dream and reading the omens along a patient road.',
        ],
      },
      {
        heading: 'Part One: The Shepherd and the Dream',
        paragraphs: [
          'The boy’s name was Santiago. Dusk was falling as the boy arrived with his herd at an abandoned church.',
          'It is the possibility of having a dream come true that makes life interesting, he thought, looking up at the sycamore tree growing where the sacristy once stood.',
          'Patience and attention allow a traveler to recognize quiet opportunities hidden inside ordinary days.',
        ],
      },
      {
        heading: 'Across the Strait',
        paragraphs: [
          'When you want something, all the universe conspires in helping you to achieve it.',
          'Remember that wherever your heart is, there you will find your treasure. You must never stop dreaming or learning from the road.',
        ],
      },
    ],
  },
  {
    id: 'sample-deep-work',
    title: 'Deep Work',
    author: 'Cal Newport',
    category: 'Focus',
    tags: ['Productivity', 'Systems', 'Attention'],
    totalPages: 296,
    currentPage: 142,
    status: 'ongoing',
    coverColor: '#1E1E1B',
    publishedYear: 2016,
    synopsis:
      'Deep Work makes the case for distraction-free concentration in a noisy economy, offering concrete rituals to protect cognitive depth, master hard skills quickly, and produce meaningful work.',
    samplePages: [
      {
        paragraphs: [
          'Rules for Focused Success in a Distracted World.',
          'Professional activities performed in a state of distraction-free concentration push your cognitive capabilities to their limit.',
        ],
      },
      {
        heading: 'Rule #1: Work Deeply',
        paragraphs: [
          'To build your working life around the experience of flow produced by deep work is a proven path to deep satisfaction.',
          'Attention residue occurs whenever you switch rapidly between tasks, leaving part of your focus stuck on the previous obligation.',
          'Schedule uninterrupted blocks of focus and protect them with clear rituals, a quiet space, and deliberate shutdown routines.',
        ],
      },
    ],
  },
  {
    id: 'sample-meditations',
    title: 'Meditations',
    author: 'Marcus Aurelius',
    category: 'Stoicism',
    tags: ['Classic', 'Philosophy', 'Journal'],
    totalPages: 256,
    currentPage: 256,
    status: 'completed',
    coverColor: '#4F6373',
    publishedYear: 180,
    synopsis:
      'Private reflections written by the Roman emperor Marcus Aurelius during military campaigns, examining duty, impermanence, discipline of perception, and equanimity in the face of adversity.',
    samplePages: [
      {
        paragraphs: [
          'Private journals on Stoic discipline, clarity of judgment, and calm presence.',
        ],
      },
      {
        heading: 'Book IV: The Inner Citadel',
        paragraphs: [
          'You have power over your mind—not outside events. Realize this, and you will find strength.',
          'The impediment to action advances action. What stands in the way becomes the way.',
          'Waste no more time arguing about what a good person should be. Be one.',
        ],
      },
    ],
  },
  {
    id: 'sample-essentialism',
    title: 'Essentialism',
    author: 'Greg McKeown',
    category: 'Clarity',
    tags: ['Minimalism', 'Decision Making'],
    totalPages: 272,
    currentPage: 272,
    status: 'completed',
    coverColor: '#DEDAD0',
    publishedYear: 2014,
    synopsis:
      'The disciplined pursuit of less. Essentialism teaches how to discern the vital few commitments from the trivial many and design deliberate trade-offs.',
    samplePages: [
      {
        paragraphs: [
          'The Disciplined Pursuit of Less.',
          'Less but better. Only once you give yourself permission to stop trying to do it all can you make your highest contribution.',
        ],
      },
    ],
  },
  {
    id: 'sample-ikigai',
    title: 'Ikigai',
    author: 'Hector Garcia & Francesc Miralles',
    category: 'Longevity',
    tags: ['Purpose', 'Wellness'],
    totalPages: 208,
    currentPage: 0,
    status: 'not-started',
    coverColor: '#8B3835',
    publishedYear: 2016,
    synopsis:
      'Exploring the Japanese concept of a reason for being through interviews with centenarians in Okinawa, balancing purpose, community, movement, and flow.',
    samplePages: [
      {
        paragraphs: ['The Japanese Secret to a Long and Happy Life.'],
      },
    ],
  },
  {
    id: 'sample-mindset',
    title: 'Mindset',
    author: 'Carol Dweck',
    category: 'Psychology',
    tags: ['Learning', 'Growth'],
    totalPages: 280,
    currentPage: 0,
    status: 'not-started',
    coverColor: '#3A4D6D',
    publishedYear: 2006,
    synopsis:
      'How our beliefs about intelligence and talent shape learning, resilience, and long-term mastery through the contrast of fixed and growth mindsets.',
    samplePages: [
      {
        paragraphs: ['The New Psychology of Success.'],
      },
    ],
  },
  {
    id: 'sample-grit',
    title: 'Grit',
    author: 'Angela Duckworth',
    category: 'Psychology',
    tags: ['Mastery', 'Resilience'],
    totalPages: 336,
    currentPage: 0,
    status: 'not-started',
    coverColor: '#CCA03D',
    publishedYear: 2016,
    synopsis:
      'Why passion and sustained perseverance over years matter more for long-term achievement than raw talent alone.',
    samplePages: [
      {
        paragraphs: ['The Power of Passion and Perseverance.'],
      },
    ],
  },
  {
    id: 'sample-power-of-now',
    title: 'The Power of Now',
    author: 'Eckhart Tolle',
    category: 'Mindfulness',
    tags: ['Presence', 'Meditation'],
    totalPages: 236,
    currentPage: 236,
    status: 'completed',
    coverColor: '#DCD8CD',
    publishedYear: 1997,
    synopsis:
      'A guide to quiet presence and freeing attention from compulsive rumination about past regrets and future anxieties.',
    samplePages: [
      {
        paragraphs: ['A Guide to Spiritual Enlightenment and Quiet Presence.'],
      },
    ],
  },
  {
    id: 'sample-antifragile',
    title: 'Antifragile',
    author: 'Nassim Nicholas Taleb',
    category: 'Systems',
    tags: ['Decision Making', 'Risk'],
    totalPages: 519,
    currentPage: 118,
    status: 'ongoing',
    coverColor: '#3E4F37',
    publishedYear: 2012,
    synopsis:
      'Some things benefit from shocks; they thrive and grow when exposed to volatility, randomness, disorder, and stressors.',
    samplePages: [
      {
        paragraphs: ['Things That Gain from Disorder.'],
      },
    ],
  },
  {
    id: 'sample-four-thousand-weeks',
    title: 'Four Thousand Weeks',
    author: 'Oliver Burkeman',
    category: 'Philosophy',
    tags: ['Time', 'Attention'],
    totalPages: 288,
    currentPage: 0,
    status: 'not-started',
    coverColor: '#70543E',
    publishedYear: 2021,
    synopsis:
      'Time management for mortals: embracing human finitude instead of chasing impossible productivity.',
    samplePages: [
      {
        paragraphs: ['Time Management for Mortals.'],
      },
    ],
  },
  {
    id: 'sample-mans-search',
    title: "Man's Search for Meaning",
    author: 'Viktor E. Frankl',
    category: 'Philosophy',
    tags: ['Classic', 'Resilience', 'Purpose'],
    totalPages: 184,
    currentPage: 0,
    status: 'not-started',
    coverColor: '#1F2D3D',
    publishedYear: 1946,
    synopsis:
      'Psychiatrist Viktor Frankl chronicles survival and logotherapy, showing how meaning sustains dignity even in the darkest circumstances.',
    samplePages: [
      {
        paragraphs: ['Finding meaning and inner freedom under extreme adversity.'],
      },
    ],
  },
];

function renderEditorialCoverDataUrl(spec: SampleBookSpec): string {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 700;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = spec.coverColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle vertical cloth weave grain
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let x = 0; x < canvas.width; x += 6) {
    ctx.fillRect(x, 0, 1, canvas.height);
  }

  const fg = getContrastTextColor(spec.coverColor);
  ctx.fillStyle = fg;

  // Minimal geometric emblem on Atomic Habits & classic covers
  if (spec.id === 'sample-atomic-habits') {
    ctx.save();
    ctx.translate(150, 145);
    ctx.strokeStyle = fg;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 2;
    for (let a = 0; a < 3; a++) {
      ctx.save();
      ctx.rotate((a * Math.PI) / 3);
      ctx.beginPath();
      ctx.ellipse(0, 0, 56, 20, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Title
  ctx.globalAlpha = 0.95;
  ctx.font = '600 46px "Cormorant Garamond", Georgia, serif';
  const words = spec.title.toUpperCase().split(' ');
  const lines: string[] = [];
  let curr = '';
  for (const w of words) {
    const test = curr ? `${curr} ${w}` : w;
    if (ctx.measureText(test).width > 340 && curr) {
      lines.push(curr);
      curr = w;
    } else {
      curr = test;
    }
  }
  if (curr) lines.push(curr);

  let y = 310;
  for (const line of lines) {
    ctx.fillText(line, 68, y);
    y += 52;
  }

  if (spec.subtitle) {
    ctx.globalAlpha = 0.72;
    ctx.font = '400 15px Inter, sans-serif';
    ctx.fillText(spec.subtitle.slice(0, 44), 68, y + 18);
    if (spec.subtitle.length > 44) {
      ctx.fillText(spec.subtitle.slice(44, 86), 68, y + 40);
    }
  }

  // Author
  ctx.globalAlpha = 0.85;
  ctx.font = '500 15px Inter, sans-serif';
  ctx.fillText(spec.author.toUpperCase(), 68, 628);

  return canvas.toDataURL('image/jpeg', 0.9);
}

export interface GeneratedSampleDataset {
  books: Book[];
  progressList: Progress[];
  pdfBlobs: Array<{ pdfFileId: string; blob: Blob }>;
  highlights: Highlight[];
  journal: JournalEntry[];
  bookmarks: Bookmark[];
  sessions: ReadingSession[];
}

export function generateSampleLibraryDataset(referenceDate: Date = new Date()): GeneratedSampleDataset {
  const nowIso = referenceDate.toISOString();
  const books: Book[] = [];
  const progressList: Progress[] = [];
  const pdfBlobs: Array<{ pdfFileId: string; blob: Blob }> = [];

  for (let i = 0; i < SAMPLE_SPECS.length; i++) {
    const spec = SAMPLE_SPECS[i];
    const pdfFileId = `pdf-${spec.id}`;

    // Pad sample pages so the generated PDF matches spec.totalPages accurately
    const pages: SamplePdfPage[] = [...spec.samplePages];
    while (pages.length < spec.totalPages) {
      const idx = pages.length + 1;
      pages.push({
        heading: `Section ${idx}: Field Notes & Reflections`,
        paragraphs: [
          `${spec.title} — ${spec.author}.`,
          `Deliberate reading builds mental clarity. Returning to the same ideas across quiet mornings turns passing inspiration into steady discipline and focus.`,
          `Key reflection on page ${idx}: small improvements in habit, attention, and patience compound quietly over time.`,
        ],
      });
    }

    const blob = buildTextPdfBlob(spec.title, spec.author, pages);
    pdfBlobs.push({ pdfFileId, blob });

    const coverDataUrl = renderEditorialCoverDataUrl(spec);
    const addedAt = subDays(referenceDate, 45 - i).toISOString();
    const lastReadAt =
      spec.status === 'ongoing'
        ? subDays(referenceDate, i === 0 ? 0 : i).toISOString()
        : spec.status === 'completed'
          ? subDays(referenceDate, 10 + i).toISOString()
          : undefined;
    const completedAt =
      spec.status === 'completed' ? subDays(referenceDate, 8 + i).toISOString() : undefined;

    const completionType: CompletionType | undefined =
      spec.status === 'completed'
        ? spec.id === 'sample-essentialism'
          ? 'skimmed'
          : 'read'
        : undefined;

    const progress = createInitialProgress(spec.id, spec.totalPages, spec.status, completedAt);
    progress.position = Math.max(1, spec.currentPage || 1);
    progress.rangeDetected = true;
    if (spec.status === 'completed') {
      progress.completionType = completionType;
      progress.completedAt = completedAt;
      for (let pg = 1; pg <= spec.totalPages; pg++) {
        progress.pageStates[pg] = completionType === 'skimmed' && pg % 3 !== 0 ? 1 : 2;
        progress.dwellMs[pg] = completionType === 'skimmed' && pg % 3 !== 0 ? 4500 : 18_000;
      }
      const readPages = progress.pageStates.filter((s) => s === 2).length;
      const skimmedPages = progress.pageStates.filter((s) => s === 1).length;
      const activeMs = progress.dwellMs.reduce((a, b) => a + b, 0);
      progress.completions = [
        {
          round: 1,
          type: completionType ?? 'read',
          completedAt: completedAt ?? nowIso,
          readPages,
          skimmedPages,
          activeMs,
        },
      ];
    } else if (spec.status === 'ongoing') {
      const target = Math.min(spec.totalPages, Math.max(1, spec.currentPage));
      for (let pg = 1; pg <= target; pg++) {
        // Simulate realistic read + occasional skimmed gaps for honest PageMap
        const isGap = pg > 12 && pg % 9 === 0;
        progress.pageStates[pg] = isGap ? 1 : 2;
        progress.dwellMs[pg] = isGap ? 3200 : 16_000;
      }
    }
    progressList.push(progress);

    books.push({
      id: spec.id,
      title: spec.title,
      author: spec.author,
      category: spec.category,
      tags: spec.tags,
      totalPages: spec.totalPages,
      currentPage: spec.currentPage,
      status: spec.status,
      completionType,
      pdfFileId,
      coverDataUrl,
      coverColor: spec.coverColor,
      synopsis: spec.synopsis,
      publishedYear: spec.publishedYear,
      addedAt,
      startedAt: spec.status !== 'not-started' ? subDays(referenceDate, 28 - i).toISOString() : undefined,
      completedAt,
      lastReadAt,
      isSample: true,
    });
  }

  const hlSeeds: Array<{
    id: string;
    bookId: string;
    pageNumber: number;
    text: string;
    note?: string;
    color: Highlight['color'];
    daysAgo: number;
  }> = [
    {
      id: 'sample-hl-1',
      bookId: 'sample-atomic-habits',
      pageNumber: 2,
      text: 'Habits are the compound interest of self-improvement.',
      note: 'Discipline compounds when systems remain steady.',
      color: 'yellow',
      daysAgo: 4,
    },
    {
      id: 'sample-hl-2',
      bookId: 'sample-atomic-habits',
      pageNumber: 3,
      text: 'You do not rise to the level of your goals. You fall to the level of your systems.',
      note: 'Design better daily systems and identity.',
      color: 'green',
      daysAgo: 3,
    },
    {
      id: 'sample-hl-3',
      bookId: 'sample-atomic-habits',
      pageNumber: 3,
      text: 'Every action you take is a vote for the type of person you wish to become.',
      note: 'Identity precedes lasting habit change.',
      color: 'blue',
      daysAgo: 2,
    },
    {
      id: 'sample-hl-4',
      bookId: 'sample-deep-work',
      pageNumber: 2,
      text: 'Schedule uninterrupted blocks of focus and protect them with clear rituals.',
      note: 'Protect morning focus from shallow interruptions.',
      color: 'yellow',
      daysAgo: 5,
    },
    {
      id: 'sample-hl-5',
      bookId: 'sample-the-alchemist',
      pageNumber: 2,
      text: 'Patience and attention allow a traveler to recognize quiet opportunities.',
      note: 'Patience sharpens focus and perception.',
      color: 'pink',
      daysAgo: 1,
    },
    {
      id: 'sample-hl-6',
      bookId: 'sample-meditations',
      pageNumber: 2,
      text: 'You have power over your mind—not outside events.',
      note: 'Discipline of attention and calm patience.',
      color: 'blue',
      daysAgo: 12,
    },
  ];

  const highlights: Highlight[] = hlSeeds.map((seed, idx) => ({
    id: seed.id,
    bookId: seed.bookId,
    pageNumber: seed.pageNumber,
    text: seed.text,
    note: seed.note,
    color: seed.color,
    rects: [{ x: 0.12, y: 0.25 + (idx % 3) * 0.12, width: 0.72, height: 0.035 }],
    keywords: extractKeywords(`${seed.text} ${seed.note ?? ''}`),
    createdAt: subDays(referenceDate, seed.daysAgo).toISOString(),
  }));

  const journal: JournalEntry[] = [
    {
      id: 'sample-j-1',
      bookId: 'sample-atomic-habits',
      pageNumber: 68,
      quote: 'Every action you take is a vote for the type of person you wish to become.',
      content:
        'Shifting from outcome goals to identity habits keeps discipline steady even on low-energy mornings.',
      keywords: extractKeywords('identity habits discipline steady systems'),
      highlightId: 'sample-hl-3',
      createdAt: subDays(referenceDate, 2).toISOString(),
    },
    {
      id: 'sample-j-2',
      bookId: 'sample-deep-work',
      pageNumber: 142,
      quote: 'Attention residue occurs whenever you switch rapidly between tasks.',
      content:
        'Ninety minutes of uninterrupted focus before opening messages doubles depth and calm.',
      keywords: extractKeywords('focus uninterrupted discipline systems'),
      createdAt: subDays(referenceDate, 5).toISOString(),
    },
    {
      id: 'sample-j-3',
      bookId: 'sample-the-alchemist',
      pageNumber: 52,
      content:
        'Patience turns slow chapters into durable habit and clearer identity.',
      keywords: extractKeywords('patience habit identity focus'),
      createdAt: subDays(referenceDate, 0).toISOString(),
    },
  ];

  const bookmarks: Bookmark[] = [
    {
      id: 'sample-bm-1',
      bookId: 'sample-atomic-habits',
      pageNumber: 2,
      label: 'Tiny Gains',
      createdAt: subDays(referenceDate, 4).toISOString(),
    },
    {
      id: 'sample-bm-2',
      bookId: 'sample-atomic-habits',
      pageNumber: 3,
      label: 'Identity & Systems',
      createdAt: subDays(referenceDate, 2).toISOString(),
    },
    {
      id: 'sample-bm-3',
      bookId: 'sample-the-alchemist',
      pageNumber: 2,
      label: 'The Shepherd',
      createdAt: subDays(referenceDate, 1).toISOString(),
    },
  ];

  // Generate 57 realistic reading days over the last year including a current 5-day streak
  const sessions: ReadingSession[] = [];
  const activeOffsets = [
    0, 1, 2, 3, 4, // 5-day active streak
    7, 8, 9, 10, 11, 12, // 6-day longest streak
    15, 16, 18, 20, 21, 24, 26, 28, 30, 32, 35, 38, 40, 42, 45, 48, 50,
    55, 58, 62, 66, 70, 74, 79, 85, 92, 98, 105, 112, 120, 128, 136, 145,
    154, 165, 176, 188, 202, 215, 228, 242, 260, 280, 300, 320, 340,
  ];
  const activeBookPool = [
    'sample-atomic-habits',
    'sample-the-alchemist',
    'sample-deep-work',
    'sample-meditations',
    'sample-antifragile',
  ];

  activeOffsets.forEach((daysAgo, i) => {
    const d = subDays(referenceDate, daysAgo);
    const dateKey = format(d, 'yyyy-MM-dd');
    const bookId = daysAgo === 0 ? 'sample-the-alchemist' : activeBookPool[i % activeBookPool.length];
    const minutes = daysAgo === 0 ? 24 : 12 + ((i * 11) % 38);
    const pagesCount = daysAgo === 0 ? 12 : 6 + ((i * 5) % 18);
    const pagesViewed = Array.from({ length: pagesCount }, (_, p) => p + 1);
    sessions.push({
      id: `sample-sess-${i}`,
      bookId,
      date: dateKey,
      startedAt: `${dateKey}T08:15:00.000Z`,
      endedAt: `${dateKey}T08:${String(15 + Math.min(44, minutes)).padStart(2, '0')}:00.000Z`,
      durationSeconds: minutes * 60,
      pagesViewed,
      pagesRead: pagesCount,
    });
  });

  // Ensure lastReadAt on Atomic Habits & The Alchemist reflects recent activity
  books[0].lastReadAt = nowIso;

  return { books, progressList, pdfBlobs, highlights, journal, bookmarks, sessions };
}
