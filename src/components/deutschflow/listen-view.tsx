'use client';

import { AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Hero } from './hero';
import { InputCard } from './input-card';
import { ResultCard } from './result-card';
import { EmptyState } from './empty-state';
import { HistoryList } from './history-list';
import type { FlowResult, HistoryItem } from '@/lib/types';
import type { WordGlossMap } from '@/lib/glossary';

interface ListenViewProps {
  input: string;
  onInputChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  result: FlowResult | null;
  error: string | null;
  status: 'idle' | 'working' | 'error';
  onExample: (text: string) => void;
  speaking: boolean;
  paused: boolean;
  rate: number;
  speechNotice: string | null;
  glosses: WordGlossMap;
  glossesLoading: boolean;
  onTogglePlay: () => void;
  onReplay: () => void;
  onRateChange: (r: number) => void;
  onPlayText: (text: string) => void;
  history: HistoryItem[];
  onHistoryPlay: (item: HistoryItem) => void;
  onClearHistory: () => void;
  onSeeAllHistory: () => void;
}

export function ListenView(props: ListenViewProps) {
  const {
    input,
    onInputChange,
    onSubmit,
    busy,
    result,
    error,
    status,
    onExample,
    speaking,
    paused,
    rate,
    speechNotice,
    glosses,
    glossesLoading,
    onTogglePlay,
    onReplay,
    onRateChange,
    onPlayText,
    history,
    onHistoryPlay,
    onClearHistory,
    onSeeAllHistory,
  } = props;

  const showEmpty = !result && status !== 'working' && status !== 'error';

  return (
    <>
      <div className="pt-2">
        <Hero />

        <div className="mt-7 space-y-5">
          <InputCard value={input} onChange={onInputChange} onSubmit={onSubmit} busy={busy} />

          {status === 'error' && error && (
            <section
              aria-live="assertive"
              className="df-fade-up rounded-2xl border border-destructive/30 bg-destructive/5 p-5"
            >
              <p className="flex items-start gap-2.5 text-sm leading-relaxed text-destructive font-bangla">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
              <p className="mt-2 truncate rounded-lg bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                তোমার লেখা: <span className="font-medium text-foreground">{input.trim()}</span>
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={onSubmit}
                className="mt-3 h-9 rounded-lg px-3 text-xs font-bangla"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                আবার চেষ্টা করো
              </Button>
            </section>
          )}

          {result && (
            <ResultCard
              result={result}
              speaking={speaking}
              paused={paused}
              rate={rate}
              speechNotice={speechNotice}
              glosses={glosses}
              glossesLoading={glossesLoading}
              onTogglePlay={onTogglePlay}
              onReplay={onReplay}
              onRateChange={onRateChange}
              onPlayText={onPlayText}
            />
          )}

          {showEmpty && <EmptyState onExample={onExample} />}

          {history.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-1">
                <h2 className="text-[13px] font-semibold text-muted-foreground font-bangla">
                  সাম্প্রতিক শোনা
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSeeAllHistory}
                  className="h-8 gap-1 rounded-lg px-2.5 text-xs font-medium text-muted-foreground font-bangla hover:text-foreground"
                >
                  সব দেখো
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
              <HistoryList items={history.slice(0, 6)} onPlay={onHistoryPlay} onClear={onClearHistory} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
