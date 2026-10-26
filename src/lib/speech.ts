/**
 * German speech engine built on the browser Web Speech API (speechSynthesis).
 *
 * Design goals (see requirements):
 *  - prefer a German voice (de-DE first, then any de-*)
 *  - reliable cancellation before every new playback (no overlapping speech)
 *  - replay without touching the translation API (playback is fully decoupled)
 *  - playback speed control, applied live
 *  - honest error surfacing: never fake successful playback
 *  - iOS Safari unlock via a priming utterance inside the user gesture
 */

export type SpeechState = 'idle' | 'speaking' | 'paused' | 'error';

export interface SpeakOptions {
  rate?: number;
  voiceName?: string | null;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

function scoreVoice(v: SpeechSynthesisVoice): number {
  let score = 0;
  const lang = (v.lang || '').toLowerCase().replace('_', '-');
  if (lang === 'de-de') score += 10;
  else if (lang.startsWith('de')) score += 6;
  else return -1; // not a German voice at all
  const name = v.name || '';
  if (/natural|neural|online/i.test(name)) score += 4;
  if (/google/i.test(name)) score += 3;
  if (/premium|enhanced|quality/i.test(name)) score += 2;
  if (v.localService) score += 1;
  return score;
}

export class GermanSpeech {
  supported: boolean;
  private voices: SpeechSynthesisVoice[] = [];
  private queue: SpeechSynthesisUtterance[] = [];
  private state: SpeechState = 'idle';
  private listeners = new Set<(state: SpeechState) => void>();
  private activeText: { text: string; rate: number; opts: SpeakOptions } | null = null;
  private stopped = false;

  constructor() {
    this.supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  init(): void {
    if (!this.supported) return;
    this.loadVoices();
    try {
      window.speechSynthesis.onvoiceschanged = () => this.loadVoices();
    } catch {
      /* some engines do not support the event */
    }
  }

  private loadVoices(): void {
    try {
      this.voices = window.speechSynthesis.getVoices() || [];
    } catch {
      this.voices = [];
    }
  }

  getGermanVoices(): SpeechSynthesisVoice[] {
    return this.voices
      .map((v) => ({ v, s: scoreVoice(v) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.v);
  }

  hasGermanVoice(): boolean {
    return this.getGermanVoices().length > 0;
  }

  private pickVoice(preferredName?: string | null): SpeechSynthesisVoice | null {
    const german = this.getGermanVoices();
    if (preferredName) {
      const found = german.find((v) => v.name === preferredName);
      if (found) return found;
    }
    return german[0] ?? null;
  }

  onStateChange(cb: (state: SpeechState) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private setState(s: SpeechState): void {
    this.state = s;
    this.listeners.forEach((cb) => {
      try {
        cb(s);
      } catch {
        /* listener errors must never break playback */
      }
    });
  }

  getState(): SpeechState {
    return this.state;
  }

  /**
   * Called inside a real user gesture to unlock iOS Safari speech synthesis.
   * Speaks an empty utterance — harmless everywhere, critical on iOS.
   */
  prime(): void {
    if (!this.supported) return;
    try {
      const u = new SpeechSynthesisUtterance('');
      u.lang = 'de-DE';
      u.volume = 0;
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  }

  /** Speak German text. Cancels anything currently playing first. */
  speak(text: string, options: SpeakOptions = {}): boolean {
    if (!this.supported) return false;
    const trimmed = text.trim();
    if (!trimmed) return false;

    this.cancelInternal();

    const rate = options.rate ?? 1;
    const voice = this.pickVoice(options.voiceName);
    const chunks = this.chunkText(trimmed);

    this.activeText = { text: trimmed, rate, opts: options };
    this.stopped = false;
    this.queue = [];

    chunks.forEach((chunk, idx) => {
      const u = new SpeechSynthesisUtterance(chunk);
      if (voice) u.voice = voice;
      u.lang = voice?.lang || 'de-DE';
      u.rate = rate;
      u.pitch = 1;
      u.volume = 1;
      if (idx === 0) u.onstart = () => this.setState('speaking');
      u.onend = () => {
        if (this.stopped) return;
        this.queue.shift();
        if (this.queue.length === 0) {
          this.setState('idle');
          options.onEnd?.();
        } else {
          // Chrome throttles chained utterances slightly; speak next immediately
          try {
            window.speechSynthesis.speak(this.queue[0]);
          } catch {
            this.setState('error');
            options.onError?.('স্পিচ চালু করা যায়নি।');
          }
        }
      };
      u.onerror = (ev) => {
        if (this.stopped) return;
        const err = (ev as SpeechSynthesisErrorEvent).error;
        if (err === 'interrupted' || err === 'canceled') {
          this.setState('idle');
          return;
        }
        this.setState('error');
        options.onError?.(
          err === 'not-allowed'
            ? 'ব্রাউজার অডিও ব্লক করেছে — একবার পেজে ক্লিক করে আবার চেষ্টা করো।'
            : 'অডিও প্লে করা যায়নি। অন্য ভয়েস বা ব্রাউজার চেষ্টা করো।'
        );
      };
      this.queue.push(u);
    });

    try {
      window.speechSynthesis.speak(this.queue[0]);
      return true;
    } catch {
      this.setState('error');
      return false;
    }
  }

  /** Split long text into sentences — Chrome pauses long utterances. */
  private chunkText(text: string): string[] {
    if (text.length <= 220) return [text];
    const parts = text.split(/(?<=[.!?…:;])\s+/).filter(Boolean);
    const chunks: string[] = [];
    let cur = '';
    for (const p of parts) {
      if ((cur + ' ' + p).trim().length > 200 && cur) {
        chunks.push(cur.trim());
        cur = p;
      } else {
        cur = (cur + ' ' + p).trim();
      }
    }
    if (cur) chunks.push(cur.trim());
    return chunks.length ? chunks : [text];
  }

  pause(): void {
    if (!this.supported) return;
    try {
      window.speechSynthesis.pause();
      this.setState('paused');
    } catch {
      /* ignore */
    }
  }

  resume(): void {
    if (!this.supported) return;
    try {
      window.speechSynthesis.resume();
      this.setState('speaking');
    } catch {
      /* ignore */
    }
  }

  /** Hard stop of any current or queued speech. */
  stop(): void {
    if (!this.supported) return;
    this.cancelInternal();
  }

  private cancelInternal(): void {
    this.stopped = true;
    this.queue = [];
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    this.setState('idle');
  }
}

export const TTS_SUPPORTED =
  typeof window !== 'undefined' && 'speechSynthesis' in window;
