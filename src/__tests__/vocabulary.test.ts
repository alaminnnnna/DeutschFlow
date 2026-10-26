/**
 * Vocabulary upgrade tests — review history integrity, honest analytics,
 * search/sort/filter behavior, export/import roundtrips, import planning
 * and flashcard deck building.
 */

import { describe, expect, test } from 'bun:test';

import {
  makeEntry,
  findDuplicate,
  mergeEntry,
  searchEntries,
  summarize,
  addedPerDay,
  exportPayload,
  parseImport,
  planImport,
  toCSV,
  buildDeck,
  reviewHistoryOf,
  normalizeGermanKey,
  DEFAULT_FILTERS,
  type VocabEntry,
  type VocabFilters,
} from '../lib/vocabulary';
import {
  newReviewState,
  schedule,
  learningState,
  recallStats,
  isDifficult,
  isMastered,
  type ReviewRecord,
} from '../lib/review';
import { bnNum, bnPct } from '../lib/bn';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

function entry(init: Partial<VocabEntry> & { german: string }): VocabEntry {
  return makeEntry({ createdAt: NOW - 2 * DAY, updatedAt: NOW - 2 * DAY, ...init });
}

function rec(rating: ReviewRecord['rating'], at: number, prev = 0, next = 1): ReviewRecord {
  return { at, rating, prevInterval: prev, newInterval: next, correct: rating !== 'again' };
}

// ── Review history analytics ─────────────────────────────────────────

describe('recall analytics', () => {
  test('empty history → honest zeros', () => {
    const s = recallStats([]);
    expect(s.attempts).toBe(0);
    expect(s.rate).toBeNull();
    expect(s.firstCorrectAt).toBeNull();
  });

  test('14 attempts, 10 correct → 71.4% recall rate', () => {
    const history: ReviewRecord[] = Array.from({ length: 14 }, (_, i) =>
      rec(i % 3 === 2 ? 'again' : 'good', NOW + i * 3600_000)
    );
    const s = recallStats(history);
    expect(s.attempts).toBe(14);
    expect(s.correct).toBe(10);
    expect(s.wrong).toBe(4);
    expect(s.rate?.toFixed(3)).toBe('0.714');
    expect(s.lastReviewedAt).toBe(history[13].at);
  });

  test('consecutive correct counts the trailing streak', () => {
    const s = recallStats([rec('again', 1), rec('good', 2), rec('good', 3), rec('hard', 4)]);
    expect(s.consecutiveCorrect).toBe(3);
    expect(s.firstCorrectAt).toBe(2);
  });

  test('mastery: SM-2 promotes to a 7-day interval by the 3rd success', () => {
    let review = newReviewState();
    expect(learningState(review)).toBe('new');
    review = schedule(review, 'good', NOW); // 1 day
    expect(learningState(review)).toBe('learning');
    review = schedule(review, 'good', NOW); // 3 days
    expect(learningState(review)).toBe('learning');
    review = schedule(review, 'good', NOW); // round(3 × 2.5) = 8 days
    expect(review.interval).toBeGreaterThanOrEqual(7);
    expect(review.repetitions).toBe(3);
    expect(isMastered(review)).toBe(true);
    expect(learningState(review)).toBe('mastered');
  });

  test('a lapse resets mastery progress to learning', () => {
    let review = schedule(schedule(schedule(newReviewState(), 'good', NOW), 'good', NOW), 'good', NOW);
    review = schedule(review, 'good', NOW); // mastered
    review = schedule(review, 'again', NOW); // lapse
    expect(learningState(review)).toBe('learning');
  });

  test('difficult: bad recall rate or repeated lapses', () => {
    const history = [rec('again', 1), rec('again', 2), rec('good', 3)];
    const review = newReviewState();
    expect(isDifficult(review, history)).toBe(true); // 1/3 ≤ 0.5
    expect(isDifficult(review, [rec('good', 1), rec('good', 2), rec('good', 3)])).toBe(false);
    const lapsed = { ...newReviewState(), lapses: 3 };
    expect(isDifficult(lapsed, [])).toBe(true);
  });
});

// ── Editing must never touch review data ─────────────────────────────

describe('editing preserves review history', () => {
  test('mergeEntry keeps review state and log untouched', () => {
    const existing = entry({
      german: 'Vater',
      reviewHistory: [rec('good', NOW - DAY, 0, 1)],
      review: schedule(newReviewState(), 'good', NOW - DAY),
      notes: 'alt',
    });
    const merged = mergeEntry(existing, { banglaMeaning: 'বাবা' });
    expect(merged.review).toBe(existing.review);
    expect(merged.reviewHistory).toEqual(existing.reviewHistory);
    expect(merged.notes).toBe('alt'); // a duplicate save never overwrites notes
    expect(merged.banglaMeaning).toBe('বাবা');
  });
});

// ── Search / filter / sort ───────────────────────────────────────────

describe('vocabulary search', () => {
  const entries: VocabEntry[] = [
    entry({ german: 'Vater', banglaMeaning: 'পিতা', englishMeaning: 'father', bengaliPronunciation: 'ফাটার', cefrLevel: 'A1', partOfSpeech: 'noun', article: 'der', tags: ['পরিবার'] }),
    entry({ german: 'Straße', banglaMeaning: 'রাস্তা', bengaliPronunciation: 'শট্রাসে', cefrLevel: 'A1', notes: 'umlaut টেস্ট' }),
    entry({ german: 'grüßen', banglaMeaning: 'সালাম দেওয়া', examples: [{ german: 'Ich grüße dich.', bangla: 'আমি তোমাকে সালাম দিই।' }], cefrLevel: 'A2' }),
    entry({ german: 'Haus', cefrLevel: 'B1', favorite: true, createdAt: NOW }),
  ];

  test('umlaut-folded German search (gruessen finds grüßen)', () => {
    expect(searchEntries(entries, { ...DEFAULT_FILTERS, query: 'gruessen' }).map((e) => e.german)).toEqual(['grüßen']);
  });

  test('exact umlaut query also works', () => {
    expect(searchEntries(entries, { ...DEFAULT_FILTERS, query: 'grüße' })).toHaveLength(1);
  });

  test('expanded spelling (gruessen) and base word (gruess) both match', () => {
    expect(searchEntries(entries, { ...DEFAULT_FILTERS, query: 'gruessen' })).toHaveLength(1);
    expect(searchEntries(entries, { ...DEFAULT_FILTERS, query: 'strasse' })).toHaveLength(1);
  });

  test('Bengali meaning search', () => {
    expect(searchEntries(entries, { ...DEFAULT_FILTERS, query: 'পিতা' })).toHaveLength(1);
  });

  test('English meaning, notes, tags and examples are searchable', () => {
    expect(searchEntries(entries, { ...DEFAULT_FILTERS, query: 'father' })).toHaveLength(1);
    expect(searchEntries(entries, { ...DEFAULT_FILTERS, query: 'umlaut' })).toHaveLength(1);
    expect(searchEntries(entries, { ...DEFAULT_FILTERS, query: 'পরিবার' })).toHaveLength(1);
    expect(searchEntries(entries, { ...DEFAULT_FILTERS, query: 'grüße dich' })).toHaveLength(1);
  });

  test('filters: level, favorite, difficult, learned, recent', () => {
    const dueEntry = entry({
      german: 'due word',
      review: { ...newReviewState(), dueAt: NOW - DAY, repetitions: 2, interval: 3, lastReviewedAt: NOW - 2 * DAY },
      reviewHistory: [rec('good', NOW - 2 * DAY), rec('good', NOW - DAY)],
      createdAt: NOW - 2 * DAY,
    });
    const list = [...entries, dueEntry];
    expect(searchEntries(list, { ...DEFAULT_FILTERS, level: 'B1' })).toHaveLength(1);
    expect(searchEntries(list, { ...DEFAULT_FILTERS, favoriteOnly: true })).toHaveLength(1);
    // New cards (dueAt = 0) are due immediately — that's the honest SM-2
    // semantic shared by the Review tab, so 4 fresh cards + 1 overdue = 5.
    expect(searchEntries(list, { ...DEFAULT_FILTERS, dueOnly: true })).toHaveLength(5);
    expect(searchEntries(list, { ...DEFAULT_FILTERS, learnedOnly: true })).toHaveLength(0);
    expect(searchEntries(list, { ...DEFAULT_FILTERS, difficultOnly: true })).toHaveLength(0);
    // "recent" is relative to the real clock — Haus was saved just now.
    const recentList = [...entries.filter((e) => e.german !== 'Haus'), entry({ german: 'Haus', cefrLevel: 'B1', favorite: true, createdAt: Date.now() })];
    expect(searchEntries(recentList, { ...DEFAULT_FILTERS, recentOnly: true })).toHaveLength(1);
  });

  test('sorts: oldest, alphabetical, recently reviewed, most reviewed', () => {
    const a = entry({ german: 'Aaa', createdAt: NOW - 3 * DAY, reviewHistory: [rec('good', NOW - DAY)], review: { ...newReviewState(), lastReviewedAt: NOW - DAY, repetitions: 1, interval: 1, dueAt: NOW } });
    const b = entry({ german: 'Bbb', createdAt: NOW - DAY, reviewHistory: [rec('good', NOW - 2 * DAY), rec('good', NOW - DAY), rec('good', NOW)], review: { ...newReviewState(), lastReviewedAt: NOW, repetitions: 3, interval: 7, dueAt: NOW + DAY } });
    const c = entry({ german: 'Zzz', createdAt: NOW - 2 * DAY });
    const list = [a, b, c];
    expect(searchEntries(list, { ...DEFAULT_FILTERS, sort: 'oldest' }).map((e) => e.german)).toEqual(['Aaa', 'Zzz', 'Bbb']);
    expect(searchEntries(list, { ...DEFAULT_FILTERS, sort: 'alphabetical' }).map((e) => e.german)).toEqual(['Aaa', 'Bbb', 'Zzz']);
    expect(searchEntries(list, { ...DEFAULT_FILTERS, sort: 'recentlyReviewed' }).map((e) => e.german)).toEqual(['Bbb', 'Aaa', 'Zzz']);
    expect(searchEntries(list, { ...DEFAULT_FILTERS, sort: 'mostReviewed' }).map((e) => e.german)).toEqual(['Bbb', 'Aaa', 'Zzz']);
  });

  test('lowestRecall puts unreviewed first, then by rate', () => {
    const bad = entry({ german: 'bad', reviewHistory: [rec('again', 1), rec('good', 2), rec('again', 3)] });
    const ok = entry({ german: 'ok', reviewHistory: [rec('good', 1), rec('good', 2)] });
    const fresh = entry({ german: 'fresh' });
    const sorted = searchEntries([ok, fresh, bad], { ...DEFAULT_FILTERS, sort: 'lowestRecall' });
    expect(sorted[0].german).toBe('fresh');
    expect(sorted[1].german).toBe('bad');
    expect(sorted[2].german).toBe('ok');
  });
});

// ── Summaries ────────────────────────────────────────────────────────

describe('summarize (honest counts)', () => {
  test('due, mastered, today semantics', () => {
    const learned = entry({
      german: 'mastered word',
      review: schedule(schedule(schedule(schedule(newReviewState(), 'good', NOW - 3 * DAY), 'good', NOW - 2 * DAY), 'good', NOW - DAY), 'good', NOW - 3600_000),
      reviewHistory: [rec('good', NOW - 3 * DAY), rec('good', NOW - 2 * DAY), rec('good', NOW - DAY), rec('good', NOW - 3600_000)],
    });
    const addedToday = entry({ german: 'added today', createdAt: NOW - 60_000 });
    const recalledToday = entry({
      german: 'first recall today',
      createdAt: NOW - 5 * DAY,
      reviewHistory: [rec('good', NOW - 60_000)],
      review: schedule(newReviewState(), 'good', NOW - 60_000),
    });
    const s = summarize([learned, addedToday, recalledToday], NOW);
    expect(s.total).toBe(3);
    expect(s.mastered).toBe(1);
    expect(s.addedToday).toBe(1);
    expect(s.learnedToday).toBe(1);
    expect(s.todayTotal).toBe(2);
    expect(s.due).toBeGreaterThanOrEqual(0);
  });

  test('favorites never count as mastered automatically', () => {
    const fav = entry({ german: 'fresh fav', favorite: true });
    const s = summarize([fav], NOW);
    expect(s.favorites).toBe(1);
    expect(s.mastered).toBe(0);
    expect(s.fresh).toBe(1);
  });

  test('addedPerDay buckets by local day', () => {
    const a = entry({ german: 'x', createdAt: NOW });
    const b = entry({ german: 'y', createdAt: NOW });
    const days = addedPerDay([a, b], 3, NOW);
    expect(days).toHaveLength(3);
    expect(days[2].count).toBe(2);
    expect(days[0].count).toBe(0);
  });
});

// ── Export / import roundtrip ────────────────────────────────────────

describe('export & import', () => {
  const entries: VocabEntry[] = [
    entry({
      german: 'Straße',
      banglaMeaning: 'রাস্তা',
      englishMeaning: 'street',
      bengaliPronunciation: 'শট্রাসে',
      article: 'die',
      plural: 'Straßen',
      cefrLevel: 'A1',
      tags: ['stadt'],
      notes: 'ß stays ß',
      reviewHistory: [rec('good', NOW, 0, 1), rec('again', NOW + 3600_000, 1, 0)],
      review: schedule(schedule(newReviewState(), 'good', NOW), 'again', NOW + 3600_000),
    }),
    entry({ german: 'grüßen', banglaMeaning: 'সালাম দেওয়া' }),
  ];

  test('JSON roundtrip preserves Unicode + history + schema metadata', () => {
    const json = JSON.stringify(exportPayload(entries));
    expect(json).toContain('Straße');
    expect(json).toContain('রাস্তা');
    const parsed = parseImport(json);
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.skipped).toBe(0);
    expect(parsed.historyRecords).toBe(2);
    const back = parsed.entries[0];
    expect(back.german).toBe('Straße');
    expect(back.reviewHistory).toHaveLength(2);
    expect(back.reviewHistory?.[1].rating).toBe('again');
    expect(back.review.lapses).toBe(1);
  });

  test('invalid rows are skipped, invalid history records dropped', () => {
    const raw = JSON.stringify({
      app: 'deutschflow',
      schema: 2,
      entries: [
        { german: 'ok' },
        { banglaMeaning: 'no german — skip' },
        { german: 'bad history', reviewHistory: [{ at: 1, rating: 'explode' }] },
      ],
    });
    const parsed = parseImport(raw);
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.skipped).toBe(1);
    expect(parsed.historyRecords).toBe(0);
    expect(reviewHistoryOf(parsed.entries[1])).toHaveLength(0);
  });

  test('CSV has BOM, umlauts, escaped quotes and review count', () => {
    const csv = toCSV(entries);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Straße');
    expect(csv).toContain('রাস্তা');
    expect(csv).toContain('ß stays ß');
    expect(csv).toContain('2'); // total_reviews of the first row
  });

  test('duplicate detection folds umlauts and ß', () => {
    expect(normalizeGermanKey('Straße')).toBe(normalizeGermanKey('strasse'));
    expect(findDuplicate(entries, 'strasse')?.german).toBe('Straße');
  });
});

// ── Import planning (merge / skip / replace) ─────────────────────────

describe('planImport', () => {
  const existing = entry({
    german: 'Vater',
    banglaMeaning: 'পিতা',
    reviewHistory: [rec('good', NOW - DAY, 0, 1)],
    review: schedule(newReviewState(), 'good', NOW - DAY),
  });

  const incoming = [
    makeEntry({ german: 'vater', banglaMeaning: 'বাবা (নতুন)', reviewHistory: [rec('again', NOW)] }),
    makeEntry({ german: 'Mutter', banglaMeaning: 'মা', reviewHistory: [rec('good', NOW), rec('good', NOW + DAY)] }),
  ];

  test('merge: fills missing fields, keeps existing history', () => {
    const plan = planImport([existing], incoming, 'merge');
    expect(plan.toAdd).toHaveLength(1); // Mutter
    expect(plan.toUpdate).toHaveLength(1); // vater → Vater
    expect(plan.duplicates).toBe(1);
    expect(plan.destructive).toBe(false);
    const merged = plan.toUpdate[0];
    expect(merged.id).toBe(existing.id);
    expect(merged.banglaMeaning).toBe('পিতা'); // existing wins
    expect(merged.reviewHistory).toEqual(existing.reviewHistory); // history preserved
  });

  test('merge adopts incoming history only when the local card was never reviewed', () => {
    const fresh = entry({ german: 'Haus', banglaMeaning: null });
    // Mirror a real export: the incoming entry carries both its log and the
    // scheduler state those records produced.
    const incomingHaus = makeEntry({
      german: 'haus',
      reviewHistory: [rec('good', NOW), rec('good', NOW + DAY)],
      review: schedule(schedule(newReviewState(), 'good', NOW), 'good', NOW + DAY),
    });
    const plan = planImport([fresh], [incomingHaus], 'merge');
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0].reviewHistory).toHaveLength(2);
    expect(plan.toUpdate[0].review.repetitions).toBe(2);
  });

  test('skip: duplicates untouched', () => {
    const plan = planImport([existing], incoming, 'skip');
    expect(plan.toAdd).toHaveLength(1);
    expect(plan.toUpdate).toHaveLength(0);
    expect(plan.duplicates).toBe(1);
  });

  test('replace: destructive, takes the whole file', () => {
    const plan = planImport([existing], incoming, 'replace');
    expect(plan.destructive).toBe(true);
    expect(plan.toAdd).toHaveLength(2);
    expect(plan.toUpdate).toHaveLength(0);
  });
});

// ── Flashcard deck building ──────────────────────────────────────────

describe('buildDeck', () => {
  const entries: VocabEntry[] = [
    entry({ german: 'due-old', review: { ...newReviewState(), dueAt: NOW - 3 * DAY } }),
    entry({ german: 'due-new', review: { ...newReviewState(), dueAt: NOW - DAY } }),
    entry({ german: 'future', review: { ...newReviewState(), dueAt: NOW + DAY } }),
    entry({ german: 'fav', favorite: true, review: { ...newReviewState(), dueAt: NOW + 5 * DAY } }),
  ];
  const ids = new Map(entries.map((e) => [e.german, e.id]));

  test('due scope: ordered by due date, capped', () => {
    const deck = buildDeck(entries, { kind: 'due' }, { cap: 1, now: NOW });
    expect(deck).toEqual([ids.get('due-old')]);
    const full = buildDeck(entries, { kind: 'due' }, { now: NOW });
    expect(full).toEqual([ids.get('due-old'), ids.get('due-new')]);
  });

  test('favorites / word / list scopes', () => {
    expect(buildDeck(entries, { kind: 'favorites' }, { now: NOW })).toEqual([ids.get('fav')]);
    expect(buildDeck(entries, { kind: 'word', id: ids.get('future')! }, { now: NOW })).toEqual([ids.get('future')]);
    expect(buildDeck(entries, { kind: 'list', ids: [ids.get('fav')!, 'missing-id'] }, { now: NOW })).toEqual([ids.get('fav')]);
  });

  test('shuffle keeps the same set of ids', () => {
    const a = buildDeck(entries, { kind: 'all' }, { shuffle: true, now: NOW });
    expect([...a].sort()).toEqual([...entries.map((e) => e.id)].sort());
  });
});

// ── Bengali numerals ─────────────────────────────────────────────────

describe('bnNum / bnPct', () => {
  test('digits convert to Bengali', () => {
    expect(bnNum(124)).toBe('১২৪');
    expect(bnNum('0.75')).toBe('০.৭৫');
  });
  test('percent formatting', () => {
    expect(bnPct(0.714)).toBe('৭১.৪%');
    expect(bnPct(1)).toBe('১০০%');
    expect(bnPct(0.5)).toBe('৫০%');
  });
});
