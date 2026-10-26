'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Info,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SaveWordButton } from './save-word-button';
import { WordChip } from './word-chip';
import { SpeakingPractice } from './speaking-practice';
import type { FlowResult } from '@/lib/types';
import type { WordGlossMap } from '@/lib/glossary';

const SPEEDS = [0.75, 1, 1.25] as const;

interface ResultCardProps {
  result: FlowResult;
  speaking: boolean;
  paused: boolean;
  rate: number;
  speechNotice: string | null;
  glosses: WordGlossMap;
  glossesLoading: boolean;
  onTogglePlay: () => void;
  onReplay: () => void;
  onRateChange: (rate: number) => void;
  /** Play an arbitrary German string (word chips, speaking practice). */
  onPlayText: (text: string) => void;
}

function EqBars({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-end gap-[2px] ${className}`} aria-hidden="true">
      <span className="df-eq-bar h-3" />
      <span className="df-eq-bar h-3" />
      <span className="df-eq-bar h-3" />
      <span className="df-eq-bar h-3" />
    </span>
  );
}

function confidenceLabel(confidence: number): { text: string; tone: 'good' | 'ok' | 'low' } {
  if (confidence >= 0.9) return { text: 'উচ্চ আস্থা — lexicon-ভিত্তিক', tone: 'good' };
  if (confidence >= 0.75) return { text: 'নিয়ম-ভিত্তিক উচ্চারণ', tone: 'ok' };
  return { text: 'কম আস্থা — কিছু শব্দ অনিশ্চিত', tone: 'low' };
}

export function ResultCard({
  result,
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
}: ResultCardProps) {
  const [copied, setCopied] = useState(false);
  const [showWords, setShowWords] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.german);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — ignore silently */
    }
  };

  const confidence = confidenceLabel(result.confidence ?? 0.75);

  return (
    <section
      aria-label="German result"
      className="df-fade-up overflow-hidden rounded-2xl border bg-card shadow-sm"
    >
      {/* ── German text ─────────────────────────────────────────── */}
      <div className="border-b border-border/70 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-muted-foreground">
            German Pronunciation
          </p>
          {speaking && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary font-bangla">
              <EqBars />
              {paused ? 'থেমে আছে' : 'শোনা হচ্ছে…'}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-start justify-between gap-3">
          <p
            lang="de"
            className="font-german text-2xl font-semibold leading-snug tracking-tight sm:text-[28px]"
          >
            {result.german}
          </p>
          <div className="mt-1 flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              aria-label={copied ? 'Copied' : 'Copy German text'}
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
            >
              {copied ? (
                <Check className="h-4 w-4 text-primary" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
            <SaveWordButton
              compact
              german={result.german}
              bengaliPronunciation={result.bengali}
              banglaMeaning={result.bangla}
              sourceSentence={result.sourceText !== result.german ? result.sourceText : null}
            />
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {!result.translated && (
            <p className="text-[11px] text-muted-foreground font-bangla">
              জার্মান ইনপুট — সরাসরি প্লে হয়েছে, অনুবাদ হয়নি
            </p>
          )}
          <p
            className={`inline-flex items-center gap-1 text-[11px] font-medium font-bangla ${
              confidence.tone === 'good'
                ? 'text-accent-foreground'
                : confidence.tone === 'ok'
                  ? 'text-muted-foreground'
                  : 'text-chart-2'
            }`}
          >
            <Info className="h-3 w-3" aria-hidden="true" />
            {confidence.text}
          </p>
        </div>
      </div>

      {/* ── Bengali pronunciation ───────────────────────────────── */}
      <div className="bg-accent/50 p-5 sm:p-6">
        <p className="text-xs font-semibold text-accent-foreground/80 font-bangla">
          বাংলা উচ্চারণ
        </p>
        <p
          lang="bn"
          className="mt-1.5 text-xl font-semibold leading-relaxed text-accent-foreground font-bangla sm:text-2xl"
        >
          {result.bengali || 'উচ্চারণ তৈরি করা যায়নি — অডিওটা মনোযোগ দিয়ে শোনো।'}
        </p>
        <p className="mt-1.5 text-[11px] text-muted-foreground font-bangla">
          আনুমানিক উচ্চারণ — সঠিক ধ্বনির জন্য অডিও অবশ্যই শুনবে
        </p>
      </div>

      {/* ── Bangla meaning ──────────────────────────────────────── */}
      {result.bangla && (
        <div className="border-t border-border/70 p-5 sm:p-6">
          <p className="text-xs font-semibold text-muted-foreground font-bangla">
            বাংলা অর্থ
          </p>
          <p lang="bn" className="mt-1.5 text-base leading-relaxed font-bangla sm:text-lg">
            {result.bangla}
          </p>
        </div>
      )}

      {/* ── Controls ────────────────────────────────────────────── */}
      <div className="border-t border-border/70 bg-card p-4 sm:p-5">
        {speechNotice && (
          <p className="mb-3 flex items-start gap-2 rounded-xl bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground font-bangla">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-chart-2" aria-hidden="true" />
            {speechNotice}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            onClick={onTogglePlay}
            aria-label={speaking && !paused ? 'Pause audio' : 'Play audio'}
            className="h-12 w-12 rounded-full p-0 shadow-sm transition-all hover:scale-105"
          >
            {speaking && !paused ? (
              <Pause className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Play className="h-5 w-5 translate-x-[1px]" aria-hidden="true" />
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onReplay}
            aria-label="Replay audio"
            className="h-10 w-10 rounded-full"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </Button>

          <div
            role="group"
            aria-label="Playback speed"
            className="ml-1 flex overflow-hidden rounded-full border"
          >
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onRateChange(s)}
                aria-pressed={rate === s}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  rate === s
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {s}×
              </button>
            ))}
          </div>

          {result.words.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowWords((v) => !v)}
              aria-expanded={showWords}
              className="ml-auto h-9 rounded-lg px-2.5 text-xs font-medium text-muted-foreground font-bangla hover:text-foreground"
            >
              প্রতি শব্দের উচ্চারণ
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showWords ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </Button>
          )}
        </div>

        {showWords && result.words.length > 0 && (
          <div className="df-fade-up mt-3">
            {glossesLoading && (
              <p className="mb-2 text-[11px] text-muted-foreground font-bangla">
                শব্দার্থ লোড হচ্ছে…
              </p>
            )}
            <ul className="flex flex-wrap gap-2" aria-label="Word by word pronunciation">
              {result.words.map((w, idx) => (
                <WordChip key={`${w.german}-${idx}`} word={w} glosses={glosses} onPlay={onPlayText} />
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground font-bangla">
              শব্দে ট্যাপ → আলাদা শুনবে · + → সেভ · পতাকা → উচ্চারণ সংশোধন
            </p>
          </div>
        )}

        <SpeakingPractice german={result.german} />
      </div>
    </section>
  );
}
