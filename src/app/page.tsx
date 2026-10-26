'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { AppShell, type Section } from '@/components/deutschflow/app-shell';
import { ListenView } from '@/components/deutschflow/listen-view';
import { VocabularyView } from '@/components/deutschflow/vocabulary-view';
import { ReviewView } from '@/components/deutschflow/review-view';
import { HistoryView } from '@/components/deutschflow/history-view';
import { ProgressView } from '@/components/deutschflow/progress-view';
import { SettingsView } from '@/components/deutschflow/settings-view';
import { ThemeToggle } from '@/components/deutschflow/theme-toggle';
import { VoiceSettings } from '@/components/deutschflow/voice-settings';
import { InstallPrompt, OfflineIndicator, ServiceWorkerRegistrar } from '@/components/deutschflow/pwa';
import { detectLanguage } from '@/lib/language';
import { pronunciation } from '@/lib/pronunciation';
import { onOverridesChange } from '@/lib/overrides';
import { translateSmart } from '@/lib/translation/client';
import { fetchGlossary, type WordGlossMap } from '@/lib/glossary';
import { useSpeechEngine, speakNow, togglePlayPause, getSpeech, useSpeechStore } from '@/lib/speech-client';
import { useSettings } from '@/lib/settings';
import { useVocab, type FlashcardScope } from '@/lib/vocabulary';
import { recordListen } from '@/lib/stats';
import {
  addToHistory,
  clearHistory as clearHistoryStore,
  removeHistoryItem,
  loadHistory,
} from '@/lib/history';
import type { FlowResult, HistoryItem } from '@/lib/types';

type Status = 'idle' | 'working' | 'error';

export default function Home() {
  // ── Section routing ─────────────────────────────────────────────
  const [section, setSection] = useState<Section>('listen');
  /** Pending flashcard scope launched from Vocabulary / word details. */
  const [reviewLaunch, setReviewLaunch] = useState<FlashcardScope | null>(null);
  const startReview = useCallback((scope: FlashcardScope) => {
    setReviewLaunch(scope);
    setSection('review');
  }, []);

  // ── Global stores ───────────────────────────────────────────────
  useSpeechEngine();
  const autoplay = useSettings((s) => s.autoplay);
  const loadVocab = useVocab((s) => s.load);

  // ── Listening flow state ────────────────────────────────────────
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FlowResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [glosses, setGlosses] = useState<WordGlossMap>({});
  const [glossesLoading, setGlossesLoading] = useState(false);

  const requestRef = useRef(0);
  const glossAbortRef = useRef<AbortController | null>(null);

  // ── Init: history + vocabulary + voices-loaded notice ──────────
  useEffect(() => {
    queueMicrotask(() => setHistory(loadHistory()));
    void loadVocab();
  }, [loadVocab]);

  // ── Pronunciation overrides changed → re-render the live result ──
  useEffect(() => {
    const off = onOverridesChange(() => {
      setResult((prev) => {
        if (!prev) return prev;
        const pron = pronunciation.transliterate(prev.german);
        return { ...prev, bengali: pron.bengali, words: pron.words, confidence: pron.confidence };
      });
    });
    return off;
  }, []);

  // ── Playback helpers (speech store is global) ───────────────────
  const speaking = useSpeechStore((s) => s.speaking);
  const paused = useSpeechStore((s) => s.paused);
  const rate = useSpeechStore((s) => s.rate);
  const speechNotice = useSpeechStore((s) => s.notice);
  const voiceName = useSettings((s) => s.voiceName);

  const play = useCallback((text: string, newRate?: number) => {
    speakNow(text, newRate);
  }, []);

  const handleTogglePlay = useCallback(() => {
    if (!useSpeechStore.getState().speaking && result) {
      play(result.german);
      return;
    }
    togglePlayPause();
  }, [play, result]);

  const handleRateChange = useCallback(
    (next: number) => {
      useSpeechStore.getState().setRate(next);
      useSettings.getState().setDefaultRate(next);
      // Restart the current sentence live at the new speed.
      const store = useSpeechStore.getState();
      if (store.speaking && result) play(result.german, next);
    },
    [play, result]
  );

  // ── Progressive glossary (never blocks audio) ───────────────────
  const loadGlosses = useCallback((german: string) => {
    glossAbortRef.current?.abort();
    const controller = new AbortController();
    glossAbortRef.current = controller;
    setGlossesLoading(true);
    void fetchGlossary(german, controller.signal)
      .then((map) => {
        if (controller.signal.aborted) return;
        setGlosses(map);
      })
      .catch(() => {
        /* glossary is optional */
      })
      .finally(() => {
        if (!controller.signal.aborted) setGlossesLoading(false);
      });
  }, []);

  // ── Core one-click flow ─────────────────────────────────────────
  const runFlow = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text) return;

      const requestId = ++requestRef.current;
      setStatus('working');
      setError(null);
      useSpeechStore.getState().setNotice(null);

      const lang = detectLanguage(text);
      try {
        const res = await translateSmart(text, lang);
        if (requestId !== requestRef.current) return; // stale response

        const pron = pronunciation.transliterate(res.german);
        const flow: FlowResult = {
          german: res.german,
          bengali: pron.bengali,
          bangla: res.bangla,
          words: pron.words,
          approximate: pron.hasUncertain,
          confidence: pron.confidence,
          sourceText: text,
          sourceLang: lang,
          translated: res.translated,
        };
        setResult(flow);
        setStatus('idle');
        setHistory((prev) => addToHistory(prev, flow));
        void recordListen();

        // Audio first, enrichment after — always.
        if (autoplay) play(flow.german);
        loadGlosses(flow.german);
      } catch (err) {
        if (requestId !== requestRef.current) return;
        setStatus('error');
        setError(
          err instanceof Error
            ? err.message
            : 'অনুবাদ করা যায়নি। একটু পরে আবার চেষ্টা করো।'
        );
      }
    },
    [autoplay, play, loadGlosses]
  );

  const handleSubmit = useCallback(() => {
    if (status === 'working') return;
    void runFlow(input);
  }, [input, runFlow, status]);

  const handleExample = useCallback(
    (text: string) => {
      if (status === 'working') return;
      setInput(text);
      void runFlow(text);
    },
    [runFlow, status]
  );

  const handleHistoryPlay = useCallback(
    (item: HistoryItem) => {
      if (status === 'working') return;
      const pron = pronunciation.transliterate(item.german);
      setResult({
        german: item.german,
        bengali: item.bengali,
        bangla: item.bangla,
        words: pron.words,
        approximate: false,
        confidence: pron.confidence,
        sourceText: item.sourceText,
        sourceLang: item.sourceLang,
        translated: item.sourceLang !== 'de',
      });
      setSection('listen');
      play(item.german);
      loadGlosses(item.german);
    },
    [play, status, loadGlosses]
  );

  const handleClearHistory = useCallback(() => {
    setHistory(clearHistoryStore());
  }, []);

  const handleRemoveHistory = useCallback((id: string) => {
    setHistory((prev) => removeHistoryItem(id, prev));
  }, []);

  return (
    <>
      <AppShell
      section={section}
      onSectionChange={setSection}
      headerRight={
        <>
          <VoiceSettings
            speech={getSpeech()}
            selectedVoice={voiceName}
            onSelectVoice={(name) => {
              useSettings.getState().setVoiceName(name);
            }}
          />
          <ThemeToggle />
        </>
      }
    >
      <div key={section} className="df-page-enter">
        {section === 'listen' && (
          <ListenView
          input={input}
          onInputChange={setInput}
          onSubmit={handleSubmit}
          busy={status === 'working'}
          result={result}
          error={error}
          status={status}
          onExample={handleExample}
          speaking={speaking}
          paused={paused}
          rate={rate}
          speechNotice={speechNotice}
          glosses={glosses}
          glossesLoading={glossesLoading}
          onTogglePlay={handleTogglePlay}
          onReplay={() => result && play(result.german)}
          onRateChange={handleRateChange}
          onPlayText={play}
          history={history}
          onHistoryPlay={handleHistoryPlay}
          onClearHistory={handleClearHistory}
          onSeeAllHistory={() => setSection('history')}
        />
      )}

      {section === 'vocabulary' && <VocabularyView onStartReview={startReview} />}

      {section === 'review' && (
        <ReviewView launchScope={reviewLaunch} onLaunchConsumed={() => setReviewLaunch(null)} />
      )}

      {section === 'history' && (
        <HistoryView
          items={history}
          onPlay={handleHistoryPlay}
          onClear={handleClearHistory}
          onRemove={handleRemoveHistory}
        />
      )}

      {section === 'progress' && <ProgressView />}

      {section === 'settings' && <SettingsView />}
      </div>
    </AppShell>
      <InstallPrompt />
      <OfflineIndicator />
      <ServiceWorkerRegistrar />
    </>
  );
}
