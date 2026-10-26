'use client';

import { Settings2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { GermanSpeech } from '@/lib/speech';

interface VoiceSettingsProps {
  speech: GermanSpeech | null;
  selectedVoice: string | null;
  onSelectVoice: (name: string | null) => void;
}

export function VoiceSettings({ speech, selectedVoice, onSelectVoice }: VoiceSettingsProps) {
  const voices = speech?.getGermanVoices() ?? [];
  const supported = speech?.supported ?? false;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="German voice settings"
          className="rounded-full text-muted-foreground hover:text-foreground"
        >
          <Settings2 className="h-[18px] w-[18px]" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 rounded-xl p-3">
        <p className="text-xs font-semibold text-muted-foreground">
          German voice
        </p>
        {!supported ? (
          <p className="mt-2 text-sm text-destructive font-bangla">
            এই ব্রাউজারে স্পিচ সাপোর্ট নেই — Chrome বা Edge ব্যবহার করো।
          </p>
        ) : voices.length === 0 ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground font-bangla">
            এই ডিভাইসে জার্মান ভয়েস পাওয়া যায়নি। Chrome/Edge ব্যবহার করলে বা OS-এ
            German (de-DE) voice pack ইনস্টল করলে আরও প্রাকৃতিক শোনাবে।
          </p>
        ) : (
          <div className="df-scroll mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
            {voices.map((v) => (
              <button
                key={v.name}
                type="button"
                onClick={() => onSelectVoice(v.name)}
                aria-pressed={selectedVoice === v.name}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  selectedVoice === v.name
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'hover:bg-muted'
                }`}
              >
                <span className="block truncate">{v.name}</span>
                <span className="block text-xs text-muted-foreground">{v.lang}</span>
              </button>
            ))}
          </div>
        )}
        <p className="mt-3 border-t pt-2 text-[11px] leading-relaxed text-muted-foreground font-bangla">
          ভয়েসের গুণমান ডিভাইসভেদে ভিন্ন হয় — এটা ব্রাউজারের বিল্ট-ইন ইঞ্জিনের ওপর নির্ভরশীল।
        </p>
      </PopoverContent>
    </Popover>
  );
}
