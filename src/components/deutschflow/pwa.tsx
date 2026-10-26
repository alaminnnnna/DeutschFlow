'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Share, WifiOff, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

/*
 * PWA glue, kept entirely on the client:
 *   - ServiceWorkerRegistrar: registers /sw.js, offers non-blocking updates
 *     (a running review session is never force-reloaded).
 *   - InstallPrompt: shows the native install dialog when the browser
 *     offers it, one-time Safari instructions on iPhone/iPad, and stays
 *     quiet after dismissal or successful installation.
 *   - OfflineIndicator: honest status line — saved data keeps working,
 *     new translations need the internet.
 */

const DISMISS_KEY = 'deutschflow.install.dismissed.v1';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function ServiceWorkerRegistrar() {
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const secure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
    if (!secure) return; // service workers need a secure context

    let wantReload = false;
    let offerShown = false;

    const onControllerChange = () => {
      if (wantReload) window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        const offerUpdate = () => {
          if (offerShown || !reg.waiting || !navigator.serviceWorker.controller) return;
          offerShown = true;
          toast({
            title: 'নতুন ভার্সন প্রস্তুত',
            description: 'রিলোড করলেই আপডেট হবে — এখন চলা রিভিউ সেশনে কোনো ব্যাঘাত হবে না।',
            action: (
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-lg font-bangla"
                onClick={() => {
                  wantReload = true;
                  reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
                }}
              >
                রিলোড
              </Button>
            ),
          });
        };
        if (reg.waiting) offerUpdate();
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) offerUpdate();
          });
        });
      })
      .catch(() => {
        /* offline install failure is non-fatal */
      });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, [toast]);

  return null;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari exposes navigator.standalone for home-screen web apps.
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function InstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true); // server-safe default; mounted check flips it
  const [installed, setInstalled] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      let dismissedFlag = false;
      try {
        dismissedFlag = window.localStorage.getItem(DISMISS_KEY) === '1';
      } catch {
        /* private mode */
      }
      if (isStandalone()) {
        setInstalled(true);
        return;
      }
      setDismissed(dismissedFlag);
      const ua = window.navigator.userAgent;
      const isIos = /iphone|ipad|ipod/i.test(ua);
      const isIosSafari = isIos && /safari/i.test(ua) && !/crios|fxios|edgi/i.test(ua);
      if (isIosSafari && !dismissedFlag) setIosHint(true);
    });

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setIosHint(false);
      setPromptEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      setIosHint(false);
      try {
        window.localStorage.removeItem(DISMISS_KEY);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    setIosHint(false);
    setPromptEvent(null);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    // Only the browser's appinstalled event (or display-mode) confirms a
    // real installation — we never fake success here.
    if (choice.outcome === 'dismissed') dismiss();
    setPromptEvent(null);
  }, [promptEvent, dismiss]);

  if (installed || dismissed) return null;

  if (promptEvent) {
    return (
      <div
        role="region"
        aria-label="Install app"
        className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-40 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-border/70 bg-card/95 p-3 shadow-lg backdrop-blur-xl lg:inset-x-auto lg:bottom-6 lg:right-6 lg:mx-0"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Download className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold font-bangla">DeutschFlow ইনস্টল করো</p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground font-bangla">
            হোম স্ক্রিন থেকে সরাসরি খুলবে — অফলাইনেও শব্দ ও রিভিউ চলবে।
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Button size="sm" onClick={() => void install()} className="h-8 rounded-lg px-3 font-bangla">
            ইনস্টল
          </Button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Don't show install prompt again"
            className="mx-auto text-[10px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            পরে
          </button>
        </div>
      </div>
    );
  }

  if (iosHint) {
    return (
      <div
        role="region"
        aria-label="iPhone-এ ইনস্টল করার নিয়ম"
        className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-40 mx-auto flex max-w-sm items-start gap-3 rounded-2xl border border-border/70 bg-card/95 p-3 shadow-lg backdrop-blur-xl"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Share className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold font-bangla">iPhone/iPad-এ ইনস্টল</p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground font-bangla">
            Safari-তে <Share className="inline h-3 w-3" aria-hidden="true" /> Share চেপে
            “Add to Home Screen” বেছে নাও — তাহলে অ্যাপের মতো খুলবে।
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close install hint"
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return null;
}

export function OfflineIndicator() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!offline) return null;
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center px-4 lg:top-[68px]">
      <p className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-border/70 bg-card/95 px-4 py-1.5 text-[11px] font-medium shadow-md backdrop-blur-xl font-bangla sm:text-xs">
        <WifiOff className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
        <span className="truncate">অফলাইন — সেভ করা শব্দ, রিভিউ ও সেটিংস চলবে; নতুন অনুবাদে ইন্টারনেট লাগবে</span>
      </p>
    </div>
  );
}
