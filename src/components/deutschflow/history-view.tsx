'use client';

import { useMemo, useState } from 'react';
import { Play, Search, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { HistoryIcon } from 'lucide-react';
import type { HistoryItem } from '@/lib/types';

interface HistoryViewProps {
  items: HistoryItem[];
  onPlay: (item: HistoryItem) => void;
  onClear: () => void;
  onRemove: (id: string) => void;
}

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return 'আজ';
  if (sameDay(d, yest)) return 'গতকাল';
  return d.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long' });
}

export function HistoryView({ items, onPlay, onClear, onRemove }: HistoryViewProps) {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [confirming, setConfirming] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.german.toLowerCase().includes(q) ||
        (it.bangla ?? '').toLowerCase().includes(q) ||
        it.bengali.includes(query.trim())
    );
  }, [items, query]);

  const handleClear = () => {
    if (!confirming) {
      setConfirming(true);
      window.setTimeout(() => setConfirming(false), 3500);
      return;
    }
    setConfirming(false);
    onClear();
    toast({ title: 'ইতিহাস মুছে ফেলা হয়েছে' });
  };

  return (
    <div className="pt-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">History</h1>
          <p className="mt-0.5 text-sm text-muted-foreground font-bangla">
            {items.length}টি বাক্য শোনা হয়েছে — যেকোনোটায় ট্যাপ করলেই আবার প্লে হবে
          </p>
        </div>
        {items.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            aria-label={confirming ? 'Confirm clear all history' : 'Clear all history'}
            className={`h-9 rounded-xl px-3 text-xs font-bangla ${
              confirming ? 'border-destructive/40 text-destructive hover:text-destructive' : ''
            }`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {confirming ? 'সব মুছবে — নিশ্চিত?' : 'সব মুছো'}
          </Button>
        )}
      </div>

      {items.length > 0 && (
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ইতিহাসে খোঁজো…"
            aria-label="Search history"
            className="h-11 rounded-xl pl-9 font-bangla"
          />
        </div>
      )}

      {items.length === 0 ? (
        <div className="df-fade-up mt-8 rounded-2xl border border-dashed bg-card/60 p-8 text-center">
          <HistoryIcon className="mx-auto h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium font-bangla">এখনো কোনো ইতিহাস নেই</p>
          <p className="mt-1 text-xs text-muted-foreground font-bangla">
            Listen ট্যাবে প্রথম বাক্যটা শোনো — সব এখানে জমা হতে থাকবে (শুধু তোমার ব্রাউজারে)।
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground font-bangla">
          “{query}” এর জন্য কিছু মেলেনি।
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {filtered.map((item) => (
            <li key={item.id} className="flex items-center gap-2 rounded-2xl border bg-card p-3 shadow-sm">
              <button
                type="button"
                onClick={() => onPlay(item)}
                className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Play: ${item.german}`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Play className="h-4 w-4 translate-x-[1px]" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium" lang="de">
                    {item.german}
                  </span>
                  <span className="block truncate text-xs text-primary font-bangla" lang="bn">
                    {item.bengali}
                  </span>
                  {item.bangla && (
                    <span className="block truncate text-[11px] text-muted-foreground font-bangla" lang="bn">
                      {item.bangla}
                    </span>
                  )}
                </span>
              </button>
              <div className="flex shrink-0 flex-col items-end gap-0.5 pr-1">
                <span className="text-[10px] text-muted-foreground font-bangla">{dayLabel(item.createdAt)}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemove(item.id)}
                  aria-label={`Remove ${item.german} from history`}
                  className="h-7 w-7 rounded-lg text-muted-foreground/60 hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
