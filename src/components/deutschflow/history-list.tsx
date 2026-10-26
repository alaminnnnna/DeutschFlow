'use client';

import { useState } from 'react';
import { Play, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { HistoryItem } from '@/lib/types';

interface HistoryListProps {
  items: HistoryItem[];
  onPlay: (item: HistoryItem) => void;
  onClear: () => void;
}

/** Recent listens list (Listen view). Full history lives in the History view. */
export function HistoryList({ items, onPlay, onClear }: HistoryListProps) {
  const [confirming, setConfirming] = useState(false);

  if (items.length === 0) return null;

  const handleClear = () => {
    if (!confirming) {
      setConfirming(true);
      window.setTimeout(() => setConfirming(false), 3500);
      return;
    }
    setConfirming(false);
    onClear();
  };

  return (
    <section aria-label="Listening history" className="df-fade-up">
      <div className="flex items-center justify-end px-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          aria-label={confirming ? 'Confirm clear history' : 'Clear recent history'}
          className={`h-8 rounded-lg px-2.5 text-xs font-medium font-bangla ${
            confirming ? 'text-destructive hover:text-destructive' : 'text-muted-foreground'
          }`}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          {confirming ? 'সব মুছে ফেলো — নিশ্চিত?' : 'তালিকা মুছো'}
        </Button>
      </div>
      <ul className="df-scroll mt-1 max-h-96 space-y-1.5 overflow-y-auto rounded-2xl border bg-card p-1.5 shadow-sm">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPlay(item)}
              className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Play: ${item.german}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Play className="h-3.5 w-3.5 translate-x-[1px]" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium" lang="de">
                  {item.german}
                </span>
                <span className="block truncate text-xs text-primary font-bangla" lang="bn">
                  {item.bengali}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
