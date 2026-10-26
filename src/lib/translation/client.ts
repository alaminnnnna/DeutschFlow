import type { InputLang, TranslateResponse } from '../types';
import { getCached, setCached, translationKey } from '../cache';

/**
 * Client-side translation access. The client never talks to translation
 * providers directly — everything goes through our server route so API keys
 * stay server-side and the provider chain can change freely.
 *
 * Repeated requests for the same text+language pair are served from the
 * two-layer cache (memory → IndexedDB), so replays and history clicks feel
 * instant and no duplicate network calls happen.
 */

export class TranslationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Deduplicate identical in-flight requests. */
const inFlight = new Map<string, Promise<TranslateResponse>>();

export async function translateSmart(
  text: string,
  from: InputLang,
  signal?: AbortSignal
): Promise<TranslateResponse> {
  const key = translationKey(from, 'de', text);
  const cached = await getCached<TranslateResponse>(key);
  if (cached) return cached;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const task = request(text, from);
  inFlight.set(key, task);
  try {
    const result = await task;
    await setCached(key, result);
    return result;
  } finally {
    inFlight.delete(key);
  }
}

async function request(text: string, from: InputLang, signal?: AbortSignal): Promise<TranslateResponse> {
  let res: Response;
  try {
    res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, from }),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    // Honest offline state: previously translated sentences were already
    // served from the IndexedDB cache above; anything NEW needs the network.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new TranslationError(
        'OFFLINE',
        'এখন অফলাইন — নতুন অনুবাদ আনা যাচ্ছে না। আগে অনুবাদ করা বাক্যগুলো ক্যাশ থেকে চলবে, সেভ করা শব্দ ও রিভিউও সব কাজ করবে।'
      );
    }
    throw new TranslationError('NETWORK', 'ইন্টারনেট কানেকশন পাওয়া যাচ্ছে না — আবার চেষ্টা করো।');
  }

  const data = (await res.json().catch(() => ({}))) as Partial<TranslateResponse> & {
    error?: string;
  };

  if (!res.ok) {
    if (data.error === 'TEXT_TOO_LONG') {
      throw new TranslationError('TEXT_TOO_LONG', 'টেক্সটটা খুব লম্বা — অনুগ্রহ করে ছোট বাক্যে চেষ্টা করো।');
    }
    if (data.error === 'EMPTY_INPUT') {
      throw new TranslationError('EMPTY_INPUT', 'আগে কিছু লেখো।');
    }
    throw new TranslationError(
      data.error || 'TRANSLATION_FAILED',
      'অনুবাদ করা যায়নি। একটু পরে আবার চেষ্টা করো।'
    );
  }

  if (!data.german) {
    throw new TranslationError('TRANSLATION_FAILED', 'অনুবাদ করা যায়নি। একটু পরে আবার চেষ্টা করো।');
  }

  return {
    german: data.german,
    bangla: data.bangla ?? null,
    translated: Boolean(data.translated),
  };
}
