/**
 * Vocabulary — the heart of long-term learning.
 *
 * Entries are stored in IndexedDB (`vocab` store) and mirrored in a zustand
 * store for reactive UI. Grammar fields that are unknown stay `null` — the
 * app never fabricates linguistic data.
 *
 * Every entry carries an append-only `reviewHistory` log (one record per
 * submitted rating). Analytics, word details and the flashcard summary all
 * read from this single source of truth; playing audio or opening a word
 * never touches it.
 *
 * Duplicate handling: saving an existing German word merges into the existing
 * entry (fills missing fields, optionally appends the example sentence) and
 * never silently creates a second copy.
 */

import { create } from 'zustand';
import { vocabGetAll, vocabPut, vocabDelete, vocabClear } from './storage/idb';
import {
  newReviewState,
  schedule,
  learningState,
  isMastered,
  isDifficult,
  recallStats,
  type Rating,
  type ReviewRecord,
  type ReviewState,
} from './review';
import { recordReview } from './stats';

export type PartOfSpeech = 'noun' | 'verb' | 'adjective' | 'adverb' | 'phrase' | 'question' | 'number' | 'other';
export type CefrLevel = 'A1' | 'A2' | 'B1';

export interface VocabExample {
  german: string;
  bangla: string | null;
}

export interface VocabEntry {
  id: string;
  german: string;
  banglaMeaning: string | null;
  englishMeaning: string | null;
  bengaliPronunciation: string;
  partOfSpeech: PartOfSpeech | null;
  /** der / die / das for nouns. */
  article: string | null;
  plural: string | null;
  cefrLevel: CefrLevel | null;
  tags: string[];
  notes: string;
  favorite: boolean;
  examples: VocabExample[];
  sourceSentence: string | null;
  review: ReviewState;
  /** Append-only log of submitted ratings (capped at 500 records). */
  reviewHistory?: ReviewRecord[];
  createdAt: number;
  updatedAt: number;
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Safe accessor — entries saved before this field existed have no log. */
export function reviewHistoryOf(entry: VocabEntry): ReviewRecord[] {
  return entry.reviewHistory ?? [];
}

/** Normalized key for duplicate detection (umlaut-folded, punctuation-free). */
export function normalizeGermanKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const MAX_HISTORY = 500;

export function makeEntry(init: Partial<VocabEntry> & { german: string }): VocabEntry {
  const now = Date.now();
  return {
    id: init.id ?? newId(),
    german: init.german.trim(),
    banglaMeaning: init.banglaMeaning ?? null,
    englishMeaning: init.englishMeaning ?? null,
    bengaliPronunciation: init.bengaliPronunciation ?? '',
    partOfSpeech: init.partOfSpeech ?? null,
    article: init.article ?? null,
    plural: init.plural ?? null,
    cefrLevel: init.cefrLevel ?? null,
    tags: init.tags ?? [],
    notes: init.notes ?? '',
    favorite: init.favorite ?? false,
    examples: init.examples ?? [],
    sourceSentence: init.sourceSentence ?? null,
    review: init.review ?? newReviewState(),
    reviewHistory: init.reviewHistory ?? [],
    createdAt: init.createdAt ?? now,
    updatedAt: init.updatedAt ?? now,
  };
}

/** True when the incoming save should merge into an existing entry. */
export function findDuplicate(entries: VocabEntry[], german: string): VocabEntry | null {
  const key = normalizeGermanKey(german);
  if (!key) return null;
  return entries.find((e) => normalizeGermanKey(e.german) === key) ?? null;
}

/**
 * Merge an incoming save into an existing entry: fill empty fields, append
 * the example sentence when it is genuinely new, preserve notes/history.
 */
export function mergeEntry(existing: VocabEntry, incoming: Partial<VocabEntry>): VocabEntry {
  const examples = [...existing.examples];
  const newExample = incoming.sourceSentence;
  if (newExample && !examples.some((ex) => ex.german === newExample) && newExample !== existing.german) {
    examples.push({ german: newExample, bangla: incoming.banglaMeaning ?? null });
    if (examples.length > 5) examples.shift();
  }
  return {
    ...existing,
    banglaMeaning: existing.banglaMeaning ?? incoming.banglaMeaning ?? null,
    englishMeaning: existing.englishMeaning ?? incoming.englishMeaning ?? null,
    bengaliPronunciation: incoming.bengaliPronunciation || existing.bengaliPronunciation,
    partOfSpeech: existing.partOfSpeech ?? incoming.partOfSpeech ?? null,
    article: existing.article ?? incoming.article ?? null,
    cefrLevel: existing.cefrLevel ?? incoming.cefrLevel ?? null,
    sourceSentence: existing.sourceSentence ?? incoming.sourceSentence ?? null,
    examples,
    updatedAt: Date.now(),
  };
}

// ── Search / filter / sort (pure, testable) ──────────────────────────

export type VocabSort =
  | 'newest'
  | 'oldest'
  | 'alphabetical'
  | 'recentlyReviewed'
  | 'dueFirst'
  | 'lowestRecall'
  | 'mostReviewed';

export interface VocabFilters {
  query: string;
  level: CefrLevel | 'all';
  pos: PartOfSpeech | 'all';
  favoriteOnly: boolean;
  dueOnly: boolean;
  difficultOnly: boolean;
  learnedOnly: boolean;
  recentOnly: boolean;
  sort: VocabSort;
}

export const DEFAULT_FILTERS: VocabFilters = {
  query: '',
  level: 'all',
  pos: 'all',
  favoriteOnly: false,
  dueOnly: false,
  difficultOnly: false,
  learnedOnly: false,
  recentOnly: false,
  sort: 'newest',
};

export function filtersAreDefault(filters: VocabFilters): boolean {
  return (
    filters.query.trim() === '' &&
    filters.level === 'all' &&
    filters.pos === 'all' &&
    !filters.favoriteOnly &&
    !filters.dueOnly &&
    !filters.difficultOnly &&
    !filters.learnedOnly &&
    !filters.recentOnly
  );
}

const RECENT_WINDOW = 7 * 86_400_000;

/**
 * Search fold: lowercase + DIN-5008-style umlaut folding (ä→ae, ö→oe,
 * ü→ue, ß→ss) so queries typed either way find the same words, + strip
 * punctuation. Bengali characters are KEPT so Bangla search works. Only
 * used for search — duplicate detection has its own stricter normalizer.
 */
function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s\u0980-\u09ff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Everything a word can be found by — German, meanings, pronunciation,
 *  examples, notes and tags. Umlauts fold so "ae"-style queries miss less. */
function haystack(e: VocabEntry): string {
  return [
    fold(e.german),
    fold(e.banglaMeaning ?? ''),
    fold(e.englishMeaning ?? ''),
    fold(e.bengaliPronunciation),
    fold(e.notes),
    ...e.examples.map((ex) => `${fold(ex.german)} ${fold(ex.bangla ?? '')}`),
    ...e.tags.map(fold),
  ].join(' ');
}

export function searchEntries(
  entries: VocabEntry[],
  filters: VocabFilters,
  now = Date.now()
): VocabEntry[] {
  const q = fold(filters.query);
  const filtered = entries.filter((e) => {
    if (filters.level !== 'all' && e.cefrLevel !== filters.level) return false;
    if (filters.pos !== 'all' && e.partOfSpeech !== filters.pos) return false;
    if (filters.favoriteOnly && !e.favorite) return false;
    if (filters.dueOnly && e.review.dueAt > now) return false;
    if (filters.difficultOnly && !isDifficult(e.review, e.reviewHistory)) return false;
    if (filters.learnedOnly && !isMastered(e.review)) return false;
    if (filters.recentOnly && now - e.createdAt > RECENT_WINDOW) return false;
    if (q && !haystack(e).includes(q)) return false;
    return true;
  });

  // Unreviewed words (rate = null) sort first on "lowest recall" — they
  // have no positive evidence yet, so they surface for practice.
  const rateOf = (e: VocabEntry): number => recallStats(e.reviewHistory).rate ?? -1;
  const attemptsOf = (e: VocabEntry): number => recallStats(e.reviewHistory).attempts;

  switch (filters.sort) {
    case 'alphabetical':
      return filtered.sort((a, b) => a.german.localeCompare(b.german, 'de'));
    case 'dueFirst':
      return filtered.sort((a, b) => a.review.dueAt - b.review.dueAt);
    case 'oldest':
      return filtered.sort((a, b) => a.createdAt - b.createdAt);
    case 'recentlyReviewed':
      return filtered.sort((a, b) => {
        const al = a.review.lastReviewedAt ?? 0;
        const bl = b.review.lastReviewedAt ?? 0;
        if (al !== bl) return bl - al;
        return b.createdAt - a.createdAt;
      });
    case 'lowestRecall':
      return filtered.sort((a, b) => {
        const ra = rateOf(a);
        const rb = rateOf(b);
        if (ra !== rb) return ra - rb;
        return attemptsOf(b) - attemptsOf(a);
      });
    case 'mostReviewed':
      return filtered.sort((a, b) => attemptsOf(b) - attemptsOf(a) || b.createdAt - a.createdAt);
    default:
      return filtered.sort((a, b) => b.createdAt - a.createdAt);
  }
}

// ── Aggregates (all honest, derived from stored data) ────────────────

function isSameLocalDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export interface VocabSummary {
  total: number;
  mastered: number;
  learning: number;
  fresh: number;
  due: number;
  difficult: number;
  favorites: number;
  /** Saved today (createdAt is today). */
  addedToday: number;
  /** First-ever successful recall happened today (excluding added today). */
  learnedToday: number;
  /** addedToday + learnedToday — the "আজ শিখেছি" card. */
  todayTotal: number;
  /** All review attempts across the collection. */
  attempts: number;
  correct: number;
}

export function summarize(entries: VocabEntry[], now = Date.now()): VocabSummary {
  let mastered = 0;
  let learning = 0;
  let fresh = 0;
  let due = 0;
  let difficult = 0;
  let favorites = 0;
  let addedToday = 0;
  let learnedToday = 0;
  let attempts = 0;
  let correct = 0;

  for (const e of entries) {
    const state = learningState(e.review);
    if (state === 'mastered') mastered += 1;
    else if (state === 'learning') learning += 1;
    else fresh += 1;
    if (e.review.dueAt <= now) due += 1;
    if (isDifficult(e.review, e.reviewHistory)) difficult += 1;
    if (e.favorite) favorites += 1;
    const added = isSameLocalDay(e.createdAt, now);
    if (added) addedToday += 1;
    const first = recallStats(e.reviewHistory).firstCorrectAt;
    if (first !== null && isSameLocalDay(first, now) && !added) learnedToday += 1;
    const stats = recallStats(e.reviewHistory);
    attempts += stats.attempts;
    correct += stats.correct;
  }

  return {
    total: entries.length,
    mastered,
    learning,
    fresh,
    due,
    difficult,
    favorites,
    addedToday,
    learnedToday,
    todayTotal: addedToday + learnedToday,
    attempts,
    correct,
  };
}

/** Words added per local day, oldest → newest, for the 14-day growth strip. */
export function addedPerDay(entries: VocabEntry[], days: number, now = Date.now()): Array<{ key: string; count: number }> {
  const out: Array<{ key: string; count: number }> = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const dayStart = new Date(now - i * 86_400_000);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = dayStart.getTime() + 86_400_000;
    const count = entries.filter((e) => e.createdAt >= dayStart.getTime() && e.createdAt < dayEnd).length;
    out.push({ key: `${dayStart.getMonth() + 1}/${dayStart.getDate()}`, count });
  }
  return out;
}

// ── Flashcard deck building ──────────────────────────────────────────

export type FlashcardScope =
  | { kind: 'due' }
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'difficult' }
  | { kind: 'recent' }
  | { kind: 'level'; level: CefrLevel }
  | { kind: 'word'; id: string }
  | { kind: 'list'; ids: string[] };

export const FLASHCARD_CAP = 50;

function shuffleIds(ids: string[]): string[] {
  const arr = [...ids];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Build an ordered deck of entry ids for a practice session. */
export function buildDeck(
  entries: VocabEntry[],
  scope: FlashcardScope,
  options: { shuffle?: boolean; cap?: number; now?: number } = {}
): string[] {
  const { shuffle = false, cap = FLASHCARD_CAP, now = Date.now() } = options;
  const byId = new Map(entries.map((e) => [e.id, e]));
  let ids: string[];

  switch (scope.kind) {
    case 'due':
      ids = entries
        .filter((e) => e.review.dueAt <= now)
        .sort((a, b) => a.review.dueAt - b.review.dueAt)
        .map((e) => e.id);
      break;
    case 'all':
      ids = entries.map((e) => e.id);
      break;
    case 'favorites':
      ids = entries.filter((e) => e.favorite).map((e) => e.id);
      break;
    case 'difficult':
      ids = entries.filter((e) => isDifficult(e.review, e.reviewHistory)).map((e) => e.id);
      break;
    case 'recent':
      ids = entries
        .filter((e) => now - e.createdAt <= RECENT_WINDOW)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((e) => e.id);
      break;
    case 'level':
      ids = entries.filter((e) => e.cefrLevel === scope.level).map((e) => e.id);
      break;
    case 'word':
      ids = byId.has(scope.id) ? [scope.id] : [];
      break;
    case 'list':
      ids = scope.ids.filter((id) => byId.has(id));
      break;
  }

  if (shuffle) ids = shuffleIds(ids);
  return ids.slice(0, Math.max(1, cap));
}

// ── Export / import ──────────────────────────────────────────────────

export interface ExportPayload {
  app: 'deutschflow';
  schema: 2;
  exportedAt: string;
  /** Mastery criterion in effect when the backup was made. */
  mastery: { minRecalls: number; minIntervalDays: number };
  entries: VocabEntry[];
}

export function exportPayload(entries: VocabEntry[]): ExportPayload {
  return {
    app: 'deutschflow',
    schema: 2,
    exportedAt: new Date().toISOString(),
    mastery: { minRecalls: 3, minIntervalDays: 7 },
    entries,
  };
}

const CSV_COLUMNS = [
  'german',
  'article',
  'bangla_meaning',
  'english_meaning',
  'pronunciation_bn',
  'part_of_speech',
  'level',
  'plural',
  'tags',
  'notes',
  'favorite',
  'examples',
  'added_at',
  'total_reviews',
  'recall_rate',
] as const;

/** CSV for spreadsheets — UTF-8 with BOM so Excel keeps Bengali + umlauts. */
export function toCSV(entries: VocabEntry[]): string {
  const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = entries.map((e) => {
    const stats = recallStats(e.reviewHistory);
    return [
      e.german,
      e.article,
      e.banglaMeaning,
      e.englishMeaning,
      e.bengaliPronunciation,
      e.partOfSpeech,
      e.cefrLevel,
      e.plural,
      e.tags.join('|'),
      e.notes,
      e.favorite ? '1' : '0',
      e.examples.map((ex) => (ex.bangla ? `${ex.german}::${ex.bangla}` : ex.german)).join(' | '),
      new Date(e.createdAt).toISOString(),
      stats.attempts,
      stats.rate === null ? '' : (stats.rate * 100).toFixed(1) + '%',
    ]
      .map(esc)
      .join(',');
  });
  return ['\uFEFF' + CSV_COLUMNS.join(','), ...rows].join('\r\n');
}

const VALID_RATINGS: ReadonlySet<string> = new Set(['again', 'hard', 'good', 'easy']);

/** Parse + validate an imported payload. Invalid entries are skipped and counted. */
export function parseImport(raw: string): { entries: VocabEntry[]; skipped: number; historyRecords: number } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { entries: [], skipped: 0, historyRecords: 0 };
  }
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as ExportPayload).entries)
      ? (data as ExportPayload).entries
      : [];
  const entries: VocabEntry[] = [];
  let skipped = 0;
  let historyRecords = 0;
  for (const item of list) {
    const candidate = item as Partial<VocabEntry> | null;
    if (!candidate || typeof candidate.german !== 'string' || !candidate.german.trim()) {
      skipped += 1;
      continue;
    }
    // Validate the review history: unknown ratings / malformed rows are dropped
    // one by one instead of rejecting the whole word.
    let history: ReviewRecord[] = [];
    if (Array.isArray(candidate.reviewHistory)) {
      history = candidate.reviewHistory.filter((rec) => {
        const r = rec as Partial<ReviewRecord> | null;
        const ok =
          !!r &&
          typeof r.at === 'number' &&
          typeof r.prevInterval === 'number' &&
          typeof r.newInterval === 'number' &&
          typeof r.rating === 'string' &&
          VALID_RATINGS.has(r.rating);
        return ok;
      });
      historyRecords += history.length;
    }
    const entry = makeEntry({ ...(candidate as Partial<VocabEntry> & { german: string }), reviewHistory: history });
    entries.push(entry);
  }
  return { entries, skipped, historyRecords };
}

export type ImportMode = 'merge' | 'skip' | 'replace';

export interface ImportPlan {
  /** Brand-new entries to insert. */
  toAdd: VocabEntry[];
  /** Merged updates for entries that already exist (keeps their id). */
  toUpdate: VocabEntry[];
  /** How many imported words collided with existing ones. */
  duplicates: number;
  /** Review records arriving with the file (informational). */
  historyRecords: number;
  /** True when the mode will delete the current collection first. */
  destructive: boolean;
}

/**
 * Plan an import without touching storage. Existing review history is never
 * overwritten in merge mode — it is only filled in when the local entry has
 * none at all (e.g. restoring from a backup).
 */
export function planImport(
  existing: VocabEntry[],
  imported: VocabEntry[],
  mode: ImportMode
): ImportPlan {
  const historyRecords = imported.reduce((sum, e) => sum + reviewHistoryOf(e).length, 0);
  if (mode === 'replace') {
    return { toAdd: imported, toUpdate: [], duplicates: 0, historyRecords, destructive: true };
  }
  const toAdd: VocabEntry[] = [];
  const toUpdate: VocabEntry[] = [];
  let duplicates = 0;
  for (const incoming of imported) {
    const dup = findDuplicate(existing, incoming.german);
    if (!dup) {
      toAdd.push(incoming);
      continue;
    }
    duplicates += 1;
    if (mode === 'skip') continue;
    // merge
    const merged = mergeEntry(dup, incoming);
    if (reviewHistoryOf(dup).length === 0 && reviewHistoryOf(incoming).length > 0) {
      merged.reviewHistory = incoming.reviewHistory;
      // Adopt the schedule too, but only when the local card was never reviewed.
      const neverReviewed = dup.review.lastReviewedAt === null && dup.review.repetitions === 0;
      if (neverReviewed) merged.review = incoming.review;
    }
    toUpdate.push(merged);
  }
  return { toAdd, toUpdate, duplicates, historyRecords, destructive: false };
}

// ── Reactive store (zustand mirror of IndexedDB) ─────────────────────

interface VocabState {
  entries: VocabEntry[];
  loaded: boolean;
  load: () => Promise<void>;
  /** Save a word; merges duplicates. Returns the resulting status. */
  saveWord: (init: Partial<VocabEntry> & { german: string }) => Promise<'created' | 'merged'>;
  update: (id: string, patch: Partial<VocabEntry>) => Promise<void>;
  /** Rate the current card: schedules, appends history, persists, counts stats. */
  reviewWord: (id: string, rating: Rating, now?: number) => Promise<VocabEntry | null>;
  remove: (id: string) => Promise<void>;
  replaceAll: (entries: VocabEntry[]) => Promise<void>;
  /** Apply a planned import (merge/skip/replace) in one state transition. */
  applyImport: (plan: ImportPlan) => Promise<void>;
  clearAll: () => Promise<void>;
  persist: (entry: VocabEntry) => Promise<void>;
}

export const useVocab = create<VocabState>()((set, get) => ({
  entries: [],
  loaded: false,

  load: async () => {
    const all = await vocabGetAll<VocabEntry>();
    all.sort((a, b) => b.createdAt - a.createdAt);
    set({ entries: all, loaded: true });
  },

  saveWord: async (init) => {
    const existing = findDuplicate(get().entries, init.german);
    if (existing) {
      const merged = mergeEntry(existing, init);
      await vocabPut(merged);
      set((s) => ({ entries: s.entries.map((e) => (e.id === merged.id ? merged : e)) }));
      return 'merged';
    }
    const entry = makeEntry(init);
    await vocabPut(entry);
    set((s) => ({ entries: [entry, ...s.entries] }));
    return 'created';
  },

  update: async (id, patch) => {
    const current = get().entries.find((e) => e.id === id);
    if (!current) return;
    const next: VocabEntry = { ...current, ...patch, id, updatedAt: Date.now() };
    await vocabPut(next);
    set((s) => ({ entries: s.entries.map((e) => (e.id === id ? next : e)) }));
  },

  reviewWord: async (id, rating, now = Date.now()) => {
    const current = get().entries.find((e) => e.id === id);
    if (!current) return null;
    const prev = current.review;
    const next = schedule(prev, rating, now);
    const record: ReviewRecord = {
      at: now,
      rating,
      prevInterval: prev.interval,
      newInterval: next.interval,
      correct: rating !== 'again',
    };
    const history = [...reviewHistoryOf(current), record].slice(-MAX_HISTORY);
    const updated: VocabEntry = { ...current, review: next, reviewHistory: history, updatedAt: now };
    await vocabPut(updated);
    set((s) => ({ entries: s.entries.map((e) => (e.id === id ? updated : e)) }));
    void recordReview();
    return updated;
  },

  remove: async (id) => {
    await vocabDelete(id);
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
  },

  replaceAll: async (entries) => {
    for (const e of entries) await vocabPut(e);
    set({ entries: [...entries].sort((a, b) => b.createdAt - a.createdAt) });
  },

  applyImport: async (plan) => {
    if (plan.destructive) await vocabClear();
    for (const e of plan.toAdd) await vocabPut(e);
    for (const e of plan.toUpdate) await vocabPut(e);
    const next = plan.destructive
      ? [...plan.toAdd]
      : [...get().entries.filter((e) => !plan.toAdd.some((a) => a.id === e.id) && !plan.toUpdate.some((u) => u.id === e.id)), ...plan.toAdd, ...plan.toUpdate];
    next.sort((a, b) => b.createdAt - a.createdAt);
    set({ entries: next });
  },

  clearAll: async () => {
    await vocabClear();
    set({ entries: [] });
  },

  persist: async (entry) => {
    await vocabPut(entry);
    set((s) => ({ entries: s.entries.map((e) => (e.id === entry.id ? entry : e)) }));
  },
}));
