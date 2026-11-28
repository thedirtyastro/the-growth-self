export const CFG = {
  VISIT_MIN_MS: 1000,
  IDLE_MS: 90000,
  POSITION_DWELL_MS: 5000,
  JUMP_PAGES: 10,
  UNDO_CHIP_MS: 15000,
  WPM_CAP: 600,
  MIN_S: 2,
  MAX_S: 25,
  NO_TEXT_S: 6,
  BACK_MATTER_AFTER: 0.85,
  PROMPT_AT: 0.9,
  PROMPT_STEP: 0.05,
  WEAK_COVERAGE: 0.6,
  ONGOING_VIEWED: 0.1,
} as const;

export type PageState = 0 | 1 | 2; // 0 = unseen, 1 = skimmed, 2 = read

export type NavSource = 'turn' | 'toc' | 'field' | 'scrub';

export interface Visit {
  pages: number[];
  activeMs: number;
  totalVisitMs: number;
  settledAt: number;
  jumped: boolean;
}

export type FinishChoice = 'read' | 'skimmed' | 'elsewhere' | 'anyway' | 'notyet';

export interface PromptContext {
  onContentEnd: boolean;
  leaving: 'forward' | 'close' | null;
  opening: boolean;
}

export type PromptReason = 'end-of-book' | 'close-at-end' | 'catch-up' | null;

export interface ProgressStats {
  contentPages: number;
  readPages: number;
  skimmedPages: number;
  unseenPages: number;
  coverage: number;
  percent: number;
  viewedRatio: number;
  activeMs: number;
}

export type WordCountLookup =
  | Array<number | null | undefined>
  | ((pageNumber: number) => number | null | undefined);
