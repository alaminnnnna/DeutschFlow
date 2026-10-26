/**
 * Personal pronunciation overrides.
 *
 * When the engine's Bengali approximation for a word is wrong, the user can
 * correct it. Corrections are saved locally and used as *personal* overrides
 * — they are treated as the user's preferred spelling for their own device,
 * not as universal linguistic truth.
 *
 * Overrides are checked before the lexicon and before the rule engine.
 */

import type { PronunciationWord } from '../types';

const STORAGE_KEY = 'deutschflow.pron.overrides.v1';

export interface PronunciationOverride {
  german: string;
  bengali: string;
  updatedAt: number;
}

/** Bumped whenever an override changes → pronunciation cache keys change. */
let overrideVersion = 0;
const listeners = new Set<() => void>();

export function getOverrideVersion(): number {
  return overrideVersion;
}

export function onOverridesChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function load(): Record<string, PronunciationOverride> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, PronunciationOverride> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const o = v as PronunciationOverride;
      if (o && typeof o.german === 'string' && typeof o.bengali === 'string' && o.bengali.trim()) {
        out[k] = { german: o.german, bengali: o.bengali.trim(), updatedAt: o.updatedAt || 0 };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function persist(map: Record<string, PronunciationOverride>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* storage full — overrides are a nice-to-have */
  }
}

export function normalizeOverrideKey(word: string): string {
  return word.toLowerCase().replace(/[.,;:!?"'’\-]/g, '').trim();
}

export function getOverride(word: string): PronunciationOverride | null {
  const map = load();
  return map[normalizeOverrideKey(word)] ?? null;
}

export function setOverride(word: string, bengali: string): void {
  const key = normalizeOverrideKey(word);
  if (!key || !bengali.trim()) return;
  const map = load();
  map[key] = { german: word.trim(), bengali: bengali.trim(), updatedAt: Date.now() };
  persist(map);
  overrideVersion += 1;
  listeners.forEach((cb) => cb());
}

export function removeOverride(word: string): void {
  const key = normalizeOverrideKey(word);
  const map = load();
  if (!(key in map)) return;
  delete map[key];
  persist(map);
  overrideVersion += 1;
  listeners.forEach((cb) => cb());
}

export function listOverrides(): PronunciationOverride[] {
  return Object.values(load()).sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Apply overrides to a word-by-word breakdown. Returns a new array — the
 * engine result itself stays untouched.
 */
export function applyOverrides(words: PronunciationWord[]): {
  words: PronunciationWord[];
  applied: number;
} {
  const map = load();
  if (Object.keys(map).length === 0) return { words, applied: 0 };
  let applied = 0;
  const next = words.map((w) => {
    const key = normalizeOverrideKey(w.german);
    if (map[key]) {
      applied += 1;
      return { ...w, bengali: map[key].bengali, source: 'override' as const };
    }
    return w;
  });
  return { words: next, applied };
}
