'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { speakNow } from '@/lib/speech-client';

/**
 * Optional speaking practice using the browser SpeechRecognition API.
 *
 * Honest by design: recognition only tells us WHICH WORDS it heard — it
 * cannot measure accent quality or pronunciation accuracy. The UI therefore
 * shows a per-word match/mismatch comparison and says exactly that, with no
 * invented phonetic scores.
 */

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function normalizeWord(w: string): string {
  return w
    .toLowerCase()
    .replace(/[.,;:!?"'’\-–—]/g, '')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .trim();
}

interface WordMatch {
  german: string;
  heard: string | null;
  matched: boolean;
}

function compareWords(german: string, transcript: string): WordMatch[] {
  const targets = german.split(/\s+/).filter(Boolean);
  const heard = transcript
    .split(/\s+/)
    .map(normalizeWord)
    .filter(Boolean);
  const pool = [...heard];
  return targets.map((t) => {
    const n = normalizeWord(t);
    const idx = pool.indexOf(n);
    if (idx >= 0) {
      pool.splice(idx, 1);
      return { german: t, heard: n, matched: true };
    }
    return { german: t, heard: null, matched: false };
  });
}

interface SpeakingPracticeProps {
  german: string;
}

export function SpeakingPractice({ german }: SpeakingPracticeProps) {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<WordMatch[] | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    // Feature detection deferred to a microtask so the first render stays pure.
    queueMicrotask(() => setSupported(getRecognitionCtor() !== null));
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || listening) return;
    setError(null);
    setMatches(null);

    let rec: SpeechRecognitionLike;
    try {
      rec = new Ctor();
    } catch {
      setSupported(false);
      return;
    }
    rec.lang = 'de-DE';
    rec.continuous = false;
    rec.interimResults = false;

    rec.onresult = (ev) => {
      const transcript = Array.from({ length: ev.results.length })
        .map((_, i) => ev.results[i][0]?.transcript ?? '')
        .join(' ');
      setMatches(compareWords(german, transcript));
    };
    rec.onerror = (ev) => {
      const err = ev.error ?? '';
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        setError('মাইক্রোফোনের অনুমতি দাও — ব্রাউজার সেটিংস থেকে allow করো।');
      } else if (err === 'no-speech') {
        setError('কোনো কথা শোনা যায়নি — আবার চেষ্টা করো।');
      } else {
        setError('স্পিচ রিকগনিশন কাজ করছে না — আবার চেষ্টা করো।');
      }
    };
    rec.onend = () => setListening(false);

    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
      setError('রিকগনিশন শুরু করা যায়নি।');
    }
  }, [german, listening]);

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  if (!supported) return null; // Feature stays optional; the rest of the app works.

  return (
    <section
      aria-label="Speaking practice"
      className="mt-4 rounded-xl border border-dashed bg-muted/30 p-3.5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold font-bangla">বলার প্র্যাকটিস (ঐচ্ছিক)</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground font-bangla">
            জার্মান বাক্যটা শুনে জোরে বলো — ব্রাউজার শুনে কোন শব্দ মিলেছে দেখাবে।
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => speakNow(german)}
            aria-label="Play target sentence again"
            className="h-9 w-9 rounded-full"
          >
            <span className="text-xs font-bold" aria-hidden="true">
              DE
            </span>
          </Button>
          <Button
            type="button"
            size="icon"
            onClick={listening ? stop : start}
            aria-label={listening ? 'Stop recording' : 'Record your attempt'}
            className={`h-9 w-9 rounded-full ${listening ? 'animate-pulse bg-destructive hover:bg-destructive' : ''}`}
          >
            {listening ? (
              <Square className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Mic className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[11px] leading-relaxed text-destructive font-bangla">
          {error}
        </p>
      )}

      {matches && (
        <div className="df-fade-up mt-3">
          <ul className="flex flex-wrap gap-1.5" aria-label="Word comparison">
            {matches.map((m, i) => (
              <li
                key={`${m.german}-${i}`}
                className={`rounded-lg border px-2 py-1 text-xs font-medium ${
                  m.matched
                    ? 'border-primary/40 bg-accent text-accent-foreground'
                    : 'border-destructive/30 bg-destructive/5 text-destructive line-through decoration-1'
                }`}
                lang="de"
              >
                {m.german}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground font-bangla">
            সবুজ = রিকগনিশন সেই শব্দটা শুনেছে। এটা উচ্চারণের মান মাপে না — অ্যাকসেন্ট
            যাচাইয়ের জন্য অডিওর সাথে মিলিয়ে নিজেই শোনো।
          </p>
        </div>
      )}
    </section>
  );
}
