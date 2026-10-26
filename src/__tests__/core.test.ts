/**
 * Language detection, SM-2 scheduling and vocabulary core tests.
 */

import { describe, expect, test } from 'bun:test';

import { detectLanguage } from '../lib/language';
import { schedule, newReviewState, isDue, MIN_EASE, MAX_EASE, type ReviewState } from '../lib/review';
import {
  normalizeGermanKey,
  findDuplicate,
  mergeEntry,
  makeEntry,
  searchEntries,
  parseImport,
  exportPayload,
  DEFAULT_FILTERS,
} from '../lib/vocabulary';
import { computeStreak, dayKey, lastNDays, emptyStats } from '../lib/stats';

// ── Language detection (spec section 5) ──────────────────────────────

describe('language detection', () => {
  test('ihr → German (direct playback, no translation)', () => {
    expect(detectLanguage('ihr')).toBe('de');
  });
  test('Guten Morgen → German', () => {
    expect(detectLanguage('Guten Morgen')).toBe('de');
  });
  test('Good morning → English (translate)', () => {
    expect(detectLanguage('Good morning')).toBe('en');
  });
  test('আমি ভালো আছি → Bengali (translate)', () => {
    expect(detectLanguage('আমি ভালো আছি')).toBe('bn');
  });
  test('আমি জার্মান শিখছি → Bengali', () => {
    expect(detectLanguage('আমি জার্মান শিখছি')).toBe('bn');
  });
  test('umlauts and ß are strong German signals', () => {
    expect(detectLanguage('grüße')).toBe('de');
    expect(detectLanguage('Straße')).toBe('de');
  });
  test('empty and whitespace → en (no crash)', () => {
    expect(detectLanguage('')).toBe('en');
    expect(detectLanguage('   ')).toBe('en');
  });
  test('punctuation-only input does not crash', () => {
    expect(['de', 'en', 'bn']).toContain(detectLanguage('!?...'));
  });
  test('mixed Bengali-dominant text → bn', () => {
    expect(detectLanguage('আমি en test করছি')).toBe('bn');
  });
});

// ── SM-2 scheduling ──────────────────────────────────────────────────

describe('SM-2 scheduling', () => {
  const NOW = 1_700_000_000_000;
  const DAY = 86_400_000;

  test('new card: good → 1 day', () => {
    const next = schedule(newReviewState(), 'good', NOW);
    expect(next.repetitions).toBe(1);
    expect(next.interval).toBe(1);
    expect(next.dueAt).toBe(NOW + DAY);
  });

  test('second success: good → 3 days', () => {
    const first = schedule(newReviewState(), 'good', NOW);
    const second = schedule(first, 'good', NOW);
    expect(second.interval).toBe(3);
  });

  test('third success: good → interval × ease', () => {
    const s = schedule(schedule(schedule(newReviewState(), 'good', NOW), 'good', NOW), 'good', NOW);
    expect(s.interval).toBe(Math.round(3 * s.ease));
  });

  test('again resets repetitions and schedules 10 minutes', () => {
    const grown = schedule(schedule(newReviewState(), 'good', NOW), 'good', NOW);
    const failed = schedule(grown, 'again', NOW);
    expect(failed.repetitions).toBe(0);
    expect(failed.dueAt - NOW).toBe(10 * 60 * 1000);
    expect(failed.lapses).toBe(1);
  });

  test('hard never shortens below 1 day and drops ease', () => {
    const grown = schedule(schedule(newReviewState(), 'good', NOW), 'good', NOW);
    const hard = schedule(grown, 'hard', NOW);
    expect(hard.interval).toBeGreaterThanOrEqual(1);
    expect(hard.ease).toBeLessThan(grown.ease);
  });

  test('easy jumps to 3 days on first success and raises ease', () => {
    const easy = schedule(newReviewState(), 'easy', NOW);
    expect(easy.interval).toBe(3);
    expect(easy.ease).toBeGreaterThan(2.5);
  });

  test('ease is clamped', () => {
    let s: ReviewState = newReviewState();
    for (let i = 0; i < 20; i += 1) s = schedule(s, 'easy', NOW);
    expect(s.ease).toBeLessThanOrEqual(MAX_EASE);
    let t: ReviewState = newReviewState();
    for (let i = 0; i < 20; i += 1) t = schedule(t, 'again', NOW);
    expect(t.ease).toBeGreaterThanOrEqual(MIN_EASE);
  });

  test('missed days do not punish: due stays due', () => {
    const s = schedule(newReviewState(), 'good', NOW);
    expect(isDue(s, NOW + 10 * DAY)).toBe(true);
  });
});

// ── Vocabulary core ──────────────────────────────────────────────────

describe('vocabulary duplicate handling', () => {
  test('normalizeGermanKey folds umlauts and punctuation', () => {
    expect(normalizeGermanKey('die Entscheidung!')).toBe('die entscheidung');
    expect(normalizeGermanKey('grüße')).toBe(normalizeGermanKey('Grusse'));
    expect(normalizeGermanKey('grüße')).toBe('grusse');
  });

  test('findDuplicate detects the same word', () => {
    const entries = [makeEntry({ german: 'die Entscheidung', banglaMeaning: 'সিদ্ধান্ত' })];
    expect(findDuplicate(entries, 'DIE Entscheidung!')).not.toBeNull();
    expect(findDuplicate(entries, 'das Haus')).toBeNull();
  });

  test('mergeEntry fills empty fields and appends new examples, keeps notes', () => {
    const existing = makeEntry({
      german: 'Haus',
      notes: 'my note',
      examples: [{ german: 'Das Haus ist groß.', bangla: null }],
    });
    const merged = mergeEntry(existing, {
      banglaMeaning: 'বাড়ি',
      sourceSentence: 'Ich komme aus dem Haus.',
    });
    expect(merged.banglaMeaning).toBe('বাড়ি');
    expect(merged.notes).toBe('my note');
    expect(merged.examples).toHaveLength(2);
    // same example again → no duplicate example
    const again = mergeEntry(merged, { sourceSentence: 'Ich komme aus dem Haus.' });
    expect(again.examples).toHaveLength(2);
  });

  test('searchEntries matches German case-insensitively and filters', () => {
    const entries = [
      makeEntry({ german: 'die Entscheidung', banglaMeaning: 'সিদ্ধান্ত', cefrLevel: 'B1', partOfSpeech: 'noun' }),
      makeEntry({ german: 'lernen', banglaMeaning: 'শেখা', partOfSpeech: 'verb' }),
    ];
    expect(searchEntries(entries, { ...DEFAULT_FILTERS, query: 'entscheidung' })).toHaveLength(1);
    expect(searchEntries(entries, { ...DEFAULT_FILTERS, query: 'সিদ্ধান্ত' })).toHaveLength(1);
    expect(searchEntries(entries, { ...DEFAULT_FILTERS, pos: 'verb' })).toHaveLength(1);
    expect(searchEntries(entries, { ...DEFAULT_FILTERS, level: 'A1' })).toHaveLength(0);
  });

  test('export/import round-trip', () => {
    const entries = [makeEntry({ german: 'Haus', banglaMeaning: 'বাড়ি' })];
    const json = JSON.stringify(exportPayload(entries));
    const parsed = parseImport(json);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].german).toBe('Haus');
    expect(parsed.skipped).toBe(0);
  });

  test('import skips invalid rows', () => {
    const parsed = parseImport(JSON.stringify([{ german: 'ok' }, { foo: 1 }, null]));
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.skipped).toBe(2);
  });

  test('import of garbage returns empty', () => {
    expect(parseImport('not json').entries).toHaveLength(0);
  });
});

// ── Stats (honest counters) ──────────────────────────────────────────

describe('stats', () => {
  test('dayKey uses the local calendar day', () => {
    expect(dayKey(new Date('2026-10-27T10:00:00'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('streak counts consecutive active days, survives yesterday', () => {
    const now = new Date('2026-10-27T12:00:00');
    const stats = emptyStats();
    const today = dayKey(now);
    const yesterday = dayKey(new Date(now.getTime() - 86_400_000));
    stats.byDay[today] = { listens: 1, reviews: 0 };
    expect(computeStreak(stats, now)).toBe(1);
    stats.byDay[yesterday] = { listens: 2, reviews: 1 };
    expect(computeStreak(stats, now)).toBe(2);
  });

  test('lastNDays returns n ascending buckets', () => {
    const bars = lastNDays(emptyStats(), 7, new Date('2026-10-27T12:00:00'));
    expect(bars).toHaveLength(7);
    expect(bars[bars.length - 1].stat.listens).toBe(0);
  });
});
