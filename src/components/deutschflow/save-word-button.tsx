'use client';

import { useState } from 'react';
import { Check, BookmarkPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useVocab } from '@/lib/vocabulary';

interface SaveWordButtonProps {
  german: string;
  bengaliPronunciation: string;
  banglaMeaning?: string | null;
  sourceSentence?: string | null;
  compact?: boolean;
  label?: string;
}

/**
 * One-click vocabulary save with honest duplicate handling: an existing word
 * is merged (fills missing fields, appends a new example) — never duplicated.
 */
export function SaveWordButton({
  german,
  bengaliPronunciation,
  banglaMeaning,
  sourceSentence,
  compact = false,
  label = 'সেভ',
}: SaveWordButtonProps) {
  const { toast } = useToast();
  const saveWord = useVocab((s) => s.saveWord);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    if (busy || saved) return;
    setBusy(true);
    try {
      const status = await saveWord({
        german,
        bengaliPronunciation,
        banglaMeaning: banglaMeaning ?? null,
        sourceSentence: sourceSentence ?? null,
      });
      setSaved(true);
      toast({
        title: status === 'merged' ? 'শব্দটা আগেই সেভ করা ছিল' : 'শব্দ সেভ হয়েছে',
        description:
          status === 'merged'
            ? `“${german}” আপডেট হয়েছে — নতুন উদাহরণ যোগ করা হয়েছে (ডুপ্লিকেট তৈরি হয়নি)।`
            : `“${german}” এখন Vocabulary-তে আছে। Review ট্যাব থেকে রিভিশন দিতে পারবে।`,
      });
      window.setTimeout(() => setSaved(false), 2000);
    } catch {
      toast({
        title: 'সেভ করা যায়নি',
        description: 'স্টোরেজ সাময়িকভাবে ব্লকড — আবার চেষ্টা করো।',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  if (compact) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleSave}
        disabled={busy}
        aria-label={`Save “${german}” to vocabulary`}
        className="h-7 w-7 shrink-0 rounded-lg text-muted-foreground hover:text-primary"
      >
        {saved ? (
          <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        ) : (
          <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleSave}
      disabled={busy || saved}
      aria-label={`Save “${german}” to vocabulary`}
      className="h-10 rounded-xl px-3.5 text-sm font-bangla"
    >
      {saved ? (
        <>
          <Check className="h-4 w-4 text-primary" aria-hidden="true" />
          সেভ হয়েছে
        </>
      ) : (
        <>
          <BookmarkPlus className="h-4 w-4" aria-hidden="true" />
          {label}
        </>
      )}
    </Button>
  );
}
