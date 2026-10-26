'use client';

import { useCallback, useEffect, useState } from 'react';
import { Globe, Loader2, Volume2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { LANG_HINTS, LANG_LABELS, detectLanguage } from '@/lib/language';
import type { InputLang } from '@/lib/types';

interface InputCardProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
}

export function InputCard({ value, onChange, onSubmit, busy }: InputCardProps) {
  const [lang, setLang] = useState<InputLang>('en');

  useEffect(() => {
    setLang(detectLanguage(value));
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [onSubmit]
  );

  const empty = value.trim().length === 0;

  return (
    <section aria-label="Input" className="df-fade-up" style={{ animationDelay: '60ms' }}>
      <div className="rounded-2xl border bg-card p-4 shadow-sm transition-shadow focus-within:border-ring/60 focus-within:shadow-md sm:p-5">
        <label htmlFor="df-input" className="sr-only">
          Type English, Bangla or German text
        </label>
        <textarea
          id="df-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type English, বাংলা, or Deutsch…"
          rows={2}
          maxLength={1000}
          spellCheck={false}
          className="w-full resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-foreground/70 sm:text-lg"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span
            aria-live="polite"
            className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground font-bangla"
          >
            <Globe className="h-3 w-3" aria-hidden="true" />
            {value.trim() ? LANG_HINTS[lang] : `${LANG_LABELS[lang]} · auto-detect`}
          </span>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={busy || empty}
            className="h-11 rounded-xl px-5 text-[15px] font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:translate-y-0 disabled:opacity-60"
            aria-label="Listen Now — translate and play German audio"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span className="font-bangla">অনুবাদ হচ্ছে…</span>
              </>
            ) : (
              <>
                <Volume2 className="h-4 w-4" aria-hidden="true" />
                Listen Now
              </>
            )}
          </Button>
        </div>
      </div>
      <p className="mt-2 px-1 text-[11px] text-muted-foreground font-bangla">
        Enter → শুনো · Shift+Enter → নতুন লাইন · জার্মান হলে সরাসরি প্লে হবে, অনুবাদ লাগবে না
      </p>
    </section>
  );
}
