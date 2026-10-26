'use client';

import { useState } from 'react';
import { Flag, Volume2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SaveWordButton } from './save-word-button';
import { useToast } from '@/hooks/use-toast';
import { setOverride } from '@/lib/overrides';
import { glossFor, type WordGlossMap } from '@/lib/glossary';
import type { PronunciationWord } from '@/lib/types';

interface WordChipProps {
  word: PronunciationWord;
  glosses: WordGlossMap;
  onPlay: (text: string) => void;
}

/**
 * Interactive word chip: tap → hear the word alone; the chip shows the
 * Bengali approximation plus its meaning when available; one click saves it;
 * the flag opens the pronunciation-correction dialog.
 */
export function WordChip({ word, glosses, onPlay }: WordChipProps) {
  const { toast } = useToast();
  const meaning = glossFor(glosses, word.german);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [draft, setDraft] = useState(word.bengali);

  const sourceBadge =
    word.source === 'lexicon'
      ? 'lexicon'
      : word.source === 'override'
        ? 'তোমার সংশোধন'
        : 'rules';

  return (
    <li
      className={`rounded-xl border bg-background px-3 py-2 transition-colors ${
        word.source === 'override' ? 'border-primary/50' : ''
      }`}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPlay(word.german)}
          aria-label={`Play word: ${word.german}`}
          className="group flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
        >
          <Volume2
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary"
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="block truncate text-[11px] text-muted-foreground" lang="de">
              {word.german}
            </span>
            <span className="block truncate text-sm font-semibold text-primary font-bangla" lang="bn">
              {word.bengali}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 flex-col">
          <SaveWordButton
            compact
            german={word.german}
            bengaliPronunciation={word.bengali}
            banglaMeaning={meaning}
            sourceSentence={null}
          />
          <button
            type="button"
            aria-label={`Suggest correct Bengali pronunciation for ${word.german}`}
            onClick={() => {
              setDraft(word.bengali);
              setOverrideOpen(true);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Flag className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </div>
      {meaning && (
        <p className="mt-1 border-t border-border/50 pt-1 text-[11px] leading-snug text-muted-foreground font-bangla" lang="bn">
          {meaning}
        </p>
      )}
      <p className="mt-0.5 text-[10px] font-medium text-muted-foreground/60">
        {sourceBadge}
      </p>

      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-bangla">উচ্চারণ সংশোধন</DialogTitle>
            <DialogDescription className="text-left font-bangla">
              “{word.german}”-এর বাংলা উচ্চারণ ভুল লাগছে? সঠিক বানান লিখে দাও — সেভ করলে
              এই অ্যাপে সেটাই দেখাবে (শুধু তোমার ডিভাইসে প্রযোজ্য)।
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="rounded-lg bg-muted px-3 py-2 text-sm" lang="de">
              {word.german}
            </p>
            <label htmlFor="override-input" className="text-xs font-medium font-bangla">
              সঠিক বাংলা উচ্চারণ
            </label>
            <input
              id="override-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              lang="bn"
              className="w-full rounded-xl border bg-background px-3 py-2 text-base font-bangla outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="যেমন: ইয়া"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="font-bangla"
              onClick={() => setOverrideOpen(false)}
            >
              বাতিল
            </Button>
            <Button
              type="button"
              size="sm"
              className="font-bangla"
              disabled={!draft.trim()}
              onClick={() => {
                setOverride(word.german, draft.trim());
                setOverrideOpen(false);
                toast({
                  title: 'সংশোধন সেভ হয়েছে',
                  description: `“${word.german}” → “${draft.trim()}” — এখন থেকে এটাই দেখাবে।`,
                });
              }}
            >
              সেভ করো
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
