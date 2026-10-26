/**
 * App-wide speech engine access + reactive state + the PLAYBACK ORCHESTRATOR.
 *
 * The GermanSpeech instance is a lazy singleton (browser only); React state
 * (speaking / paused / rate / notice / selected voice / online playback)
 * lives in a zustand store so every view — Listen, Vocabulary, Review —
 * shares one source of truth without prop drilling.
 *
 * Fallback priority when the user presses Play (honest at every step — the
 * app never fakes German audio and never reads German with an English voice):
 *
 *   1. native German TTS       de-DE voice (or the user's saved German voice)
 *   2. alternative German      de-AT / de-CH / regional de — accent-labelled
 *   3. online provider         ONLY when configured (probed) + allowed by the
 *                              user's source/fallback preference; needs internet
 *   4. manual alternatives     pronunciation guide + troubleshooting — always
 *                              available offline
 */

import { useEffect, useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { GermanSpeech, TTS_SUPPORTED } from './speech';
import { ttsStatus, type TtsStatusSnapshot } from './tts-status';
import {
  stopOnlineAudio,
  fetchGermanAudio,
  playOnlineAudio,
} from './tts-provider';
import { useSettings } from './settings';

let engine: GermanSpeech | null = null;
let engineRequested = false;

export function getSpeech(): GermanSpeech | null {
  if (typeof window === 'undefined' || !TTS_SUPPORTED) return null;
  if (!engineRequested) {
    engineRequested = true;
    engine = new GermanSpeech();
    engine.init();
  }
  return engine;
}

interface SpeechStore {
  supported: boolean;
  speaking: boolean;
  paused: boolean;
  /** Online-provider audio is loading (spinner state — never left stuck). */
  onlineLoading: boolean;
  /** Online-provider audio is actively playing (drives the Stop button). */
  onlinePlaying: boolean;
  rate: number;
  notice: string | null;
  voiceName: string | null;
  setNotice: (n: string | null) => void;
  setVoice: (name: string | null) => void;
  setRate: (r: number) => void;
}

export const useSpeechStore = create<SpeechStore>()((set) => ({
  supported: TTS_SUPPORTED,
  speaking: false,
  paused: false,
  onlineLoading: false,
  onlinePlaying: false,
  rate: 1,
  notice: null,
  voiceName: null,
  setNotice: (n) => set({ notice: n }),
  setVoice: (name) => set({ voiceName: name }),
  setRate: (r) => set({ rate: r }),
}));

/** React binding for the centralized capability manager. */
export function useTtsStatus(): TtsStatusSnapshot {
  return useSyncExternalStore(ttsStatus.subscribe, ttsStatus.getSnapshot, ttsStatus.getSnapshot);
}

/** Minimal voice descriptor for fallback logic (name + normalized lang). */
interface VoiceLite {
  name: string;
  lang: string;
}

function listGermanVoices(eng: GermanSpeech | null): VoiceLite[] {
  if (!eng) return [];
  return eng.getGermanVoices().map((v) => ({
    name: v.name,
    lang: (v.lang || '').toLowerCase().replace('_', '-'),
  }));
}

function accentLabelOf(lang: string): string {
  if (lang.startsWith('de-de')) return 'জার্মান (জার্মানি)';
  if (lang.startsWith('de-at')) return 'অস্ট্রিয়ান জার্মান';
  if (lang.startsWith('de-ch')) return 'সুইস জার্মান';
  return 'জার্মান (অঞ্চল অজানা)';
}

/**
 * Mounted once (in AppShell). Wires the engine's state callbacks to the
 * store, starts the capability manager and syncs persisted preferences.
 */
export function useSpeechEngine(): void {
  const voiceName = useSettings((s) => s.voiceName);
  const defaultRate = useSettings((s) => s.defaultRate);
  const setVoice = useSpeechStore((s) => s.setVoice);
  const setRate = useSpeechStore((s) => s.setRate);

  useEffect(() => {
    setVoice(voiceName);
  }, [voiceName, setVoice]);

  useEffect(() => {
    setRate(defaultRate);
  }, [defaultRate, setRate]);

  useEffect(() => {
    ttsStatus.start(); // idempotent — checks API, waits for async voices
    const eng = getSpeech();
    if (!eng) {
      if (!TTS_SUPPORTED) {
        queueMicrotask(() =>
          useSpeechStore.getState().setNotice(
            'এই ব্রাউজারে Web Speech API নেই — বিল্ট-ইন ভয়েস চলবে না। Chrome/Edge ব্যবহার করো বা উচ্চারণ গাইড দেখো।'
          )
        );
      }
      return;
    }
    return eng.onStateChange((state) => {
      useSpeechStore.setState({
        speaking:
          state === 'speaking' ||
          state === 'paused' ||
          useSpeechStore.getState().onlinePlaying,
        paused: state === 'paused',
      });
    });
  }, []);
}

// ── Playback orchestration ───────────────────────────────────────────

function notify(message: string): void {
  useSpeechStore.getState().setNotice(message);
}

/**
 * Native browser TTS path. Returns true when playback was accepted.
 * Never substitutes a non-German voice: with zero German voices it refuses
 * and points at the online tier / manual alternatives instead.
 */
function speakNative(eng: GermanSpeech, text: string, rate: number): boolean {
  const german = listGermanVoices(eng);
  const saved = useSettings.getState().voiceName;

  if (german.length === 0) {
    notify(
      'এই ব্রাউজারে এখন ব্যবহারযোগ্য জার্মান ভয়েস নেই — উচ্চারণ গাইড দেখো বা সেটিংসে অনলাইন অডিও চালু করো।'
    );
    return false;
  }

  // A saved voice missing on this device (device switch, removed voice pack)
  // gracefully falls back to the best German voice — with an honest note.
  const voiceMissing = saved !== null && !german.some((v) => v.name === saved);

  const ok = eng.speak(text, {
    rate,
    voiceName: voiceMissing ? null : saved,
    onEnd: () => {
      useSpeechStore.setState({ speaking: false, paused: false });
    },
    onError: (msg) => {
      useSpeechStore.setState({ speaking: false, paused: false });
      notify(msg);
    },
  });
  if (!ok) {
    notify('অডিও চালু করা যায়নি — পেজে একবার ক্লিক করে আবার চেষ্টা করো।');
    return false;
  }
  if (voiceMissing) {
    notify(`সেভ করা ভয়েস “${saved}” এই ডিভাইসে নেই — সেরা জার্মান ভয়েস ব্যবহার হচ্ছে।`);
  } else {
    const chosenName = saved ?? german[0]?.name;
    const chosen = german.find((v) => v.name === chosenName);
    const label = chosen ? accentLabelOf(chosen.lang) : null;
    if (label && label !== 'জার্মান (জার্মানি)') {
      notify(`জার্মান ভয়েস: ${label} — উচ্চারণে সামান্য ভিন্নতা হতে পারে।`);
    }
  }
  return true;
}

/**
 * Configured online provider path. Returns true when the attempt started
 * (loading state is surfaced immediately; errors land as notices).
 */
async function speakOnline(text: string): Promise<boolean> {
  stopOnlineAudio(); // never overlap the two audio systems
  stopNativeSpeech();
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    notify('অফলাইনে অনলাইন জার্মান অডিও চলবে না — সেভ করা শব্দ আর উচ্চারণ গাইড ব্যবহার করো।');
    return false;
  }
  useSpeechStore.getState().setNotice(null);
  useSpeechStore.setState({ onlineLoading: true });

  const result = await fetchGermanAudio(text);

  useSpeechStore.setState({ onlineLoading: false });
  if (!result.ok) {
    notify(result.message);
    return false;
  }
  const started = playOnlineAudio(result.blob, {
    onEnd: () => {
      useSpeechStore.setState({ onlinePlaying: false, speaking: false });
    },
    onError: (msg) => {
      useSpeechStore.setState({ onlinePlaying: false, speaking: false });
      notify(msg);
    },
  });
  if (started) {
    useSpeechStore.setState({ onlinePlaying: true, speaking: true });
    notify(
      result.fromCache
        ? 'ক্যাশ করা অনলাইন অডিও বাজছে — ইন্টারনেট ছাড়াও আবার শোনা যাবে।'
        : 'অনলাইন জার্মান অডিও বাজছে — এর জন্য ইন্টারনেট লাগে।'
    );
  }
  return started;
}

function stopNativeSpeech(): void {
  getSpeech()?.stop();
}

/**
 * The single Play entry point used by every view. Respects the persisted
 * audio-source preference and fallback flag; returns true when a playback
 * attempt actually started (native accept OR online fetch kicked off).
 */
export function speakNow(text: string, rateOverride?: number): boolean {
  const store = useSpeechStore.getState();
  const settings = useSettings.getState();
  const rate = rateOverride ?? store.rate;
  store.setNotice(null);

  const status = ttsStatus.getSnapshot();

  // Voice list still loading (some browsers populate it late) — never claim
  // failure while a check is in flight; the status indicator shows progress.
  if (status.support === 'checking') {
    notify('ভয়েস তালিকা লোড হচ্ছে — এক মুহূর্ত পর আবার চাপো।');
    return false;
  }

  switch (settings.audioSource) {
    case 'online':
      void speakOnline(text);
      return true; // async attempt started; errors surface as notices
    case 'browser': {
      const eng = getSpeech();
      if (!eng) {
        notify(
          status.support === 'unsupported'
            ? 'এই ব্রাউজারে Web Speech API নেই — অনলাইন অডিও অথবা উচ্চারণ গাইড ব্যবহার করো।'
            : 'স্পিচ ইঞ্জিন প্রস্তুত হয়নি — আবার চেষ্টা করো।'
        );
        return false;
      }
      return speakNative(eng, text, rate);
    }
    case 'auto':
    default: {
      const eng = getSpeech();
      if (eng && listGermanVoices(eng).length > 0) {
        return speakNative(eng, text, rate);
      }
      // No native German voice — the ONLY auto step beyond native is a
      // configured online provider, and only when the user opted in.
      if (settings.onlineFallback) {
        void speakOnline(text);
        return true;
      }
      notify(
        status.support === 'unsupported'
          ? 'এই ব্রাউজারে স্পিচ সাপোর্ট নেই — উচ্চারণ গাইড দেখো; সেটিংসে অনলাইন অডিও চালু করা যায়।'
          : 'এই ডিভাইসে ব্যবহারযোগ্য জার্মান ভয়েস নেই — উচ্চারণ গাইড দেখো, বা সেটিংসে অনলাইন জার্মান অডিও চালু করো।'
      );
      return false;
    }
  }
}

export function togglePlayPause(): void {
  // Pause/resume applies to native speech only; online audio is stop/start.
  const eng = getSpeech();
  if (!eng) return;
  const state = eng.getState();
  if (state === 'speaking') eng.pause();
  else if (state === 'paused') eng.resume();
}

/** Stop EVERYTHING — native utterances and online audio alike. */
export function stopSpeech(): void {
  stopOnlineAudio();
  stopNativeSpeech();
}
