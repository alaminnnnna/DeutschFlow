'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Flame, Headphones, Play, Repeat } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SaveWordButton } from './save-word-button';
import { speakNow } from '@/lib/speech-client';
import {
  useVocab,
  summarize,
  addedPerDay,
  reviewHistoryOf,
  type VocabEntry,
} from '@/lib/vocabulary';
import { getStats, computeStreak, lastNDays, type StatsMap } from '@/lib/stats';
import { learningState, recallStats } from '@/lib/review';
import { bnNum, bnPct } from '@/lib/bn';
import { wordOfTheDay, TOPICS, curatedByTopic } from '@/lib/curated';

function StatCard({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  value: number | string;
  label: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground font-bangla">{label}</p>
    </div>
  );
}

export function ProgressView() {
  const { entries } = useVocab();
  const [stats, setStats] = useState<StatsMap | null>(null);
  const [topic, setTopic] = useState<string>(TOPICS[0]);
  const wotd = wordOfTheDay();

  useEffect(() => {
    let cancelled = false;
    void getStats().then((s) => {
      if (!cancelled) setStats(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const dueCount = entries.filter((e) => e.review.dueAt <= Date.now()).length;
  const week = stats ? lastNDays(stats, 7) : [];
  const todayReviews = week.length ? week[week.length - 1].stat.reviews : 0;
  const todayListens = week.length ? week[week.length - 1].stat.listens : 0;
  const streak = stats ? computeStreak(stats) : 0;
  const maxDay = Math.max(1, ...week.map((w) => w.stat.listens + w.stat.reviews));

  // ── Vocabulary analytics (all from stored entries — nothing invented) ──
  const summary = useMemo(() => summarize(entries), [entries]);
  const growth = useMemo(() => addedPerDay(entries, 14), [entries]);
  const growthMax = Math.max(1, ...growth.map((g) => g.count));

  const levelRows = useMemo(() => {
    const byLevel = new Map<string, number>();
    for (const e of entries) {
      const key = e.cefrLevel ?? 'unknown';
      byLevel.set(key, (byLevel.get(key) ?? 0) + 1);
    }
    const labels: Record<string, string> = { A1: 'A1', A2: 'A2', B1: 'B1', unknown: 'লেভেল জানা নেই' };
    return ['A1', 'A2', 'B1', 'unknown']
      .filter((k) => byLevel.has(k))
      .map((k) => ({ label: labels[k], count: byLevel.get(k) ?? 0 }));
  }, [entries]);

  const posRows = useMemo(() => {
    const byPos = new Map<string, number>();
    for (const e of entries) {
      if (!e.partOfSpeech) continue;
      byPos.set(e.partOfSpeech, (byPos.get(e.partOfSpeech) ?? 0) + 1);
    }
    const labels: Record<string, string> = {
      noun: 'বিশেষ্য',
      verb: 'ক্রিয়া',
      adjective: 'বিশেষণ',
      adverb: 'ক্রিয়া-বিশেষণ',
      phrase: 'বাক্যাংশ',
      question: 'প্রশ্নবোধক',
      number: 'সংখ্যা',
      other: 'অন্যান্য',
    };
    return [...byPos.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => ({ label: labels[k] ?? k, count: v }));
  }, [entries]);

  const difficultWords = useMemo(() => {
    return entries
      .filter((e) => learningState(e.review) !== 'new')
      .map((e) => ({ entry: e, stats: recallStats(reviewHistoryOf(e)) }))
      .filter((r) => r.entry.review.lapses >= 3 || (r.stats.attempts >= 3 && r.stats.rate !== null && r.stats.rate <= 0.5))
      .sort((a, b) => (a.stats.rate ?? 1) - (b.stats.rate ?? 1) || b.stats.attempts - a.stats.attempts)
      .slice(0, 5)
      .map((r) => r.entry);
  }, [entries]);

  const overallAccuracy =
    summary.attempts >= 5 ? summary.correct / Math.max(1, summary.attempts) : null;
  const masteryTotal = Math.max(1, summary.total);
  const levelMax = Math.max(1, ...levelRows.map((r) => r.count));
  const posMax = Math.max(1, ...posRows.map((r) => r.count));

  return (
    <div className="pt-6">
      <h1 className="text-2xl font-bold tracking-tight">Progress</h1>
      <p className="mt-0.5 text-sm text-muted-foreground font-bangla">
        সব সংখ্যা তোমার আসল ব্যবহার থেকে আসে — কোনো কৃত্রিম স্কোর নেই
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Flame} value={streak} label="দিনের ধারাবাহিকতা" />
        <StatCard icon={BookOpen} value={entries.length} label="সেভ করা শব্দ" />
        <StatCard icon={Repeat} value={dueCount} label="রিভিউ বাকি" />
        <StatCard icon={Headphones} value={todayListens + todayReviews} label="আজকের অ্যাক্টিভিটি" />
      </div>

      {/* ── Last 7 days ─────────────────────────────────────────── */}
      <section className="mt-5 rounded-2xl border bg-card p-5 shadow-sm" aria-label="Last 7 days activity">
        <h2 className="text-[13px] font-semibold text-muted-foreground font-bangla">
          শেষ ৭ দিন
        </h2>
        <div className="mt-4 flex h-28 items-end gap-2" role="img" aria-label="Bar chart of listens and reviews per day">
          {week.map((d) => {
            const total = d.stat.listens + d.stat.reviews;
            const listenH = (d.stat.listens / maxDay) * 100;
            const reviewH = (d.stat.reviews / maxDay) * 100;
            return (
              <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div className="flex h-20 w-full items-end justify-center gap-[3px]">
                  <div
                    className="w-2.5 rounded-t-md bg-primary/80 transition-all"
                    style={{ height: `${Math.max(listenH, total > 0 ? 8 : 2)}%` }}
                    title={`${d.stat.listens} listens`}
                  />
                  <div
                    className="w-2.5 rounded-t-md bg-chart-2/80 transition-all"
                    style={{ height: `${Math.max(reviewH, total > 0 ? 8 : 2)}%` }}
                    title={`${d.stat.reviews} reviews`}
                  />
                </div>
                <span className="text-[9px] tabular-nums text-muted-foreground">{d.label}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-4 text-[10px] text-muted-foreground font-bangla">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary/80" aria-hidden="true" /> শোনা
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-chart-2/80" aria-hidden="true" /> রিভিউ
          </span>
        </div>
      </section>

      {/* ── Vocabulary analytics ────────────────────────────────────── */}
      <section className="mt-5 rounded-2xl border bg-card p-5 shadow-sm" aria-label="Vocabulary analytics">
        <h2 className="text-[13px] font-semibold text-muted-foreground font-bangla">
          শব্দভান্ডারের বিশ্লেষণ
        </h2>

        {entries.length === 0 ? (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground font-bangla">
            এখনো কোনো শব্দ সেভ হয়নি — Listen ট্যাব থেকে শব্দ সেভ করতে শুরু করলে এখানে আসল
            অগ্রগতি দেখা যাবে।
          </p>
        ) : (
          <>
            {/* Mastered vs learning vs new */}
            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${summary.mastered} mastered, ${summary.learning} learning, ${summary.fresh} new`}>
              <div className="bg-primary" style={{ width: `${(summary.mastered / masteryTotal) * 100}%` }} />
              <div className="bg-chart-2/80" style={{ width: `${(summary.learning / masteryTotal) * 100}%` }} />
              <div className="bg-muted-foreground/30" style={{ width: `${(summary.fresh / masteryTotal) * 100}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground font-bangla">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-primary" aria-hidden="true" /> শেখা হয়েছে {bnNum(summary.mastered)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-chart-2/80" aria-hidden="true" /> শিখছি {bnNum(summary.learning)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/30" aria-hidden="true" /> নতুন {bnNum(summary.fresh)}
              </span>
            </div>

            {/* Honest overall accuracy — only with enough attempts */}
            <div className="mt-4 rounded-xl bg-muted/50 px-3.5 py-3">
              {overallAccuracy !== null ? (
                <p className="text-sm font-bangla">
                  সব রিভিউ মিলিয়ে সঠিক উত্তরের হার:{' '}
                  <span className="font-bold tabular-nums">{bnPct(overallAccuracy)}</span>{' '}
                  <span className="text-muted-foreground">
                    ({bnNum(summary.attempts)}টি রেটিংয়ের মধ্যে {bnNum(summary.correct)}টি সঠিক)
                  </span>
                </p>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground font-bangla">
                  সঠিক উত্তরের হার দেখাতে অন্তত ৫টা রেটিং দরকার — এখন {bnNum(summary.attempts)}টি।
                  রিভিউ সেশন চালিয়ে গেলে এখানে সত্যিকারের ছবিটা দাঁড়াবে।
                </p>
              )}
            </div>

            {/* By level + by part of speech */}
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground font-bangla">লেভেল অনুযায়ী</p>
                <ul className="mt-2 space-y-1.5">
                  {levelRows.map((row) => (
                    <li key={row.label} className="flex items-center gap-2 text-xs">
                      <span className="w-24 shrink-0 truncate text-muted-foreground font-bangla">{row.label}</span>
                      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-primary/70" style={{ width: `${(row.count / levelMax) * 100}%` }} />
                      </span>
                      <span className="w-8 shrink-0 text-right tabular-nums font-bangla">{bnNum(row.count)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground font-bangla">ধরন অনুযায়ী</p>
                {posRows.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground font-bangla">শব্দের ধরন এখনো চিহ্নিত হয়নি।</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {posRows.map((row) => (
                      <li key={row.label} className="flex items-center gap-2 text-xs">
                        <span className="w-24 shrink-0 truncate text-muted-foreground font-bangla">{row.label}</span>
                        <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full bg-chart-4/80" style={{ width: `${(row.count / posMax) * 100}%` }} />
                        </span>
                        <span className="w-8 shrink-0 text-right tabular-nums font-bangla">{bnNum(row.count)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* 14-day growth strip */}
            <div className="mt-4">
              <p className="text-[11px] font-medium text-muted-foreground font-bangla">নতুন শব্দ (শেষ ১৪ দিন)</p>
              <div className="mt-2 flex h-16 items-end gap-1" role="img" aria-label="New words added per day, last 14 days">
                {growth.map((g) => (
                  <div key={g.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full max-w-6 rounded-t-md bg-primary/60"
                      style={{ height: `${Math.max(g.count > 0 ? 18 : 4, (g.count / growthMax) * 44)}px` }}
                      title={`${g.key}: ${g.count}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Difficult words */}
            <div className="mt-4">
              <p className="text-[11px] font-medium text-muted-foreground font-bangla">সবচেয়ে কঠিন শব্দ</p>
              {difficultWords.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground font-bangla">
                  কোনো কঠিন শব্দ জমা হয়নি — অন্তত ৩ বার রিভিউয়ের পরে কঠিনগুলো এখানে চিনে নেওয়া যাবে।
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {difficultWords.map((w: VocabEntry) => {
                    const s = recallStats(reviewHistoryOf(w));
                    return (
                      <li key={w.id} className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2">
                        <p className="min-w-0 truncate text-sm font-medium" lang="de">
                          {w.article ? `${w.article} ` : ''}
                          {w.german}
                        </p>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive tabular-nums font-bangla">
                            {s.rate !== null ? bnPct(s.rate) : '—'}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => speakNow(w.german)}
                            aria-label={`Play ${w.german}`}
                            className="h-7 w-7 rounded-lg text-muted-foreground hover:text-primary"
                          >
                            <Play className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground/80 font-bangla">
              “শেখা হয়েছে” = টানা ৩ বার সঠিক মনে রাখা এবং রিভিউ ব্যবধান ৭ দিন পেরোনো। এই মান
              স্থির — শব্দ সেভ করলেই কেউ শেখা হয়ে যায় না।
            </p>
          </>
        )}
      </section>

      {/* ── Word of the day ─────────────────────────────────────── */}
      <section className="mt-5 rounded-2xl border bg-card p-5 shadow-sm" aria-label="Word of the day">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-muted-foreground font-bangla">
            আজকের শব্দ
          </h2>
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
            {wotd.level}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-german text-xl font-semibold" lang="de">
              {wotd.german}
            </p>
            <p className="text-sm text-muted-foreground font-bangla" lang="bn">
              {wotd.bangla}
            </p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button
              variant="outline"
              size="icon"
              onClick={() => speakNow(wotd.german)}
              aria-label={`Play ${wotd.german}`}
              className="rounded-xl"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
            </Button>
            <SaveWordButton
              german={wotd.german}
              bengaliPronunciation=""
              banglaMeaning={wotd.bangla}
            />
          </div>
        </div>
      </section>

      {/* ── Discovery topics ────────────────────────────────────── */}
      <section className="mt-5" aria-label="A1 vocabulary collections">
        <h2 className="text-[13px] font-semibold text-muted-foreground font-bangla">
          A1 সংগ্রহ — টপিক বেছে নাও
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {TOPICS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTopic(t)}
              aria-pressed={topic === t}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all font-bangla focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                topic === t
                  ? 'border-primary/40 bg-accent text-accent-foreground'
                  : 'bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {curatedByTopic(topic).map((w) => (
            <li
              key={w.german}
              className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3.5 py-2.5 shadow-sm"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" lang="de">
                  {w.article ? `${w.article} ` : ''}
                  {w.german}
                </p>
                <p className="truncate text-xs text-muted-foreground font-bangla" lang="bn">
                  {w.bangla}
                </p>
              </div>
              <div className="flex shrink-0 gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => speakNow(w.german)}
                  aria-label={`Play ${w.german}`}
                  className="h-7 w-7 rounded-lg text-muted-foreground hover:text-primary"
                >
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <SaveWordButton
                  compact
                  german={w.german}
                  bengaliPronunciation=""
                  banglaMeaning={w.bangla}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
