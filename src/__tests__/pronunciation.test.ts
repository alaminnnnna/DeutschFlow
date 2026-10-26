/**
 * Pronunciation engine tests — canonical examples from the product spec
 * plus rule-engine behavior. Run: bun test
 */

import { describe, expect, test } from 'bun:test';

import { transliterate } from '../lib/pronunciation/engine';
import { normalizeForCache, translationKey, pronunciationKey, glossaryKey } from '../lib/cache';
import { normalizeOverrideKey } from '../lib/overrides';

// ── Canonical spec examples (user's own examples — must match exactly) ──

describe('canonical pronunciation examples', () => {
  const cases: Array<[string, string]> = [
    ['Hallo', 'হালো'],
    ['Danke', 'ডাঙ্কে'],
    ['Guten Morgen', 'গুটেন মর্গেন'],
    ['Wie geht es dir?', 'ভি গেট এস ডিয়ার?'],
    ['Ich heiße Amin', 'ইখ হাইসে আমিন'],
    ['Ich lerne Deutsch.', 'ইখ লার্নে ডয়চ.'],
  ];

  for (const [input, expected] of cases) {
    test(`${input} → ${expected}`, () => {
      expect(transliterate(input).bengali).toBe(expected);
    });
  }
});

// ── Rule-engine showcase ─────────────────────────────────────────────

describe('rule engine phonology', () => {
  const cases: Array<[string, string | null]> = [
    ['Guten Tag', 'গুটেন টাক'],
    ['Gute Nacht', 'গুটে নাখট'],
    ['Tschüss', 'চ্যুস'],
    ['Ich verstehe nicht', 'ইখ ফারশটে নিখট'],
    ['und', 'উন্ট'],
    ['nicht', 'নিখট'],
    ['ist', 'ইসট'],
    ['neu', 'নয়'],
    ['Deutschland', 'দয়চলান্ট'],
    ['Straße', 'শট্রাসে'],
    // final devoicing
    ['Tag', 'টাক'],
    ['Kind', 'কিন্ট'],
    // s-voicing
    ['Sonne', 'জোনে'],
    ['Haus', 'হাউস'],
    // w/v
    ['Wasser', 'ভাসার'],
    ['Vater', 'ফাটার'],
    // z
    ['Zeit', 'ৎসাইট'],
    ['zwei', 'ৎসভাই'],
    // diphthongs
    ['ein', 'আইন'],
    ['mein', 'মাইন'],
    ['Häuser', 'হয়জার'],
    // word chips exist for every word
    ['Guten Morgen! Wie geht es dir?', null],
  ];

  for (const [input, expected] of cases) {
    test(`${input} transcribes`, () => {
      const result = transliterate(input);
      expect(result.bengali.length).toBeGreaterThan(0);
      if (expected) expect(result.bengali).toBe(expected);
    });
  }
});

// ── Structural guarantees ────────────────────────────────────────────

describe('pronunciation structure', () => {
  test('punctuation is preserved', () => {
    expect(transliterate('Wie geht es dir?').bengali.endsWith('?')).toBe(true);
    expect(transliterate('Ich lerne Deutsch.').bengali.endsWith('.')).toBe(true);
  });

  test('word breakdown covers every word with a source', () => {
    const r = transliterate('Guten Morgen! Wie geht es dir?');
    const words = r.words.map((w) => w.german);
    for (const expected of ['Guten', 'Morgen', 'Wie', 'geht', 'es', 'dir']) {
      expect(words).toContain(expected);
    }
    for (const w of r.words) {
      expect(['lexicon', 'rules', 'override']).toContain(w.source);
    }
  });

  test('lexicon-sourced words give high confidence', () => {
    const r = transliterate('Guten Morgen');
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test('empty and whitespace input is handled', () => {
    expect(transliterate('').bengali).toBe('');
    expect(transliterate('   ').words).toHaveLength(0);
  });

  test('long compound nouns do not crash and produce output', () => {
    const r = transliterate('Donaudampfschifffahrtsgesellschaft');
    expect(r.bengali.length).toBeGreaterThan(4);
    expect(r.hasUncertain).toBe(false);
  });
});

// ── Cache keys ───────────────────────────────────────────────────────

describe('cache keys', () => {
  test('whitespace is normalized, meaning-bearing chars are not', () => {
    const a = translationKey('en', 'de', '  good   morning ');
    const b = translationKey('en', 'de', 'good morning');
    expect(a).toBe(b);
    expect(translationKey('en', 'de', 'good morning!')).not.toBe(b);
    expect(translationKey('de', 'de', 'good morning')).not.toBe(b);
  });

  test('pronunciation key changes with ruleset and override versions', () => {
    const base = pronunciationKey('test', '2', 0);
    expect(pronunciationKey('test', '3', 0)).not.toBe(base);
    expect(pronunciationKey('test', '2', 1)).not.toBe(base);
  });

  test('glossary key is deterministic', () => {
    expect(glossaryKey('Ich lerne Deutsch.')).toBe(glossaryKey('ich lerne deutsch'));
  });

  test('normalizeForCache collapses only whitespace', () => {
    expect(normalizeForCache('a  b\tc')).toBe('a b c');
  });
});

// ── Overrides helper ─────────────────────────────────────────────────

describe('override keys', () => {
  test('normalized for duplicate detection', () => {
    expect(normalizeOverrideKey('Ihr!')).toBe(normalizeOverrideKey('ihr'));
    expect(normalizeOverrideKey('die Entscheidung')).toBe('die entscheidung');
  });
});
