/**
 * App-wide speech engine access + reactive state.
 *
 * The GermanSpeech instance is a lazy singleton (browser only); React state
 * (speaking / paused / rate / notice / selected voice) lives in a zustand
 * store so every view — Listen, Vocabulary, Review — shares one source of
 * truth without prop drilling.
 */

import { create } from 'zustand';
import { useEffect } from 'react';
import { GermanSpeech, TTS_SUPPORTED } from './speech';
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
  rate: 1,
  notice: null,
  voiceName: null,
  setNotice: (n) => set({ notice: n }),
  setVoice: (name) => set({ voiceName: name }),
  setRate: (r) => set({ rate: r }),
}));

/**
 * Mounted once (in AppShell). Wires the engine's state callbacks to the
 * store and syncs the persisted voice + default rate from settings.
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
    const eng = getSpeech();
    if (!eng) {
      if (!TTS_SUPPORTED) {
        queueMicrotask(() =>
          useSpeechStore.getState().setNotice(
            'এই ব্রাউজারে Web Speech API নেই — অডিও চলবে না। Chrome/Edge ব্যবহার করো।'
          )
        );
      }
      return;
    }
    const off = eng.onStateChange((state) => {
      useSpeechStore.setState({
        speaking: state === 'speaking' || state === 'paused',
        paused: state === 'paused',
      });
    });
    return off;
  }, []);
}

/** Speak with the current global rate + voice. Returns true when accepted. */
export function speakNow(text: string, rateOverride?: number): boolean {
  const eng = getSpeech();
  const store = useSpeechStore.getState();
  const rate = rateOverride ?? store.rate;
  if (!eng) {
    store.setNotice(
      TTS_SUPPORTED ? 'স্পিচ ইঞ্জিন প্রস্তুত হয়নি — আবার চেষ্টা করো।' : 'এই ব্রাউজারে স্পিচ সাপোর্ট নেই।'
    );
    return false;
  }
  store.setNotice(null);
  const ok = eng.speak(text, {
    rate,
    voiceName: useSettings.getState().voiceName,
    onError: (msg) => useSpeechStore.getState().setNotice(msg),
  });
  if (!ok) {
    useSpeechStore
      .getState()
      .setNotice('অডিও চালু করা যায়নি — পেজে একবার ক্লিক করে আবার চেষ্টা করো।');
  }
  return ok;
}

export function togglePlayPause(): void {
  const eng = getSpeech();
  if (!eng) return;
  const state = eng.getState();
  if (state === 'speaking') eng.pause();
  else if (state === 'paused') eng.resume();
}

export function stopSpeech(): void {
  getSpeech()?.stop();
}
