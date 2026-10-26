/**
 * Glossary client — progressive word meanings for the pronunciation chips.
 *
 * This is an *optional enrichment*: it is requested after the German audio
 * has already started and never blocks the primary flow. Results are cached
 * (memory + IndexedDB) under the same two-layer cache as translations.
 */

import { getCached, glossaryKey, setCached } from './cache';

export interface WordGloss {
  word: string;
  bangla: string;
}

export async function fetchGlossary(
  german: string,
  signal?: AbortSignal
): Promise<Record<string, string>> {
  const key = glossaryKey(german);
  const cached = await getCached<Record<string, string>>(key);
  if (cached) return cached;

  try {
    const res = await fetch('/api/glossary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ german }),
      signal,
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { glosses?: WordGloss[] };
    const map: Record<string, string> = {};
    for (const g of data.glosses ?? []) {
      if (g?.word && g?.bangla) map[g.word.toLowerCase().replace(/[.,;:!?]/g, '')] = g.bangla;
    }
    if (Object.keys(map).length > 0) {
      // Shorter TTL — meanings are contextual and model output can improve.
      await setCached(key, map, 7 * 24 * 60 * 60 * 1000);
    }
    return map;
  } catch {
    return {};
  }
}

export function glossFor(glosses: Record<string, string>, word: string): string | null {
  return glosses[word.toLowerCase().replace(/[.,;:!?]/g, '')] ?? null;
}
