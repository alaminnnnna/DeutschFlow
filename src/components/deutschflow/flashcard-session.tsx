'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Eye,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useVocab, buildDeck, FLASHCARD_CAP, type FlashcardScope } from '@/lib/vocabulary';
import { type Rating } from '@/lib/review';
import { speakNow } from '@/lib/speech-client';
import { useSettings } from '@/lib/settings';
import { bnNum } from '@/lib/bn';

const RATING_META: Array<{ rating: Rating; label: string; kbd: string; className: string }> = [
  { rating: 'again', label: 'আবার শিখব', kbd: '1', className: 'bg-destructive text-destructive-foreground hover:bg-destructive/90' },
  { rating: 'hard', label: 'কঠিন', kbd: '2', className: 'bg-chart-2 text-white hover:opacity-90' },
  { rating: 'good', label: 'ভালো', kbd: '3', className: 'bg-primary text-primary-foreground hover:bg-primary/90' },
  { rating: 'easy', label: 'সহজ', kbd: '4', className: 'bg-accent text-accent-foreground hover:bg-accent/80' },
];

interface Counts {
  again: number;
  hard: number;
  good: number;
  easy: number;
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${bnNum(m)}:${bnNum(String(s).padStart(2, '0'))}`;
}

/**
 * Distraction-free flashcard session. Ratings are the ONLY thing that
 * touches the review log — they persist immediately (one rating = one
 * record), a submission lock prevents duplicate entries from double taps,
 * and exiting never discards already-saved progress.
 */
export function FlashcardSession({
  scope,
  shuffle,
  onExit,
}: {
  scope: FlashcardScope;
  /** Shuffle before building the deck. Defaults: off for due/word/list — on for collections. */
  shuffle?: boolean;
  onExit: () => void;
}) {
  const { entries, loaded, reviewWord } = useVocab();

  const [deck, setDeck] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [counts, setCounts] = useState<Counts>({ again: 0, hard: 0, good: 0, easy: 0 });
  const [ratedIds, setRatedIds] = useState<Set<string>>(new Set());
  const startedAt = useRef(Date.now());
  const busyRef = useRef(false);

  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

  // Build the deck once entries are available. The `deck !== null` guard
  // keeps in-session entry updates (e.g. after a rating) from rebuilding it.
  useEffect(() => {
    if (deck !== null || !loaded) return;
    const cap = scope.kind === 'due' ? useSettings.getState().dailyReviewTarget : FLASHCARD_CAP;
    const doShuffle = shuffle ?? (scope.kind !== 'word' && scope.kind !== 'list' && scope.kind !== 'due');
    setDeck(buildDeck(entries, scope, { shuffle: doShuffle, cap }));
  }, [loaded, deck, entries, scope, shuffle]);

  // Release the submission lock whenever the visible card changes.
  useEffect(() => {
    busyRef.current = false;
  }, [index, revealed]);

  const currentId = deck && index < deck.length ? deck[index] : null;
  const current = currentId ? byId.get(currentId) ?? null : null;
  const finished = deck !== null && index >= deck.length;
  const total = deck?.length ?? 0;

  const rate = useCallback(
    (rating: Rating) => {
      if (paused || finished || !currentId || busyRef.current) return;
      const entry = byId.get(currentId);
      if (!entry) return;
      busyRef.current = true;

      // Honest accounting: schedule through the store (appends history +
      // persists immediately), then advance. 'again' re-queues the card a
      // few positions later in the same session.
      void reviewWord(currentId, rating);
      if (rating === 'again') {
        setDeck((d) => {
          if (!d) return d;
          const card = d[index];
          const rest = [...d.slice(0, index), ...d.slice(index + 1)];
          const insertAt = Math.min(index + 3, rest.length);
          return [...rest.slice(0, insertAt), card, ...rest.slice(insertAt)];
        });
      }
      setCounts((c) => ({ ...c, [rating]: c[rating] + 1 }));
      setRatedIds((prev) => new Set(prev).add(currentId));
      setRevealed(false);
      setIndex((i) => i + 1);
    },
    [paused, finished, currentId, byId, reviewWord, index]
  );

  const next = useCallback(() => {
    if (!deck) return;
    setRevealed(false);
    setIndex((i) => Math.min(i + 1, deck.length));
  }, [deck]);

  const prev = useCallback(() => {
    if (index <= 0) return;
    setRevealed(false);
    setIndex((i) => i - 1);
  }, [index]);

  const reshuffle = useCallback(() => {
    setDeck((d) => {
      if (!d) return d;
      const head = d.slice(0, index);
      const rest = d.slice(index);
      for (let i = rest.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      return [...head, ...rest];
    });
  }, [index]);

  const requestExit = useCallback(() => {
    if (ratedIds.size > 0) setExitOpen(true);
    else onExit();
  }, [ratedIds.size, onExit]);

  // Keyboard shortcuts: space = flip · 1–4 = ratings · ←/→ = navigate · Esc = pause
  useEffect(() => {
    if (paused || finished || !deck) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          setRevealed((r) => !r);
          break;
        case '1': rate('again'); break;
        case '2': rate('hard'); break;
        case '3': rate('good'); break;
        case '4': rate('easy'); break;
        case 'ArrowRight': next(); break;
        case 'ArrowLeft': prev(); break;
        case 'Escape': setPaused(true); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paused, finished, deck, rate, next, prev]);

  // ── Loading / empty deck ────────────────────────────────────────────
  if (!loaded || deck === null) {
    return (
      <p className="pt-16 text-center text-sm text-muted-foreground font-bangla">কার্ড প্রস্তুত হচ্ছে…</p>
    );
  }

  if (total === 0) {
    return (
      <div className="df-fade-up pt-6 text-center">
        <p className="text-base font-semibold font-bangla">এই সংগ্রহে কার্ড নেই</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground font-bangla">
          অন্য একটা সংগ্রহ বেছে নাও, অথবা আগে কিছু শব্দ সেভ করো।
        </p>
        <Button onClick={onExit} variant="outline" className="mt-5 rounded-xl font-bangla">ফিরে যাও</Button>
      </div>
    );
  }

  // ── Session summary ─────────────────────────────────────────────────
  if (finished) {
    const reviewed = ratedIds.size;
    const correct = counts.good + counts.easy + counts.hard;
    const duration = Date.now() - startedAt.current;
    const advice =
      counts.again > 0
        ? '“আবার শিখব”-চিহ্নিত শব্দগুলো ১০ মিনিট পরে আবার দেখা দেবে — আজকেই একবার ঘুরিয়ে এলে মনে থাকবে বেশি।'
        : 'দারুণ! পরের রিভিউগুলো SM-2 নিজেই সময় করে দেবে — মিস করা দিনের জন্য কোনো পেনাল্টি নেই।';
    return (
      <div className="df-fade-up pt-6">
        <div className="rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-8">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Eye className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="mt-4 text-base font-semibold font-bangla">সেশন শেষ!</p>
          <div className="mx-auto mt-4 grid max-w-md grid-cols-2 gap-2 text-left sm:grid-cols-3">
            <SummaryCell label="রিভিউ হয়েছে" value={`${bnNum(reviewed)}টি শব্দ`} />
            <SummaryCell label="একবারে মনে রেখেছ" value={`${bnNum(correct)}টি`} />
            <SummaryCell label="সময় লেগেছে" value={formatDuration(duration)} />
            <SummaryCell label="আবার শিখব" value={`${bnNum(counts.again)}টি`} />
            <SummaryCell label="কঠিন" value={`${bnNum(counts.hard)}টি`} />
            <SummaryCell label="ভালো / সহজ" value={`${bnNum(counts.good + counts.easy)}টি`} />
          </div>
          <p className="mx-auto mt-4 max-w-sm text-xs leading-relaxed text-muted-foreground font-bangla">
            {advice} প্রতিটি রেটিং সঙ্গে সঙ্গেই সেভ হয়েছে — এখন বেরিয়ে গেলেও প্রগ্রেস থাকবে।
          </p>
          <Button onClick={onExit} variant="outline" className="mt-5 rounded-xl font-bangla">ফিরে যাও</Button>
        </div>
      </div>
    );
  }

  if (!current) return null;
  const progress = (index / total) * 100;

  return (
    <div className="pt-4">
      {/* ── Session top bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium tabular-nums text-muted-foreground font-bangla">
          {bnNum(index + 1)} / {bnNum(total)}
        </p>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" onClick={reshuffle} aria-label="বাকি কার্ড শাফল করো" className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground">
            <Shuffle className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setPaused(true)} aria-label="সেশন পজ করো" className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground">
            <Pause className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={requestExit}
            className="rounded-xl text-xs text-muted-foreground font-bangla hover:text-foreground"
          >
            সেশন ছাড়ো
          </Button>
        </div>
      </div>
      <div className="mt-2">
        <Progress value={progress} aria-label="Session progress" />
      </div>

      {/* ── The card ────────────────────────────────────────────────── */}
      <div className="relative mt-4">
        <motion.div
          drag={revealed ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.3}
          dragMomentum={false}
          onDragEnd={(_, info) => {
            if (info.offset.x < -70) rate('again');
            else if (info.offset.x > 70) rate('good');
          }}
        >
          <div
            role="button"
            tabIndex={0}
            onClick={() => setRevealed((r) => !r)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setRevealed((r) => !r);
              }
            }}
            aria-label={revealed ? 'উত্তর লুকাও' : 'উত্তর দেখাও'}
            className="df-flip-scene w-full cursor-pointer rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="df-flip-card h-[340px] w-full sm:h-[380px]" data-flipped={revealed}>
              {/* Front */}
              <div className="df-flip-face absolute inset-0 flex flex-col rounded-3xl border bg-card p-6 text-center shadow-sm">
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
                  <p className="font-german text-3xl font-semibold leading-snug sm:text-4xl" lang="de">
                    {current.article && <span className="mr-2 text-primary/70">{current.article}</span>}
                    {current.german}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      speakNow(current.german);
                    }}
                    aria-label={`Play ${current.german}`}
                    className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-full border bg-background/60 px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Play className="h-4 w-4" aria-hidden="true" /> শোনো
                  </button>
                </div>
                <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground font-bangla">
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" /> কার্ডে চাপ দিলে উত্তর দেখা যাবে
                </p>
              </div>

              {/* Back */}
              <div className="df-flip-face df-flip-face-back absolute inset-0 flex flex-col rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
                <div className="df-scroll min-h-0 flex-1 overflow-y-auto text-center">
                  <p className="font-german text-xl font-semibold" lang="de">
                    {current.article && <span className="mr-1.5 text-primary/70">{current.article}</span>}
                    {current.german}
                  </p>
                  {current.bengaliPronunciation && (
                    <p className="mt-1 text-base font-medium text-accent-foreground font-bangla" lang="bn">
                      {current.bengaliPronunciation}
                    </p>
                  )}
                  <p className="mt-2 text-2xl font-bold font-bangla" lang="bn">
                    {current.banglaMeaning ?? <span className="text-sm font-normal text-muted-foreground">অর্থ এখনো লেখা হয়নি</span>}
                  </p>
                  {current.englishMeaning && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{current.englishMeaning}</p>
                  )}
                  {(current.plural || current.cefrLevel) && (
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                      {current.plural && (
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px]" lang="de">Pl. {current.plural}</span>
                      )}
                      {current.cefrLevel && (
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold">{current.cefrLevel}</span>
                      )}
                    </div>
                  )}
                  {current.examples[0] && (
                    <div className="mt-3 rounded-xl bg-muted/60 px-3.5 py-2.5 text-left">
                      <p className="text-sm font-german" lang="de">{current.examples[0].german}</p>
                      {current.examples[0].bangla && (
                        <p className="mt-0.5 text-xs text-muted-foreground font-bangla" lang="bn">{current.examples[0].bangla}</p>
                      )}
                    </div>
                  )}
                  {current.notes && (
                    <p className="mt-2 rounded-xl bg-muted/60 px-3.5 py-2 text-left text-xs leading-relaxed font-bangla">
                      {current.notes}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Pause overlay */}
        {paused && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-3xl bg-background/80 backdrop-blur-sm">
            <p className="text-base font-semibold font-bangla">সেশন থামানো হয়েছে</p>
            <p className="mt-1 text-xs text-muted-foreground font-bangla">রেটিংগুলো সেভ হয়ে আছে</p>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => setPaused(false)} className="rounded-xl font-bangla">
                <Play className="h-4 w-4" aria-hidden="true" /> চালিয়ে যাও
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setPaused(false);
                  requestExit();
                }}
                className="rounded-xl font-bangla"
              >
                বেরিয়ে যাও
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Ratings / navigation ────────────────────────────────────── */}
      {revealed ? (
        <div className="df-fade-up mt-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RATING_META.map(({ rating, label, kbd, className }) => (
              <button
                key={rating}
                type="button"
                onClick={() => rate(rating)}
                className={`flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-semibold font-bangla transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
              >
                {label}
                <kbd className="hidden rounded bg-black/15 px-1.5 py-0.5 text-[10px] font-bold sm:inline">{kbd}</kbd>
              </button>
            ))}
          </div>
          <p className="mt-2 flex flex-wrap items-center justify-center gap-x-2 text-[11px] text-muted-foreground font-bangla">
            <span className="inline-flex items-center gap-1"><RotateCcw className="h-3 w-3" aria-hidden="true" /> বাঁয়ে টানো = আবার</span>
            <X className="h-3 w-3" aria-hidden="true" />
            <span>ডানে টানো = ভালো · তীর চিহ্নে আগে-পরে</span>
          </p>
        </div>
      ) : (
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="outline" onClick={prev} disabled={index === 0} className="h-11 rounded-xl font-bangla">
            ← আগের
          </Button>
          <p className="hidden text-xs text-muted-foreground font-bangla sm:block">
            Space = উত্তর দেখাও · ১–৪ = রেটিং
          </p>
          <Button onClick={() => setRevealed(true)} className="h-11 rounded-xl px-6 font-bangla">
            <Eye className="h-4 w-4" aria-hidden="true" /> উত্তর দেখাও
          </Button>
          <Button variant="outline" onClick={next} disabled={index >= total - 1} className="h-11 rounded-xl font-bangla">
            পরের →
          </Button>
        </div>
      )}

      {/* Exit confirm — progress is already saved */}
      <Dialog open={exitOpen} onOpenChange={setExitOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-bangla">সেশন ছেড়ে যাবে?</DialogTitle>
            <DialogDescription className="font-bangla">
              {bnNum(ratedIds.size)}টি কার্ডের রেটিং ইতিমধ্যেই সেভ হয়ে গেছে। বাকি কার্ডগুলো পরে আবার এখানে পাওয়া যাবে।
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExitOpen(false)} className="font-bangla">চালিয়ে যাও</Button>
            <Button onClick={onExit} className="font-bangla">বেরিয়ে যাও</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2.5">
      <p className="text-[11px] leading-tight text-muted-foreground font-bangla">{label}</p>
      <p className="mt-0.5 text-sm font-semibold font-bangla">{value}</p>
    </div>
  );
}
