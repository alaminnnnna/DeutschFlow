/**
 * Online German TTS provider client.
 *
 * The ONLY tier of the audio pipeline that can serve real downloadable audio
 * files (browser `speechSynthesis` streams through the OS engine and never
 * produces a storable MP3 — the UI must never claim otherwise).
 *
 * Configuration path (server-side only, no secret ever reaches this file):
 *   TTS_PROVIDER=voicerss|google   TTS_API_KEY=...   → see /api/tts route
 *   unset  →  the route answers 501 {error:'unconfigured'} and the UI shows
 *             native-voice + manual fallbacks without breaking anything.
 *
 * Error taxonomy is explicit so the UI can be honest about WHAT failed:
 * network down, timeout, provider not configured, provider rejected the
 * request, rate limited, or an unusable response format.
 *
 * Successful audio blobs are cached in IndexedDB (existing cache store) so
 * replay — including offline replay of previously fetched lines — works and
 * costs nothing extra.
 */

import { normalizeForCache } from './cache';

export type OnlineTtsErrorCode =
  | 'unconfigured'
  | 'network'
  | 'timeout'
  | 'rate-limit'
  | 'provider'
  | 'bad-response';

export interface OnlineTtsSuccess {
  ok: true;
  blob: Blob;
  /** True when served from the local IndexedDB audio cache. */
  fromCache: boolean;
}

export interface OnlineTtsFailure {
  ok: false;
  code: OnlineTtsErrorCode;
  /** Bengali, user-facing, honest message. */
  message: string;
}

export type OnlineTtsResult = OnlineTtsSuccess | OnlineTtsFailure;

const CACHE_PREFIX = 'tts-audio:';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const ERROR_MESSAGES: Record<OnlineTtsErrorCode, string> = {
  unconfigured: 'কোনো অনলাইন জার্মান অডিও প্রোভাইডার কনফিগার করা হয়নি — সেটিংসে বিস্তারিত আছে।',
  network: 'ইন্টারনেট নেই — অনলাইন জার্মান অডিওর জন্য নেটওয়ার্ক লাগবে। উচ্চারণ গাইড দেখো।',
  timeout: 'অনলাইন অডিও সার্ভার সময়মতো সাড়া দেয়নি — আবার চেষ্টা করো।',
  'rate-limit': 'অনলাইন প্রোভাইডারের সীমা শেষ — কিছুক্ষণ পরে আবার চেষ্টা করো।',
  provider: 'অনলাইন অডিও প্রোভাইডার সমস্যা করছে — পরে আবার চেষ্টা করো।',
  'bad-response': 'অনলাইন প্রোভাইডার থেকে ব্যবহারযোগ্য অডিও আসেনি।',
};

// ── Provider availability probe ──────────────────────────────────────

let probeCache: { configured: boolean; at: number } | null = null;
const PROBE_TTL_MS = 5 * 60 * 1000;

/** Is an online provider configured (and reachable) on the server? */
export async function probeOnlineTts(
  opts: { signal?: AbortSignal; force?: boolean } = {}
): Promise<{ configured: boolean; online: boolean }> {
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;
  if (!online) return { configured: true, online: false };
  if (
    !opts.force &&
    probeCache &&
    Date.now() - probeCache.at < PROBE_TTL_MS
  ) {
    return { configured: probeCache.configured, online: true };
  }
  try {
    const res = await fetch('/api/tts?probe=1', { signal: opts.signal });
    const configured = res.ok;
    probeCache = { configured, at: Date.now() };
    return { configured, online: true };
  } catch {
    // A probe failure is never proof of "unconfigured" — network may be down.
    return { configured: probeCache?.configured ?? false, online: false };
  }
}

// ── Audio fetch + cache ──────────────────────────────────────────────

function audioKey(text: string, voice: string | null): string {
  return `${CACHE_PREFIX}${voice ?? 'auto'}:${normalizeForCache(text)}`;
}

async function getCachedAudio(key: string): Promise<Blob | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const { getCached } = await import('./cache');
    const blob = await getCached<Blob>(key);
    return blob instanceof Blob ? blob : null;
  } catch {
    return null;
  }
}

async function putCachedAudio(key: string, blob: Blob): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const { setCached } = await import('./cache');
    await setCached(key, blob, CACHE_TTL_MS);
  } catch {
    /* audio caching is best-effort — playback must never depend on it */
  }
}

/**
 * Fetch German audio for `text` from the configured provider, with timeout,
 * cancellation and IndexedDB caching. Never throws — failures come back
 * classified so the UI can explain exactly what went wrong.
 */
export async function fetchGermanAudio(
  text: string,
  opts: { voice?: string | null; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<OnlineTtsResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, code: 'bad-response', message: ERROR_MESSAGES['bad-response'] };
  }
  const key = audioKey(trimmed, opts.voice ?? null);

  const cached = await getCachedAudio(key);
  if (cached) return { ok: true, blob: cached, fromCache: true };

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, code: 'network', message: ERROR_MESSAGES.network };
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? 12_000
  );
  const onOuterAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onOuterAbort);

  try {
    const params = new URLSearchParams({ text: trimmed });
    if (opts.voice) params.set('voice', opts.voice);
    const res = await fetch(`/api/tts?${params.toString()}`, {
      signal: controller.signal,
    });

    if (res.status === 501) {
      probeCache = { configured: false, at: Date.now() };
      return { ok: false, code: 'unconfigured', message: ERROR_MESSAGES.unconfigured };
    }
    if (res.status === 429 || res.status === 503) {
      return { ok: false, code: 'rate-limit', message: ERROR_MESSAGES['rate-limit'] };
    }
    if (!res.ok) {
      return { ok: false, code: 'provider', message: ERROR_MESSAGES.provider };
    }

    const type = res.headers.get('content-type') ?? '';
    if (!type.startsWith('audio/')) {
      return { ok: false, code: 'bad-response', message: ERROR_MESSAGES['bad-response'] };
    }

    const blob = await res.blob();
    if (blob.size === 0) {
      return { ok: false, code: 'bad-response', message: ERROR_MESSAGES['bad-response'] };
    }
    void putCachedAudio(key, blob);
    return { ok: true, blob, fromCache: false };
  } catch (err) {
    if (controller.signal.aborted && !opts.signal?.aborted) {
      return { ok: false, code: 'timeout', message: ERROR_MESSAGES.timeout };
    }
    return { ok: false, code: 'network', message: ERROR_MESSAGES.network };
  } finally {
    clearTimeout(timeout);
    opts.signal?.removeEventListener('abort', onOuterAbort);
  }
}

// ── Online audio playback (single element, no overlap) ───────────────

let player: HTMLAudioElement | null = null;
let playerUrl: string | null = null;

export function isOnlineAudioActive(): boolean {
  return player !== null;
}

export interface OnlinePlaybackHooks {
  onEnd?: () => void;
  onError?: (message: string) => void;
}

/** Play a fetched audio blob; cancels anything already playing first. */
export function playOnlineAudio(blob: Blob, hooks: OnlinePlaybackHooks = {}): boolean {
  stopOnlineAudio();
  if (typeof Audio === 'undefined') {
    hooks.onError?.('এই ব্রাউজারে অডিও প্লেব্যাক সমর্থিত নয়।');
    return false;
  }
  const url = URL.createObjectURL(blob);
  const el = new Audio(url);
  player = el;
  playerUrl = url;

  const cleanup = () => {
    if (playerUrl) {
      URL.revokeObjectURL(playerUrl);
      playerUrl = null;
    }
    player = null;
  };

  el.onended = () => {
    cleanup();
    hooks.onEnd?.();
  };
  el.onerror = () => {
    cleanup();
    hooks.onError?.('অনলাইন অডিও প্লে করা যায়নি।');
  };
  el.play().catch(() => {
    cleanup();
    hooks.onError?.('ব্রাউজার অডিও ব্লক করেছে — একবার পেজে ক্লিক করে আবার চেষ্টা করো।');
  });
  return true;
}

/** Hard stop of online playback (companion to the native engine's stop). */
export function stopOnlineAudio(): void {
  if (!player) return;
  const el = player;
  player = null;
  el.onended = null;
  el.onerror = null;
  try {
    el.pause();
  } catch {
    /* ignore */
  }
  if (playerUrl) {
    URL.revokeObjectURL(playerUrl);
    playerUrl = null;
  }
}
