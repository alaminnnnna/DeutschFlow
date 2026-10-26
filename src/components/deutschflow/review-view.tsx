'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Repeat, Shuffle, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { FlashcardSession } from './flashcard-session';
import { useVocab, type FlashcardScope } from '@/lib/vocabulary';
import { isDifficult, learningState } from '@/lib/review';
import { useSettings } from '@/lib/settings';
import { bnNum } from '@/lib/bn';

const DAY = 86_400_000;

/**
 * Review launcher: starts flashcard sessions from the due queue or from a
 * chosen collection (all / favorites / difficult / recent / level). The
 * session itself lives in FlashcardSession; ratings persist incrementally
 * through the shared reviewWord store action.
 */
export function ReviewView({
  launchScope,
  onLaunchConsumed,
}: {
  launchScope: FlashcardScope | null;
  onLaunchConsumed: () => void;
}) {
  const { entries, loaded } = useVocab();
  const dailyTarget = useSettings((s) => s.dailyReviewTarget);
  const [active, setActive] = useState<FlashcardScope | null>(null);
  const [shuffle, setShuffle] = useState(false);

  // A launch from another section (e.g. "এই শব্দ রিভিউ করো" in word details).
  useEffect(() => {
    if (launchScope && loaded) {
      setActive(launchScope);
      onLaunchConsumed();
    }
  }, [launchScope, loaded, onLaunchConsumed]);

  const counts = useMemo(() => {
    const now = Date.now();
    const levels = new Map<string, number>();
    let due = 0;
    let favorites = 0;
    let difficult = 0;
    let recent = 0;
    let mastered = 0;
    for (const e of entries) {
      if (e.review.dueAt <= now) due += 1;
      if (e.favorite) favorites += 1;
      if (isDifficult(e.review, e.reviewHistory)) difficult += 1;
      if (now - e.createdAt <= 7 * DAY) recent += 1;
      if (learningState(e.review) === 'mastered') mastered += 1;
      if (e.cefrLevel) levels.set(e.cefrLevel, (levels.get(e.cefrLevel) ?? 0) + 1);
    }
    return { due, favorites, difficult, recent, mastered, levels };
  }, [entries]);

  if (active) {
    return (
      <FlashcardSession
        key={`${active.kind}-${'id' in active ? active.id : 'level' in active ? active.level : 'x'}`}
        scope={active}
        shuffle={shuffle}
        onExit={() => setActive(null)}
      />
    );
  }

  const nextDue = entries
    .filter((e) => e.review.dueAt > Date.now())
    .sort((a, b) => a.review.dueAt - b.review.dueAt)[0];

  const start = (scope: FlashcardScope) => setActive(scope);

  const collectionChips: Array<{ label: string; count: number; scope: FlashcardScope }> = [
    { label: 'সব শব্দ', count: entries.length, scope: { kind: 'all' } },
    { label: 'প্রিয়', count: counts.favorites, scope: { kind: 'favorites' } },
    { label: 'কঠিন শব্দ', count: counts.difficult, scope: { kind: 'difficult' } },
    { label: 'সাম্প্রতিক', count: counts.recent, scope: { kind: 'recent' } },
  ];

  return (
    <div className="pt-6">
      <h1 className="text-2xl font-bold tracking-tight">Review</h1>
      <p className="mt-0.5 text-sm text-muted-foreground font-bangla">
        SM-2 স্পেসড রিপিটিশন — মনে রাখার সেরা পদ্ধতি
      </p>

      {/* ── Due queue ─────────────────────────────────────────────────── */}
      <div className="df-fade-up mt-5 rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-8">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Repeat className="h-6 w-6" aria-hidden="true" />
        </span>
        {!loaded ? (
          <p className="mt-4 text-sm text-muted-foreground font-bangla">লোড হচ্ছে…</p>
        ) : counts.due === 0 ? (
          <>
            <p className="mt-4 text-base font-semibold font-bangla">আজ রিভিউর কিছু বাকি নেই</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground font-bangla">
              {entries.length === 0
                ? 'প্রথমে কিছু শব্দ সেভ করো — Listen ট্যাবে শুনে + চেপে শব্দ জমা করো, তারপর এখানে রিভিশন দিবে।'
                : nextDue
                  ? 'নিচের যেকোনো সংগ্রহ দিয়ে এখনই প্র্যাকটিস করতে পারো, অথবা পরের রিভিউ পর্যন্ত অপেক্ষা করো।'
                  : 'নিচের যেকোনো সংগ্রহ দিয়ে এখনই প্র্যাকটিস করতে পারো।'}
            </p>
          </>
        ) : (
          <>
            <p className="mt-4 text-3xl font-bold tabular-nums text-primary font-bangla">
              {bnNum(Math.min(counts.due, dailyTarget))}
            </p>
            <p className="mt-1 text-base font-semibold font-bangla">আজকের রিভিউ বাকি</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground font-bangla">
              {counts.due > dailyTarget
                ? `মোট ${bnNum(counts.due)}টি due — আজকের টার্গেট ${bnNum(dailyTarget)}টি (সেটিংস থেকে বদলানো যায়)।`
                : 'জার্মান দেখে মনে মনে অর্থ বলো, তারপর উত্তর দেখে নিজেকে রেট দাও।'}
            </p>
            <Button onClick={() => start({ kind: 'due' })} className="mt-5 h-11 rounded-xl px-6 font-bangla">
              রিভিউ শুরু করো
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </>
        )}
      </div>

      {/* ── Collections ───────────────────────────────────────────────── */}
      <section className="mt-6" aria-label="Practice collections">
        <h2 className="text-[13px] font-semibold text-muted-foreground font-bangla">
          নিজের পছন্দে প্র্যাকটিস
        </h2>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {collectionChips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => start(chip.scope)}
              disabled={chip.count === 0}
              className="rounded-2xl border bg-card px-4 py-3.5 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
            >
              <p className="text-lg font-bold tabular-nums">{bnNum(chip.count)}</p>
              <p className="mt-0.5 text-xs font-medium text-muted-foreground font-bangla">{chip.label}</p>
            </button>
          ))}
        </div>
        {counts.levels.size > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {[...counts.levels.entries()]
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([level, n]) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => start({ kind: 'level', level: level as 'A1' | 'A2' | 'B1' })}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3.5 py-1.5 text-xs font-medium shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {level}
                  <span className="tabular-nums text-muted-foreground">{bnNum(n)}</span>
                </button>
              ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between rounded-2xl border bg-card px-4 py-3">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-medium font-bangla">
              <Shuffle className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> কার্ড শাফল
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground font-bangla">
              সংগ্রহ থেকে শুরু করলে কার্ডের ক্রম এলোমেলো হবে (due কাতার সবসময় সময় অনুসারে)
            </p>
          </div>
          <Switch id="shuffle-toggle" checked={shuffle} onCheckedChange={setShuffle} aria-label="Shuffle cards" />
        </div>
      </section>

      {/* ── Honest grading note ───────────────────────────────────────── */}
      <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground font-bangla">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        কার্ড খোলা বা শোনা কোনোটাই রিভিউ গোনা হয় না — “আবার শিখব / কঠিন / ভালো / সহজ” রেটিং দিলেই তবেই
        ইতিহাসে যুক্ত হয় এবং SM-2 পরের সময় ঠিক করে।
      </p>
    </div>
  );
}
