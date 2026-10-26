/**
 * TTS compatibility & fallback tests (bun test).
 *
 * Covers the spec's core scenarios with mocked browser APIs:
 *   1. de-DE voice available            → manager reports ready, de-DE primary
 *   2. only alternative German accent   → ranked after de-DE, accent-labelled
 *   3. voice list initially empty       → polls, flips ready when populated
 *   4. no German voice at all           → ready with empty german list
 *   5. speechSynthesis unsupported      → unsupported state, never throws
 *   6. online provider                  → success / unconfigured / rate-limit /
 *                                         network / timeout / bad-response
 *   9. saved voice missing              → best German voice takes over
 *  10. stop/overlap safety              → provider stop is idempotent
 */

import { describe, expect, test, afterEach } from 'bun:test';
import {
  TtsStatusManager,
  classifyGermanVoices,
  pickGermanVoice,
  scoreGermanVoice,
} from '../src/lib/tts-status';
import {
  ERROR_MESSAGES,
  fetchGermanAudio,
  probeOnlineTts,
  stopOnlineAudio,
} from '../src/lib/tts-provider';

// ── Speech API mocks ────────────────────────────────────────────────

type MinimalVoice = {
  name: string;
  lang: string;
  localService: boolean;
};

function voice(name: string, lang: string, localService = true): unknown {
  return { name, lang, localService, default: false, voiceURI: name };
}

const originalFetch = globalThis.fetch;
const originalNavigator = globalThis.navigator;

/** bun's navigator.onLine is false in tests — the app code checks it. */
function setBrowserOnline(online: boolean): void {
  Object.defineProperty(globalThis, 'navigator', {
    value: { ...(originalNavigator ?? {}), onLine: online },
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, 'navigator', {
    value: originalNavigator,
    configurable: true,
    writable: true,
  });
});

// ── Pure classification ──────────────────────────────────────────────

describe('classifyGermanVoices', () => {
  test('ranks de-DE first, keeps other accents, drops non-German', () => {
    const all = [
      voice('Anna', 'de-DE'),
      voice('Siri German (Austria)', 'de-AT'),
      voice('English (US)', 'en-US'),
      voice('Stefan', 'de-DE', false),
      voice('French', 'fr-FR'),
    ] as unknown as SpeechSynthesisVoice[];

    const german = classifyGermanVoices(all);
    expect(german.length).toBe(3);
    expect(german[0].accent).toBe('de-DE');
    expect(german[0].accentLabel).toBe('জার্মান (জার্মানি)');
    expect(german.map((g) => g.accent)).toContain('de-AT');
    expect(german.some((g) => g.accentLabel === 'অস্ট্রিয়ান জার্মান')).toBe(true);
    // English voices must never be candidates for German text.
    expect(german.every((g) => g.voice.lang.toLowerCase().startsWith('de'))).toBe(true);
  });

  test('neural/natural names score higher (quality preference)', () => {
    const plain = scoreGermanVoice(voice('Plain', 'de-DE') as SpeechSynthesisVoice);
    const natural = scoreGermanVoice(
      voice('Google Deutsch Natural', 'de-DE', false) as SpeechSynthesisVoice
    );
    expect(natural).toBeGreaterThan(plain);
  });

  test('empty/null lists yield empty results (scenario 4 foundation)', () => {
    expect(classifyGermanVoices([])).toEqual([]);
    expect(classifyGermanVoices(null)).toEqual([]);
  });
});

describe('pickGermanVoice — saved-voice grace (scenario 9)', () => {
  const german = classifyGermanVoices([
    voice('Anna', 'de-DE'),
    voice('Salomé', 'de-AT'),
  ] as unknown as SpeechSynthesisVoice[]);

  test('honours a saved voice that still exists', () => {
    expect(pickGermanVoice(german, 'Salomé')?.voice.name).toBe('Salomé');
  });

  test('falls back to the best voice when the saved one is gone', () => {
    expect(pickGermanVoice(german, 'OldDeviceVoice')?.voice.name).toBe('Anna');
    expect(pickGermanVoice(german, null)?.voice.name).toBe('Anna');
  });

  test('returns null when there is no German voice (never a non-German)', () => {
    expect(pickGermanVoice([], 'Anna')).toBeNull();
  });
});

// ── Capability manager ───────────────────────────────────────────────

function noListenerDeps(): Partial<import('../src/lib/tts-status').TtsDeps> {
  return {
    addEventListener: (() => {}) as never,
    removeEventListener: (() => {}) as never,
  };
}

describe('TtsStatusManager', () => {
  test('scenario 5: no speechSynthesis at all → unsupported, never throws', () => {
    const m = new TtsStatusManager({
      synth: null,
      hasUtterance: false,
      ...noListenerDeps(),
    });
    m.start();
    expect(m.getSnapshot().support).toBe('unsupported');
    expect(m.getSnapshot().voicesLoaded).toBe(true);
    m.stop();
  });

  test('scenario 5b: synthesis present but Utterance missing → unsupported', () => {
    const m = new TtsStatusManager({
      synth: { getVoices: () => [] },
      hasUtterance: false,
      ...noListenerDeps(),
    });
    m.start();
    expect(m.getSnapshot().support).toBe('unsupported');
    m.stop();
  });

  test('scenario 1: German de-DE voice available immediately', () => {
    const m = new TtsStatusManager({
      synth: { getVoices: () => [voice('Anna', 'de-DE')] as never },
      hasUtterance: true,
      ...noListenerDeps(),
    });
    m.start();
    const snap = m.getSnapshot();
    expect(snap.support).toBe('ready');
    expect(snap.german.length).toBe(1);
    expect(snap.primary).toBe('de-DE');
    m.stop();
  });

  test('scenario 2: only an alternative German accent → still usable, labelled', () => {
    const m = new TtsStatusManager({
      synth: { getVoices: () => [voice('Helene', 'de-AT')] as never },
      hasUtterance: true,
      ...noListenerDeps(),
    });
    m.start();
    const snap = m.getSnapshot();
    expect(snap.support).toBe('ready');
    expect(snap.primary).toBe('de-AT');
    expect(snap.german[0].accentLabel).toBe('অস্ট্রিয়ান জার্মান');
    m.stop();
  });

  test('scenario 3: voice list empty at first, populated later', async () => {
    let list: unknown[] = [];
    const m = new TtsStatusManager({
      synth: { getVoices: () => list as never },
      hasUtterance: true,
      pollMs: 10,
      waitMs: 5_000,
      ...noListenerDeps(),
    });
    m.start();
    expect(m.getSnapshot().support).toBe('checking');

    await Bun.sleep(40);
    list = [voice('Anna', 'de-DE')]; // engine populates late
    await Bun.sleep(40); // next poll tick picks it up

    const snap = m.getSnapshot();
    expect(snap.support).toBe('ready');
    expect(snap.german.length).toBe(1);
    m.stop();
  });

  test('wait window closes the check even if no voice ever appears (scenario 4)', async () => {
    const m = new TtsStatusManager({
      synth: { getVoices: () => [] },
      hasUtterance: true,
      pollMs: 10,
      waitMs: 60,
      ...noListenerDeps(),
    });
    m.start();
    await Bun.sleep(120);
    const snap = m.getSnapshot();
    expect(snap.support).toBe('ready');
    expect(snap.voicesLoaded).toBe(true);
    expect(snap.german.length).toBe(0);
    expect(snap.primary).toBeNull();
    m.stop();
  });

  test('recheck() picks up voices installed after startup', async () => {
    let list: unknown[] = [];
    const m = new TtsStatusManager({
      synth: { getVoices: () => list as never },
      hasUtterance: true,
      pollMs: 10,
      waitMs: 30,
      ...noListenerDeps(),
    });
    m.start();
    await Bun.sleep(70);
    expect(m.getSnapshot().german.length).toBe(0);

    list = [voice('Anna', 'de-DE')];
    m.recheck();
    await Bun.sleep(50);
    expect(m.getSnapshot().german.length).toBe(1);
    m.stop();
  });

  test('listeners are notified on every publish', () => {
    const m = new TtsStatusManager({
      synth: { getVoices: () => [voice('Anna', 'de-DE')] as never },
      hasUtterance: true,
      ...noListenerDeps(),
    });
    let calls = 0;
    const off = m.subscribe(() => {
      calls += 1;
    });
    m.start();
    expect(calls).toBeGreaterThan(0);
    off();
    m.stop();
  });
});

// ── Online provider classification (scenario 6) ─────────────────────

function mockFetchOnce(status: number, body: BodyInit, contentType = 'application/json') {
  globalThis.fetch = (async () =>
    new Response(body, { status, headers: { 'Content-Type': contentType } })) as typeof fetch;
}

describe('online TTS provider', () => {
  test('probe: unconfigured → configured=false', async () => {
    setBrowserOnline(true);
    mockFetchOnce(501, JSON.stringify({ error: 'unconfigured' }));
    const r = await probeOnlineTts({ force: true });
    expect(r.configured).toBe(false);
  });

  test('probe: configured → configured=true', async () => {
    setBrowserOnline(true);
    mockFetchOnce(200, null as unknown as BodyInit);
    const r = await probeOnlineTts({ force: true });
    expect(r.configured).toBe(true);
  });

  test('fetch: unconfigured provider is classified', async () => {
    setBrowserOnline(true);
    mockFetchOnce(501, JSON.stringify({ error: 'unconfigured' }));
    const r = await fetchGermanAudio('eins');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe('unconfigured');
    expect(!r.ok && r.message).toBe(ERROR_MESSAGES.unconfigured);
  });

  test('fetch: rate limit is classified', async () => {
    setBrowserOnline(true);
    mockFetchOnce(503, JSON.stringify({ error: 'RATE_LIMITED' }));
    const r = await fetchGermanAudio('zwei');
    expect(!r.ok && r.code).toBe('rate-limit');
  });

  test('fetch: provider error is classified', async () => {
    setBrowserOnline(true);
    mockFetchOnce(502, JSON.stringify({ error: 'PROVIDER_ERROR' }));
    const r = await fetchGermanAudio('drei');
    expect(!r.ok && r.code).toBe('provider');
  });

  test('fetch: non-audio response is rejected (bad-response)', async () => {
    setBrowserOnline(true);
    mockFetchOnce(200, JSON.stringify({ audio: 'nope' }));
    const r = await fetchGermanAudio('vier');
    expect(!r.ok && r.code).toBe('bad-response');
  });

  test('fetch: success with audio blob', async () => {
    setBrowserOnline(true);
    mockFetchOnce(200, new Blob([new Uint8Array([1, 2, 3])]), 'audio/mpeg');
    const r = await fetchGermanAudio('fünf');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.blob.size).toBe(3);
  });

  test('fetch: network failure → network classification', async () => {
    setBrowserOnline(true);
    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    const r = await fetchGermanAudio('sechs');
    expect(!r.ok && r.code).toBe('network');
  });

  test('fetch: abort while pending → timeout classification', async () => {
    setBrowserOnline(true);
    globalThis.fetch = ((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const e = new Error('The operation was aborted');
          e.name = 'AbortError';
          reject(e);
        });
      }) as Promise<Response>;
    }) as typeof fetch;
    const r = await fetchGermanAudio('sieben', { timeoutMs: 30 });
    expect(!r.ok && r.code).toBe('timeout');
    expect(!r.ok && r.message).toBe(ERROR_MESSAGES.timeout);
  });

  test('fetch: offline browser → honest network message, no request', async () => {
    setBrowserOnline(false);
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      throw new Error('must not be called');
    }) as typeof fetch;
    const r = await fetchGermanAudio('acht');
    expect(!r.ok && r.code).toBe('network');
    expect(called).toBe(false);
  });

  test('empty text → bad-response, no request', async () => {
    setBrowserOnline(true);
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      throw new Error('must not be called');
    }) as typeof fetch;
    const r = await fetchGermanAudio('   ');
    expect(!r.ok && r.code).toBe('bad-response');
    expect(called).toBe(false);
  });

  test('stopOnlineAudio is idempotent (scenario 10 foundation)', () => {
    expect(() => {
      stopOnlineAudio();
      stopOnlineAudio();
    }).not.toThrow();
  });
});
