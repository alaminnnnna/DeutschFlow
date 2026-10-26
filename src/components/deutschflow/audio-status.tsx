'use client';

/**
 * Compact audio-status indicator + accessible details panel.
 *
 * One honest glance answers "can German audio play right now?":
 *   green dot  — native de-DE voice ready
 *   amber dot  — only an alternative German accent (de-AT / de-CH / de)
 *   blue dot   — no native German voice, but a configured online provider exists
 *   red dot    — no usable German audio source on this device
 *   spinner    — voice list still loading / compatibility check running
 *
 * The panel explains the current audio source, offers the explicit online
 * fallback action, hosts the "Check Audio Compatibility" re-check and a
 * working Stop control, and shows troubleshooting when nothing can play.
 * Warnings are never repeated or intrusive — this panel is the single place
 * where the full picture lives.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CircleStop,
  Globe,
  Info,
  Loader2,
  RefreshCw,
  Volume2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  stopSpeech,
  useSpeechStore,
  useTtsStatus,
} from '@/lib/speech-client';
import { probeOnlineTts } from '@/lib/tts-provider';
import { useSettings, type AudioSourceChoice } from '@/lib/settings';

interface AudioStatusProps {
  /** Jump to the Settings section from inside the panel (optional). */
  onOpenSettings?: () => void;
}

const SOURCE_LABELS: Record<AudioSourceChoice, string> = {
  auto: 'স্বয়ংক্রিয় (ব্রাউজার → অনলাইন)',
  browser: 'ব্রাউজার ভয়েস',
  online: 'অনলাইন প্রোভাইডার',
};

export function AudioStatus({ onOpenSettings }: AudioStatusProps) {
  const status = useTtsStatus();
  const speaking = useSpeechStore((s) => s.speaking);
  const onlineLoading = useSpeechStore((s) => s.onlineLoading);
  const notice = useSpeechStore((s) => s.notice);
  const audioSource = useSettings((s) => s.audioSource);
  const voiceName = useSettings((s) => s.voiceName);

  const [open, setOpen] = useState(false);
  const [onlineState, setOnlineState] = useState<'unknown' | 'checking' | 'yes' | 'no'>('unknown');
  const [browserOffline, setBrowserOffline] = useState(false);

  const germanReady = status.support === 'ready' && status.german.length > 0;
  const deDE = status.german[0]?.accent === 'de-DE';
  const active = speaking || onlineLoading;

  // Lazily probe the online provider when the panel opens (never on page load).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    queueMicrotask(() => {
      if (!alive) return;
      setBrowserOffline(typeof navigator !== 'undefined' && !navigator.onLine);
      setOnlineState('checking');
    });
    void probeOnlineTts().then((r) => {
      if (!alive) return;
      setOnlineState(r.configured && r.online ? 'yes' : r.configured ? 'yes-offline' : 'no');
    });
    return () => {
      alive = false;
    };
  }, [open]);

  const recheck = useCallback(() => {
    setOnlineState('checking');
    ttsStatusRecheck();
    void probeOnlineTts({ force: true }).then((r) => {
      setOnlineState(r.configured && r.online ? 'yes' : r.configured ? 'yes-offline' : 'no');
    });
  }, []);

  const dot = (() => {
    if (status.support === 'checking') {
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />;
    }
    if (germanReady) {
      return (
        <span
          aria-hidden="true"
          className={`inline-block h-2.5 w-2.5 rounded-full ${deDE ? 'bg-emerald-500' : 'bg-amber-500'}`}
        />
      );
    }
    if (onlineState === 'yes') {
      return <Globe className="h-4 w-4 text-sky-500" aria-hidden="true" />;
    }
    return <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />;
  })();

  const statusText = (() => {
    if (status.support === 'unsupported') return 'এই ব্রাউজারে স্পিচ সাপোর্ট নেই';
    if (status.support === 'checking') return 'ভয়েস তালিকা লোড হচ্ছে…';
    if (germanReady) {
      const info = status.german[0];
      const name = voiceName && status.german.some((v) => v.voice.name === voiceName)
        ? voiceName
        : info.voice.name;
      return `জার্মান ভয়েস রেডি — ${name} (${info.accentLabel})`;
    }
    if (onlineState === 'yes') return 'নেটিভ জার্মান ভয়েস নেই — অনলাইন অডিও ব্যবহার করা যাবে';
    return 'এই ডিভাইসে ব্যবহারযোগ্য জার্মান ভয়েস নেই';
  })();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`অডিও স্ট্যাটাস: ${statusText}`}
          className="relative rounded-full text-muted-foreground hover:text-foreground"
        >
          {germanReady ? (
            <Volume2 className="h-[18px] w-[18px]" aria-hidden="true" />
          ) : (
            <Info className="h-[18px] w-[18px]" aria-hidden="true" />
          )}
          <span className="absolute right-1.5 top-1.5 flex items-center">{dot}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-2xl p-4">
        {/* Screen readers hear status changes without opening the panel. */}
        <p aria-live="polite" className="sr-only">
          {statusText}
        </p>

        <p className="flex items-start gap-2 text-sm font-semibold leading-snug">
          <span className="mt-0.5 shrink-0">{dot}</span>
          <span>{statusText}</span>
        </p>

        <dl className="mt-3 space-y-1.5 text-xs text-muted-foreground">
          <div className="flex justify-between gap-2">
            <dt className="font-bangla">অডিও সোর্স</dt>
            <dd className="font-bangla">{SOURCE_LABELS[audioSource]}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="font-bangla">অনলাইন প্রোভাইডার</dt>
            <dd className="font-bangla">
              {onlineState === 'checking'
                ? 'পরীক্ষা হচ্ছে…'
                : onlineState === 'yes'
                  ? 'কনফিগার করা আছে'
                  : onlineState === 'yes-offline'
                    ? 'কনফিগার করা আছে (অফলাইন)'
                    : 'কনফিগার করা হয়নি'}
            </dd>
          </div>
          {browserOffline && (
            <div className="flex justify-between gap-2">
              <dt className="font-bangla">সংযোগ</dt>
              <dd className="font-bangla text-destructive">অফলাইন</dd>
            </div>
          )}
        </dl>

        {active && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => stopSpeech()}
            className="mt-3 w-full rounded-xl font-bangla"
          >
            <CircleStop className="h-4 w-4" aria-hidden="true" /> অডিও বন্ধ করো
          </Button>
        )}

        {status.support === 'ready' && !germanReady && onlineState === 'yes' && (
          <Button
            size="sm"
            onClick={() => {
              useSettings.getState().setAudioSource('online');
              useSpeechStore
                .getState()
                .setNotice('অনলাইন অডিও সোর্স চালু হলো — এখন Play চাপো। (ইন্টারনেট লাগবে)');
            }}
            className="mt-3 w-full rounded-xl font-bangla"
          >
            <Globe className="h-4 w-4" aria-hidden="true" /> অনলাইন জার্মান অডিও ব্যবহার করো
          </Button>
        )}

        <Button
          size="sm"
          variant="outline"
          onClick={recheck}
          disabled={status.support === 'checking'}
          className="mt-2 w-full rounded-xl font-bangla"
        >
          <RefreshCw
            className={`h-4 w-4 ${status.support === 'checking' ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          অডিও সামঞ্জস্য পরীক্ষা করো
        </Button>

        {(status.support === 'unsupported' || (status.support === 'ready' && !germanReady)) && (
          <div className="mt-3 rounded-xl border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground font-bangla">
            <p className="font-semibold text-foreground">জার্মান ভয়েস না পেলে যা করবে:</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4">
              <li>Chrome বা Edge ব্রাউজারে খোলো — এগুলোতে German voice pack থাকে।</li>
              <li>OS সেটিংসে German (de-DE) text-to-speech voice ইনস্টল করো।</li>
              <li>ইনস্টল করার পর অ্যাপ রিলোড দিয়ে “সামঞ্জস্য পরীক্ষা” চাপো।</li>
              <li>ইনস্টল করা PWA-তেও ভয়েস আসে OS থেকে — ব্রাউজার আপডেট করে দেখো।</li>
            </ol>
            <p className="mt-1.5">
              এর মধ্যেও সেভ করা শব্দ, অর্থ আর বাংলা উচ্চারণ গাইড সবসময় অফলাইনেও কাজ করবে।
            </p>
          </div>
        )}

        {notice && (
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground font-bangla">
            {notice}
          </p>
        )}

        {onOpenSettings && (
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
            className="mt-1 h-7 px-0 text-xs font-bangla"
          >
            সেটিংসে ভয়েস ও অডিও সোর্স বদলাও →
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ttsStatusRecheck(): void {
  // Imported lazily to keep this module's import graph simple.
  void import('@/lib/tts-status').then((m) => m.ttsStatus.recheck());
}
