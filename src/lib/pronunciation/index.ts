/**
 * Pronunciation provider abstraction.
 *
 * The UI only talks to `pronunciation`, so the transliteration engine can be
 * upgraded later (e.g. an AI/API transcription provider) without touching any
 * component. The default provider is the local rule engine — instant, offline
 * and replay-friendly — with personal user overrides layered on top.
 *
 * Results are memoized with a key that includes the ruleset version AND the
 * override version, so either change invalidates stale results automatically.
 */

import type { PronunciationResult } from '../types';
import { transliterate as engineTransliterate } from './engine';
import { applyOverrides, getOverrideVersion, onOverridesChange } from '../overrides';
import { pronunciationKey, setCached } from '../cache';

export const RULES_VERSION = '2';

export interface PronunciationProvider {
  name: string;
  version: string;
  transliterate(text: string): PronunciationResult;
}

const memo = new Map<string, PronunciationResult>();

if (typeof window !== 'undefined') {
  // Overrides changed → drop memoized results (cache keys change anyway).
  onOverridesChange(() => memo.clear());
}

function rebuildSentence(raw: string, oldBengali: string, newBengali: string): string {
  // Only replace when the rendering is unambiguous within this sentence.
  const parts = raw.split(oldBengali);
  return parts.length === 2 ? parts.join(newBengali) : raw;
}

const provider: PronunciationProvider = {
  name: 'local-rules',
  version: RULES_VERSION,
  transliterate(text: string): PronunciationResult {
    const key = pronunciationKey(text, RULES_VERSION, getOverrideVersion());
    const hit = memo.get(key);
    if (hit) return hit;

    const raw = engineTransliterate(text);
    const { words, applied } = applyOverrides(raw.words);

    let bengali = raw.bengali;
    let confidence = raw.confidence;
    if (applied > 0) {
      for (const w of words) {
        if (w.source === 'override') {
          const plain = engineTransliterate(w.german).bengali;
          if (plain && plain !== w.bengali) {
            bengali = rebuildSentence(bengali, plain, w.bengali);
          }
        }
      }
      confidence = Math.min(1, confidence + 0.15 * applied);
    }

    const result: PronunciationResult = { ...raw, bengali, words, confidence };
    memo.set(key, result);
    // Also persist across reloads (IndexedDB cache layer); fire and forget.
    void setCached(key, result);
    return result;
  },
};

export const pronunciation: PronunciationProvider = provider;

export { transliterate } from './engine';
