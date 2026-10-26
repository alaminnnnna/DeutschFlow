/**
 * Two-layer cache for translation and pronunciation results.
 *
 *   Layer 1 — in-memory LRU (bounded, instant, session only)
 *   Layer 2 — IndexedDB `cache` store (persistent, TTL + version)
 *
 * Cache keys encode every parameter that can change the result:
 *   kind | ruleset/provider version | from | to | normalized text
 * so a pronunciation-rule update or provider change automatically
 * invalidates stale entries. Only whitespace is normalized — never
 * punctuation or meaningful spelling.
 */

import { cacheGet, cachePut, cacheClear, cacheCount } from './storage/idb';

export const CACHE_SCHEMA = 'v1';
/** Translation providers can change → keep cached values for 30 days. */
const TRANSLATION_TTL = 30 * 24 * 60 * 60 * 1000;

const MEMORY_LIMIT = 200;
const memoryMap = new Map<string, unknown>();

function lruGet(key: string): unknown | undefined {
  if (!memoryMap.has(key)) return undefined;
  const value = memoryMap.get(key);
  memoryMap.delete(key);
  memoryMap.set(key, value); // bump to most-recent
  return value;
}

function lruSet(key: string, value: unknown): void {
  if (memoryMap.has(key)) memoryMap.delete(key);
  memoryMap.set(key, value);
  while (memoryMap.size > MEMORY_LIMIT) {
    const oldest = memoryMap.keys().next().value;
    if (oldest === undefined) break;
    memoryMap.delete(oldest);
  }
}

/** Normalize only what is safe: trim + collapse whitespace. */
export function normalizeForCache(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function translationKey(from: string, to: string, text: string): string {
  return `${CACHE_SCHEMA}|t|${from}|${to}|${normalizeForCache(text)}`;
}

export function glossaryKey(german: string): string {
  // Word meanings are case- and punctuation-insensitive: "Ich" and "ich"
  // gloss the same, and a trailing period must not fork the cache.
  return `${CACHE_SCHEMA}|g|de|${normalizeForCache(german)
    .toLowerCase()
    .replace(/[.,;:!?"'’\-]/g, '')
    .trim()}`;
}

export function pronunciationKey(text: string, rulesVersion: string, overrideVersion: number): string {
  return `${CACHE_SCHEMA}|p|${rulesVersion}|${overrideVersion}|${normalizeForCache(text)}`;
}

export async function getCached<T>(key: string): Promise<T | null> {
  const hit = lruGet(key);
  if (hit !== undefined) return hit as T;
  const rec = await cacheGet(key);
  if (!rec) return null;
  if (rec.expiresAt > 0 && rec.expiresAt <= Date.now()) return null;
  lruSet(key, rec.value);
  return rec.value as T;
}

export async function setCached(key: string, value: unknown, ttlMs = TRANSLATION_TTL): Promise<void> {
  lruSet(key, value);
  await cachePut({
    key,
    value,
    createdAt: Date.now(),
    expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0,
    version: CACHE_SCHEMA,
  });
}

/** Drop everything (memory + persistent). Returns the previous count. */
export async function clearAllCaches(): Promise<number> {
  const n = await cacheCount();
  memoryMap.clear();
  await cacheClear();
  return n;
}

export async function cacheSize(): Promise<number> {
  return cacheCount();
}
