'use client';

import { Play, Sparkles } from 'lucide-react';

import { SaveWordButton } from './save-word-button';
import { Button } from '@/components/ui/button';
import { speakNow } from '@/lib/speech-client';
import { wordOfTheDay } from '@/lib/curated';

export const EXAMPLES = [
  'Guten Morgen',
  'Wie geht es dir?',
  'Ich lerne Deutsch.',
  'আমি জার্মান শিখছি',
  'Good morning, my friend',
] as const;

export function EmptyState({ onExample }: { onExample: (text: string) => void }) {
  const wotd = wordOfTheDay();

  return (
    <>
      <section
        aria-label="Examples"
        className="df-fade-up rounded-2xl border border-dashed bg-card/60 p-6 text-center sm:p-8"
        style={{ animationDelay: '120ms' }}
      >
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="mt-3 text-sm font-medium font-bangla">
          শুরু করো — নিচের যেকোনো একটিতে ট্যাপ করলেই জার্মান শুনতে পাবে
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => onExample(ex)}
              className="rounded-full border bg-background px-4 py-2 text-sm font-medium transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              lang="de"
            >
              {ex}
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground font-bangla">
          ইংরেজি বা বাংলা লিখলে আগে জার্মানে অনুবাদ হবে, তারপর অডিও + বাংলা উচ্চারণ দেখাবে।
          জার্মান লিখলে সরাসরি প্লে হবে — অনুবাদের অপেক্ষা নেই।
        </p>
      </section>

      {/* Word of the day teaser */}
      <section
        aria-label="Word of the day"
        className="df-fade-up flex items-center justify-between gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:p-5"
        style={{ animationDelay: '180ms' }}
      >
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-muted-foreground font-bangla">
            আজকের শব্দ · {wotd.topic}
          </p>
          <p className="mt-1 truncate font-german text-lg font-semibold" lang="de">
            {wotd.german}
          </p>
          <p className="truncate text-xs text-muted-foreground font-bangla" lang="bn">
            {wotd.bangla}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            onClick={() => speakNow(wotd.german)}
            aria-label={`Play ${wotd.german}`}
            className="h-9 w-9 rounded-full"
          >
            <Play className="h-4 w-4 translate-x-[1px]" aria-hidden="true" />
          </Button>
          <SaveWordButton german={wotd.german} bengaliPronunciation="" banglaMeaning={wotd.bangla} />
        </div>
      </section>
    </>
  );
}
