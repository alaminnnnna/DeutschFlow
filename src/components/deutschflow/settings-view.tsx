'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { CheckCircle2, Database, Download, Droplets, Info, Monitor, Moon, RefreshCw, Sun, Trash2, Upload, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useSettings, type AudioSourceChoice, type RateChoice } from '@/lib/settings';
import { useVocab, exportPayload, parseImport } from '@/lib/vocabulary';
import { clearAllCaches } from '@/lib/cache';
import { RULES_VERSION } from '@/lib/pronunciation';
import { speakNow, getSpeech, useTtsStatus } from '@/lib/speech-client';
import type { GermanSpeech } from '@/lib/speech';
import { probeOnlineTts } from '@/lib/tts-provider';
import { idbAvailable } from '@/lib/storage/idb';

function download(filename: string, content: string, type: string) {
  try {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    /* ignore */
  }
}

/** Re-run the centralized TTS compatibility check ("Check Audio Compatibility"). */
function ttsRecheck(): void {
  void import('@/lib/tts-status').then((m) => m.ttsStatus.recheck());
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 rounded-2xl border bg-card p-5 shadow-sm" aria-label={title}>
      <h2 className="text-[13px] font-semibold text-muted-foreground font-bangla">
        {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function SettingsView() {
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const settings = useSettings();
  const { entries, replaceAll, clearAll } = useVocab();
  const tts = useTtsStatus();
  const [speech, setSpeech] = useState<GermanSpeech | null>(null);
  const [onlineState, setOnlineState] = useState<'unknown' | 'checking' | 'yes' | 'no'>('unknown');
  const [cacheCount, setCacheCount] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSpeech(getSpeech());
    setOnlineState('checking');
    void probeOnlineTts().then((r) =>
      setOnlineState(r.configured ? 'yes' : 'no')
    );
    void import('@/lib/cache').then((m) => m.cacheSize().then(setCacheCount));
  }, []);

  const voices = speech?.getGermanVoices() ?? [];

  return (
    <div className="pt-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <p className="mt-0.5 text-sm text-muted-foreground font-bangla">
        পছন্দগুলো ব্রাউজারেই সেভ থাকে — কোনো অ্যাকাউন্ট লাগে না
      </p>

      <Section title="থিম (Appearance)">
        <div role="radiogroup" aria-label="Theme" className="flex flex-wrap gap-2">
          {[
            { id: 'light', label: 'লাইট', icon: Sun },
            { id: 'dark', label: 'ডার্ক', icon: Moon },
            { id: 'blue', label: 'Blue', icon: Droplets },
            { id: 'system', label: 'সিস্টেম', icon: Monitor },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={theme === id}
              onClick={() => setTheme(id)}
              className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors font-bangla focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                theme === id ? 'border-primary/40 bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="স্পিচ ও অডিও (Voice & Audio)">
        {/* Compatibility snapshot — only real, detected facts */}
        <div className="rounded-xl border bg-muted/40 p-3 text-xs leading-relaxed">
          <p className="flex items-center gap-1.5 font-medium font-bangla">
            {tts.support === 'unsupported' ? (
              <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
            ) : (tts.support === 'ready' && tts.german.length > 0) ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            ) : (
              <Info className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            )}
            {tts.support === 'unsupported'
              ? 'এই ব্রাউজারে Web Speech API নেই'
              : tts.support === 'checking'
                ? 'ভয়েস তালিকা লোড হচ্ছে…'
                : tts.german.length > 0
                  ? `জার্মান ভয়েস পাওয়া গেছে (${tts.german.length}টি) — ${tts.german[0].accentLabel}`
                  : 'এই ডিভাইসে জার্মান ভয়েস নেই'}
          </p>
          <p className="mt-1 font-bangla text-muted-foreground">
            অনলাইন প্রোভাইডার:{' '}
            {onlineState === 'checking'
              ? 'পরীক্ষা হচ্ছে…'
              : onlineState === 'yes'
                ? 'কনফিগার করা আছে ✓ (ইন্টারনেট লাগে)'
                : 'কনফিগার করা হয়নি — কী ছাড়া অ্যাপ পুরোপুরি চলে'}
          </p>
        </div>

        {/* Audio source preference — only real choices */}
        <div>
          <Label htmlFor="audio-source" className="font-bangla">অডিও সোর্স</Label>
          <Select
            value={settings.audioSource}
            onValueChange={(v) => settings.setAudioSource(v as AudioSourceChoice)}
          >
            <SelectTrigger id="audio-source" aria-label="Preferred audio source" className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto" className="font-bangla">স্বয়ংক্রিয় — ব্রাউজার ভয়েস, না থাকলে অনলাইন</SelectItem>
              <SelectItem value="browser" className="font-bangla">শুধু ব্রাউজার ভয়েস (অফলাইনেও চলে)</SelectItem>
              <SelectItem value="online" disabled={onlineState === 'no'} className="font-bangla">
                শুধু অনলাইন জার্মান অডিও (ইন্টারনেট লাগে){onlineState === 'no' ? ' — কনফিগার করা নেই' : ''}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Automatic fallback to the online provider (opt-in, honest) */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label htmlFor="online-fallback" className="font-bangla">জার্মান ভয়েস না পেলে অনলাইন অডিও</Label>
            <p className="text-[11px] text-muted-foreground font-bangla">
              চালু থাকলে ব্রাউজারে জার্মান ভয়েস না থাকলে কনফিগার করা অনলাইন প্রোভাইডার চেষ্টা হবে — এর জন্য ইন্টারনেট লাগে
            </p>
          </div>
          <Switch
            id="online-fallback"
            checked={settings.onlineFallback}
            onCheckedChange={settings.setOnlineFallback}
          />
        </div>

        {/* Preferred German voice — auto or manual, only installed voices */}
        <div>
          <Label className="font-bangla">জার্মান ভয়েস (ব্রাউজার)</Label>
          {tts.support === 'unsupported' ? (
            <p className="mt-1.5 text-sm text-destructive font-bangla">
              এই ব্রাউজারে Web Speech API নেই — Chrome/Edge ব্যবহার করো।
            </p>
          ) : voices.length === 0 ? (
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground font-bangla">
              {tts.support === 'checking'
                ? 'ভয়েস তালিকা আসছে…'
                : 'এই ডিভাইসে জার্মান (de) ভয়েস পাওয়া যায়নি। OS-এ German voice pack ইনস্টল থাকলে এখানে দেখা যাবে। ইংরেজি ভয়েস দিয়ে জার্মান পড়া হয় না — ভুল উচ্চারণ শেখার ক্ষতি করে।'}
            </p>
          ) : (
            <Select value={settings.voiceName ?? 'auto'} onValueChange={(v) => settings.setVoiceName(v === 'auto' ? null : v)}>
              <SelectTrigger aria-label="Preferred German voice" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto" className="font-bangla">স্বয়ংক্রিয় (সেরা স্কোর)</SelectItem>
                {voices.map((v) => (
                  <SelectItem key={v.name} value={v.name}>
                    {v.name} · {v.lang}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {voices.length > 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground font-bangla">
              ভয়েসের অঞ্চল পাশে লেখা থাকে — de-DE স্ট্যান্ডার্ড জার্মান, de-AT অস্ট্রিয়ান, de-CH সুইস।
              আগের ডিভাইসের সেভ করা ভয়েস এই ডিভাইসে না থাকলে সেরা ভয়েস নিজেই বসে যাবে।
            </p>
          )}
        </div>

        <div>
          <Label className="font-bangla">ডিফল্ট স্পিড</Label>
          <div role="radiogroup" aria-label="Default playback speed" className="mt-1.5 flex gap-2">
            {([0.75, 1, 1.25] as RateChoice[]).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={settings.defaultRate === r}
                onClick={() => settings.setDefaultRate(r)}
                className={`h-9 rounded-xl border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  settings.defaultRate === r ? 'border-primary/40 bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {r}×
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <Label htmlFor="autoplay" className="font-bangla">অনুবাদ শেষ হলে স্বয়ংক্রিয় প্লে</Label>
            <p className="text-[11px] text-muted-foreground font-bangla">বন্ধ করলে Listen Now চাপলে শুধু অর্থ দেখাবে, অডিও চাপাতে হবে</p>
          </div>
          <Switch
            id="autoplay"
            checked={settings.autoplay}
            onCheckedChange={settings.setAutoplay}
          />
        </div>

        {/* Test + compatibility actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => speakNow('Guten Tag! Wie geht es dir?')}
            className="rounded-xl font-bangla"
          >
            জার্মান ভয়েস টেস্ট করো
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              ttsRecheck();
              toast({ title: 'অডিও সামঞ্জস্য আবার পরীক্ষা হচ্ছে…' });
            }}
            disabled={tts.support === 'checking'}
            className="rounded-xl font-bangla"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${tts.support === 'checking' ? 'animate-spin' : ''}`} aria-hidden="true" />
            অডিও সামঞ্জস্য পরীক্ষা
          </Button>
        </div>

        {/* Troubleshooting — shown only when there is genuinely no German voice */}
        {tts.support !== 'checking' && voices.length === 0 && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs leading-relaxed font-bangla">
            <p className="font-semibold text-foreground">জার্মান অডিও চালু করতে সমস্যা?</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-muted-foreground">
              <li>Chrome বা Edge ব্রাউজার ব্যবহার করো — German voice pack বিল্ট-ইন থাকে।</li>
              <li>OS সেটিংসে German (de-DE) text-to-speech voice ইনস্টল/সক্রিয় করো।</li>
              <li>ইনস্টল করার পর অ্যাপ রিলোড দিয়ে “অডিও সামঞ্জস্য পরীক্ষা” চাপো।</li>
              <li>ইনস্টল করা PWA-র ভয়েসও OS/ব্রাউজার থেকেই আসে — ব্রাউজার আপডেট করে দেখো।</li>
              <li>প্রোভাইডার কনফিগার করা থাকলে উপরের অনলাইন অডিও ফলব্যাক চালু করো (ইন্টারনেট লাগবে)।</li>
            </ol>
            <p className="mt-1.5 text-muted-foreground">
              এর মধ্যে উচ্চারণ গাইড (বাংলা লিপিতে), সেভ করা শব্দ আর অর্থ — সব অফলাইনেও চলবে।
            </p>
          </div>
        )}
      </Section>

      <Section title="লার্নিং (Review)">
        <div>
          <Label className="font-bangla">দৈনিক রিভিউ টার্গেট</Label>
          <Select value={String(settings.dailyReviewTarget)} onValueChange={(v) => settings.setDailyReviewTarget(Number(v))}>
            <SelectTrigger aria-label="Daily review target" className="mt-1.5 w-40 font-bangla">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 15, 20, 30].map((n) => (
                <SelectItem key={n} value={String(n)} className="font-bangla">{n}টি শব্দ</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="font-bangla">ইতিহাস সংরক্ষণ</Label>
          <Select value={String(settings.historyLimit)} onValueChange={(v) => settings.setHistoryLimit(Number(v))}>
            <SelectTrigger aria-label="History retention" className="mt-1.5 w-40 font-bangla">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[30, 100, 200].map((n) => (
                <SelectItem key={n} value={String(n)} className="font-bangla">শেষ {n}টি বাক্য</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Section>

      <Section title="ডেটা (Data)">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl font-bangla"
            onClick={() => {
              download('deutschflow-vocabulary.json', JSON.stringify(exportPayload(entries), null, 2), 'application/json');
              toast({ title: 'এক্সপোর্ট হয়েছে', description: 'JSON ফাইল ডাউনলোড ফোল্ডারে আছে।' });
            }}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            শব্দ এক্সপোর্ট ({entries.length})
          </Button>
          <Button variant="outline" size="sm" className="rounded-xl font-bangla" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            ইমপোর্ট
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const { entries: imported, skipped } = parseImport(await f.text());
                if (imported.length === 0) {
                  toast({ title: 'ইমপোর্ট ব্যর্থ', description: 'বৈধ এন্ট্রি পাওয়া যায়নি।', variant: 'destructive' });
                  return;
                }
                await replaceAll(imported);
                toast({ title: 'ইমপোর্ট সম্পন্ন', description: `${imported.length}টি এন্ট্রি যোগ হয়েছে।` });
              } catch {
                toast({ title: 'ইমপোর্ট ব্যর্থ', variant: 'destructive' });
              }
            }}
          />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed p-3">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-medium font-bangla">
              <Database className="h-3.5 w-3.5" aria-hidden="true" />
              ক্যাশ {cacheCount !== null ? `(${cacheCount} এন্ট্রি)` : ''}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground font-bangla">
              অনুবাদ ও উচ্চারণ ফলাফল ক্যাশে থাকে — মুছলে পরেরবার নেটওয়ার্ক লাগবে
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl font-bangla"
            onClick={async () => {
              const n = await clearAllCaches();
              setCacheCount(0);
              toast({ title: 'ক্যাশ মুছে ফেলা হয়েছে', description: `${n}টি এন্ট্রি সরানো হয়েছে।` });
            }}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            ক্যাশ মুছো
          </Button>
        </div>

        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive font-bangla">অ্যাপ রিসেট</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-destructive/80 font-bangla">
            সব শব্দ, ইতিহাস, সেটিংস ও ক্যাশ মুছে যাবে — ফেরানো যাবে না। আগে এক্সপোর্ট করে রাখো।
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <Switch id="reset-confirm" checked={confirmReset} onCheckedChange={setConfirmReset} aria-label="Confirm reset" />
            <Label htmlFor="reset-confirm" className="text-xs text-destructive font-bangla">
              হ্যাঁ, সব মুছে রিসেট করো
            </Label>
          </div>
          <Button
            variant="destructive"
            size="sm"
            disabled={!confirmReset}
            className="mt-2.5 rounded-xl font-bangla"
            onClick={async () => {
              await clearAll();
              await clearAllCaches();
              try {
                window.localStorage.clear();
              } catch {
                /* ignore */
              }
              window.location.reload();
            }}
          >
            রিসেট করো
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground font-bangla">
          স্টোরেজ: {idbAvailable() ? 'IndexedDB + localStorage (পার্মানেন্ট)' : 'ইন-মেমরি (এই ব্রাউজারে IndexedDB নেই — রিলোডে ডেটা যাবে)'}
        </p>
      </Section>

      <Section title="সম্পর্কে (About)">
        <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground font-bangla">
          <li className="flex items-start gap-1.5">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            উচ্চারণ ইঞ্জিন: local-rules v{RULES_VERSION} — lexicon + German phonology rules + তোমার ব্যক্তিগত সংশোধন
          </li>
          <li>বাংলা উচ্চারণ একটা আনুমানিক সহায়ক — সঠিক ধ্বনির জন্য সবসময় অডিও শোনো।</li>
          <li>অনুবাদের জন্য টেক্সট সার্ভারে যায় (LLM/অনুবাদ প্রোভাইডার) — শব্দভান্ডার ও ইতিহাস কখনো ডিভাইসের বাইরে যায় না।</li>
          <li>ব্রাউজার TTS ডিভাইসভেদে ভিন্ন শোনায় — এটা Web Speech API-র প্রকৃতি।</li>
        </ul>
      </Section>
    </div>
  );
}
