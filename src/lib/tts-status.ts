/**
 * Centralized TTS capability & status manager.
 *
 * ONE place answers every question about whether German audio can play on
 * this device — no component may scatter its own browser checks:
 *
 *   - Is `speechSynthesis` (and `SpeechSynthesisUtterance`) available at all?
 *   - Has the browser populated its (often asynchronous) voice list yet?
 *   - Which GERMAN voices exist, ranked de-DE first, then de-AT / de-CH?
 *   - When should capabilities be re-checked (voiceschanged, visibility,
 *     connectivity, explicit "check compatibility" action)?
 *
 * The manager never assumes the API exists just because JS runs, and never
 * pretends a voice exists before `getVoices()` actually returned one. It is
 * framework-agnostic: React binds through `useSyncExternalStore`, imperative
 * code reads `getSnapshot()`.
 *
 * Everything browser-facing is injected via `TtsDeps` so the whole state
 * machine is unit-testable with mocked speech APIs (see tests/tts.test.ts).
 */

export type TtsSupport = 'unsupported' | 'checking' | 'ready';

/** German accent buckets, most standard first. */
export type GermanAccent = 'de-DE' | 'de-AT' | 'de-CH' | 'de';

export interface GermanVoiceInfo {
  voice: SpeechSynthesisVoice;
  accent: GermanAccent;
  /** Human-readable (Bengali) accent description for honest UI labels. */
  accentLabel: string;
  /** Synthetic voices (network) vs. installed OS voices. */
  online: boolean;
  score: number;
}

export interface TtsStatusSnapshot {
  support: TtsSupport;
  /** True once the voice list is known (non-empty OR the wait window passed). */
  voicesLoaded: boolean;
  german: GermanVoiceInfo[];
  primary: GermanAccent | null;
  /** Last time a check cycle completed (used by the compatibility panel). */
  checkedAt: number;
}

export interface TtsDeps {
  synth: Pick<SpeechSynthesis, 'getVoices'> & Partial<SpeechSynthesis> | null;
  hasUtterance: boolean;
  addEventListener: typeof window.addEventListener;
  removeEventListener: typeof window.removeEventListener;
  /** Poll interval while waiting for an async voice list (ms). */
  pollMs: number;
  /** Total wait for the voice list before declaring it final (ms). */
  waitMs: number;
}

const DEFAULT_WAIT_MS = 6000;
const DEFAULT_POLL_MS = 300;

const ACCENT_LABELS: Record<GermanAccent, string> = {
  'de-DE': 'জার্মান (জার্মানি)',
  'de-AT': 'অস্ট্রিয়ান জার্মান',
  'de-CH': 'সুইস জার্মান',
  de: 'জার্মান (অঞ্চল অজানা)',
};

function accentOf(voice: SpeechSynthesisVoice): GermanAccent {
  const lang = (voice.lang || '').toLowerCase().replace('_', '-');
  if (lang === 'de-de' || lang.startsWith('de-de')) return 'de-DE';
  if (lang === 'de-at' || lang.startsWith('de-at')) return 'de-AT';
  if (lang === 'de-ch' || lang.startsWith('de-ch')) return 'de-CH';
  return 'de';
}

/**
 * Quality score for a GERMAN voice. Non-German voices are never candidates —
 * the app must not read German text with an English voice as if it were
 * correct German pronunciation.
 */
export function scoreGermanVoice(voice: SpeechSynthesisVoice): number {
  const lang = (voice.lang || '').toLowerCase().replace('_', '-');
  if (!lang.startsWith('de')) return -1;
  let score = 0;
  if (accentOf(voice) === 'de-DE') score += 10;
  else if (accentOf(voice) === 'de-AT') score += 7;
  else if (accentOf(voice) === 'de-CH') score += 7;
  else score += 5;
  const name = voice.name || '';
  if (/natural|neural|online/i.test(name)) score += 4;
  if (/google/i.test(name)) score += 3;
  if (/premium|enhanced|quality/i.test(name)) score += 2;
  if (voice.localService) score += 1;
  return score;
}

/** Classify + rank every German voice in a full voice list (pure, testable). */
export function classifyGermanVoices(
  all: readonly SpeechSynthesisVoice[] | null | undefined
): GermanVoiceInfo[] {
  if (!all) return [];
  return all
    .map((voice) => {
      const score = scoreGermanVoice(voice);
      return score < 0
        ? null
        : {
            voice,
            score,
            accent: accentOf(voice),
            accentLabel: ACCENT_LABELS[accentOf(voice)],
            online: !voice.localService,
          };
    })
    .filter((v): v is GermanVoiceInfo => v !== null)
    .sort((a, b) => b.score - a.score || a.voice.name.localeCompare(b.voice.name));
}

/**
 * Resolve the voice to actually speak with. An explicitly saved preference is
 * honoured only while that voice still exists on THIS device — after switching
 * devices or removing a voice pack the best available German voice takes over
 * (the caller surfaces a notice), so a stale preference can never disable audio.
 */
export function pickGermanVoice(
  german: readonly GermanVoiceInfo[],
  preferredName?: string | null
): GermanVoiceInfo | null {
  if (german.length === 0) return null;
  if (preferredName) {
    const found = german.find((v) => v.voice.name === preferredName);
    if (found) return found;
  }
  return german[0];
}

const EMPTY: TtsStatusSnapshot = {
  support: 'unsupported',
  voicesLoaded: false,
  german: [],
  primary: null,
  checkedAt: 0,
};

export class TtsStatusManager {
  private deps: TtsDeps;
  private snap: TtsStatusSnapshot = EMPTY;
  private listeners = new Set<() => void>();
  private started = false;
  private stopped = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private waitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps?: Partial<TtsDeps>) {
    const browser =
      typeof window !== 'undefined'
        ? {
            synth: (window as unknown as { speechSynthesis?: TtsDeps['synth'] })
              .speechSynthesis ?? null,
            hasUtterance: typeof (globalThis as Record<string, unknown>)
              .SpeechSynthesisUtterance !== 'undefined',
            addEventListener: window.addEventListener.bind(window),
            removeEventListener: window.removeEventListener.bind(window),
          }
        : { synth: null, hasUtterance: false, addEventListener: (() => {}) as TtsDeps['addEventListener'], removeEventListener: (() => {}) as TtsDeps['removeEventListener'] };
    this.deps = {
      synth: deps?.synth !== undefined ? deps.synth : browser.synth,
      hasUtterance: deps?.hasUtterance ?? browser.hasUtterance,
      addEventListener: deps?.addEventListener ?? browser.addEventListener,
      removeEventListener: deps?.removeEventListener ?? browser.removeEventListener,
      pollMs: deps?.pollMs ?? DEFAULT_POLL_MS,
      waitMs: deps?.waitMs ?? DEFAULT_WAIT_MS,
    };
  }

  /** Idempotent; safe to call from every mount. */
  start(): void {
    if (this.started || this.stopped) return;
    this.started = true;
    if (!this.deps.synth || !this.deps.hasUtterance) {
      this.publish({ support: 'unsupported', voicesLoaded: true, checkedAt: Date.now() });
      return;
    }
    this.publish({ support: 'checking' });
    this.deps.addEventListener?.('voiceschanged', this.onVoicesChanged);
    this.deps.addEventListener?.('online', this.onRecheckEvent);
    this.deps.addEventListener?.('visibilitychange', this.onRecheckEvent);
    this.scheduleWait();
    this.poll();
  }

  /** Detach every global listener (tests, HMR teardown). */
  stop(): void {
    this.stopped = true;
    this.clearTimers();
    this.deps.removeEventListener?.('voiceschanged', this.onVoicesChanged);
    this.deps.removeEventListener?.('online', this.onRecheckEvent);
    this.deps.removeEventListener?.('visibilitychange', this.onRecheckEvent);
  }

  /**
   * Explicit "Check Audio Compatibility": re-read the OS voice list right now
   * (short async window for engines that populate late) and publish fresh.
   */
  recheck(): void {
    if (!this.started) {
      this.start();
      return;
    }
    if (!this.deps.synth || !this.deps.hasUtterance) return;
    this.clearTimers();
    this.publish({ support: 'checking' });
    this.scheduleWait();
    this.poll();
  }

  getSnapshot = (): TtsStatusSnapshot => this.snap;

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  private onVoicesChanged = (): void => {
    this.clearTimers();
    this.poll();
  };

  private onRecheckEvent = (): void => {
    // Returning to the app / reconnecting: the OS may have gained a voice pack.
    this.recheck();
  };

  private scheduleWait(): void {
    if (this.waitTimer) clearTimeout(this.waitTimer);
    this.waitTimer = setTimeout(() => {
      this.waitTimer = null;
      // The wait window ended — whatever the list holds now is the truth.
      this.finishCheck();
    }, this.deps.waitMs);
  }

  private poll(): void {
    if (this.stopped || !this.deps.synth) return;
    let list: SpeechSynthesisVoice[] = [];
    try {
      list = this.deps.synth.getVoices() || [];
    } catch {
      list = [];
    }
    if (list.length > 0) {
      this.clearTimers();
      this.finishCheck(list);
      return;
    }
    this.pollTimer = setTimeout(() => this.poll(), this.deps.pollMs);
  }

  private finishCheck(list?: SpeechSynthesisVoice[]): void {
    if (this.waitTimer) {
      clearTimeout(this.waitTimer);
      this.waitTimer = null;
    }
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (!list) {
      try {
        list = this.deps.synth?.getVoices() || [];
      } catch {
        list = [];
      }
    }
    const german = classifyGermanVoices(list);
    this.publish({
      support: 'ready',
      voicesLoaded: true,
      german,
      primary: german[0]?.accent ?? null,
      checkedAt: Date.now(),
    });
  }

  private clearTimers(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.waitTimer) {
      clearTimeout(this.waitTimer);
      this.waitTimer = null;
    }
  }

  private publish(patch: Partial<TtsStatusSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch {
        /* listener errors must never break the manager */
      }
    });
  }
}

/** App-wide singleton (browser). Tests construct their own instances. */
export const ttsStatus = new TtsStatusManager();
