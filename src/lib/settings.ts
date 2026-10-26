/**
 * User settings (zustand + localStorage persist).
 *
 * Small preference data only — never large collections. Vocabulary and
 * cached results live in IndexedDB (see lib/storage/idb.ts).
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type RateChoice = 0.75 | 1 | 1.25;
/** Where German audio should come from. */
export type AudioSourceChoice = 'auto' | 'browser' | 'online';

interface SettingsState {
  /** Automatically play German audio once the result is ready. */
  autoplay: boolean;
  /** Default playback speed for every new utterance. */
  defaultRate: RateChoice;
  /** Preferred German voice name (device-dependent). */
  voiceName: string | null;
  /** Preferred audio source: browser TTS, configured online provider, or auto. */
  audioSource: AudioSourceChoice;
  /** When no German voice exists, automatically try the configured online provider. */
  onlineFallback: boolean;
  /** Daily vocabulary review target. */
  dailyReviewTarget: number;
  /** How many listening-history entries to keep. */
  historyLimit: number;
  setAutoplay: (v: boolean) => void;
  setDefaultRate: (v: RateChoice) => void;
  setVoiceName: (v: string | null) => void;
  setAudioSource: (v: AudioSourceChoice) => void;
  setOnlineFallback: (v: boolean) => void;
  setDailyReviewTarget: (v: number) => void;
  setHistoryLimit: (v: number) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      autoplay: true,
      defaultRate: 1,
      voiceName: null,
      audioSource: 'auto',
      onlineFallback: false,
      dailyReviewTarget: 10,
      historyLimit: 100,
      setAutoplay: (v) => set({ autoplay: v }),
      setDefaultRate: (v) => set({ defaultRate: v }),
      setVoiceName: (v) => set({ voiceName: v }),
      setAudioSource: (v) => set({ audioSource: v }),
      setOnlineFallback: (v) => set({ onlineFallback: v }),
      setDailyReviewTarget: (v) => set({ dailyReviewTarget: v }),
      setHistoryLimit: (v) => set({ historyLimit: v }),
    }),
    {
      name: 'deutschflow.settings.v1',
      onRehydrateStorage: () => (state) => {
        // Migrate the pre-settings voice key used by early versions.
        if (state && !state.voiceName && typeof window !== 'undefined') {
          try {
            const legacy = window.localStorage.getItem('deutschflow.voice.v1');
            if (legacy) state.setVoiceName(legacy);
          } catch {
            /* ignore */
          }
        }
      },
    }
  )
);
