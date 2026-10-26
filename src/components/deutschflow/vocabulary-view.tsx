'use client';

import { useDeferredValue, useMemo, useRef, useState } from 'react';
import {
  AlarmClock,
  BookOpen,
  BookmarkX,
  Download,
  FileJson,
  FileSpreadsheet,
  GraduationCap,
  Heart,
  LayoutGrid,
  List as ListIcon,
  MoreVertical,
  Play,
  Repeat,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { speakNow } from '@/lib/speech-client';
import {
  useVocab,
  searchEntries,
  summarize,
  filtersAreDefault,
  exportPayload,
  toCSV,
  parseImport,
  planImport,
  DEFAULT_FILTERS,
  type CefrLevel,
  type FlashcardScope,
  type ImportMode,
  type PartOfSpeech,
  type VocabEntry,
  type VocabFilters,
  type VocabSort,
} from '@/lib/vocabulary';
import { learningState } from '@/lib/review';
import { bnNum } from '@/lib/bn';
import { POS_LABELS, WordEditDialog } from './word-edit-dialog';
import { WordDetailSheet } from './word-detail';

const PAGE_SIZE = 60;

const SORT_LABELS: Record<VocabSort, string> = {
  newest: 'নতুন আগে',
  oldest: 'পুরোনো আগে',
  alphabetical: 'A → Z',
  recentlyReviewed: 'সম্প্রতি রিভিউ হয়েছে',
  dueFirst: 'রিভিউর সময় আগে',
  lowestRecall: 'সবচেয়ে কঠিন আগে',
  mostReviewed: 'সবচেয়ে বেশি রিভিউ হয়েছে',
};

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
    /* download blocked */
  }
}

const STATE_CHIP = {
  new: { label: 'নতুন', className: 'bg-muted text-muted-foreground' },
  learning: { label: 'শিখছি', className: 'bg-muted text-muted-foreground' },
  mastered: { label: 'শেখা হয়েছে', className: 'bg-primary/10 text-primary' },
} as const;

export function VocabularyView({
  onStartReview,
}: {
  onStartReview: (scope: FlashcardScope) => void;
}) {
  const { toast } = useToast();
  const { entries, loaded, update, remove, applyImport } = useVocab();
  const [filters, setFilters] = useState<VocabFilters>(DEFAULT_FILTERS);
  const [view, setView] = useState<'list' | 'card'>('list');
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [editing, setEditing] = useState<VocabEntry | null>(null);
  const [deleting, setDeleting] = useState<VocabEntry | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<{ fileName: string; result: ReturnType<typeof parseImport> } | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const fileRef = useRef<HTMLInputElement>(null);

  const deferredQuery = useDeferredValue(filters.query);
  const effectiveFilters = useMemo(
    () => ({ ...filters, query: deferredQuery }),
    [filters, deferredQuery]
  );
  // Pagination window resets automatically whenever the filter identity
  // changes — derived state, no effect needed.
  const [pagination, setPagination] = useState({ key: effectiveFilters, count: PAGE_SIZE });
  const visibleCount = pagination.key === effectiveFilters ? pagination.count : PAGE_SIZE;
  const showMore = () => setPagination({ key: effectiveFilters, count: visibleCount + PAGE_SIZE });
  const filtered = useMemo(
    () => searchEntries(entries, effectiveFilters),
    [entries, effectiveFilters]
  );
  const summary = useMemo(() => summarize(entries), [entries]);
  const importPlan = useMemo(
    () => (importPreview ? planImport(entries, importPreview.result.entries, importMode) : null),
    [entries, importPreview, importMode]
  );

  const patch = (p: Partial<VocabFilters>) => setFilters((f) => ({ ...f, ...p }));
  const resetFilters = () => setFilters(DEFAULT_FILTERS);
  const activeFilterCount =
    (filters.favoriteOnly ? 1 : 0) +
    (filters.dueOnly ? 1 : 0) +
    (filters.difficultOnly ? 1 : 0) +
    (filters.learnedOnly ? 1 : 0) +
    (filters.recentOnly ? 1 : 0) +
    (filters.level !== 'all' ? 1 : 0) +
    (filters.pos !== 'all' ? 1 : 0) +
    (filters.query.trim() ? 1 : 0);

  const handleExportJson = () => {
    download('deutschflow-vocabulary.json', JSON.stringify(exportPayload(entries), null, 2), 'application/json');
    toast({
      title: 'ডাউনলোড শুরু হয়েছে',
      description: `${bnNum(entries.length)}টি শব্দ ও রিভিউ ইতিহাস JSON ফাইলে সেভ হচ্ছে।`,
    });
  };
  const handleExportCsv = () => {
    download('deutschflow-vocabulary.csv', toCSV(entries), 'text/csv');
    toast({
      title: 'ডাউনলোড শুরু হয়েছে',
      description: `${bnNum(entries.length)}টি শব্দ CSV ফাইলে সেভ হচ্ছে — Excel/Sheets-এ খোলা যাবে।`,
    });
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const result = parseImport(text);
      if (result.entries.length === 0) {
        toast({
          title: 'ইমপোর্ট ব্যর্থ',
          description: 'ফাইলে কোনো বৈধ শব্দ পাওয়া যায়নি — DeutschFlow JSON ব্যাকআপ লাগবে।',
          variant: 'destructive',
        });
        return;
      }
      setImportMode('merge');
      setImportPreview({ fileName: file.name, result });
    } catch {
      toast({ title: 'ইমপোর্ট ব্যর্থ', description: 'ফাইলটা পড়া যায়নি।', variant: 'destructive' });
    }
  };

  const confirmImport = () => {
    if (!importPlan || !importPreview) return;
    void applyImport(importPlan);
    toast({
      title: 'ইমপোর্ট সম্পন্ন',
      description: `${bnNum(importPlan.toAdd.length)}টি নতুন শব্দ যোগ${importPlan.toUpdate.length > 0 ? `, ${bnNum(importPlan.toUpdate.length)}টি পুরোনোর সাথে মার্জ` : ''} হয়েছে।`,
    });
    setImportPreview(null);
  };

  // ── Filter chips (shared by desktop row + mobile sheet) ─────────────
  const chips = [
    { key: 'favoriteOnly' as const, label: 'প্রিয়', icon: Heart },
    { key: 'dueOnly' as const, label: 'রিভিউ বাকি', icon: AlarmClock },
    { key: 'difficultOnly' as const, label: 'কঠিন শব্দ', icon: Sparkles },
    { key: 'learnedOnly' as const, label: 'শেখা হয়েছে', icon: GraduationCap },
    { key: 'recentOnly' as const, label: 'নতুন (৭ দিন)', icon: null },
  ];

  const chipButtons = (onPick?: () => void) => (
    <>
      {chips.map(({ key, label, icon: Icon }) => {
        const on = filters[key];
        return (
          <button
            key={key}
            type="button"
            onClick={() => {
              patch({ [key]: !on } as Partial<VocabFilters>);
              onPick?.();
            }}
            aria-pressed={on}
            className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors font-bangla focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              on ? 'border-primary/40 bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {Icon && <Icon className={`h-3.5 w-3.5 ${on && key === 'favoriteOnly' ? 'fill-current' : ''}`} aria-hidden="true" />}
            {label}
          </button>
        );
      })}
    </>
  );

  const selects = (
    <>
      <Select value={filters.level} onValueChange={(v) => patch({ level: v as CefrLevel | 'all' })}>
        <SelectTrigger aria-label="Filter by level" className="h-9 w-[108px] rounded-xl font-bangla">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="font-bangla">সব লেভেল</SelectItem>
          <SelectItem value="A1">A1</SelectItem>
          <SelectItem value="A2">A2</SelectItem>
          <SelectItem value="B1">B1</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filters.pos} onValueChange={(v) => patch({ pos: v as PartOfSpeech | 'all' })}>
        <SelectTrigger aria-label="Filter by part of speech" className="h-9 w-[150px] rounded-xl font-bangla">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="font-bangla">সব ধরন</SelectItem>
          {Object.entries(POS_LABELS).map(([k, v]) => (
            <SelectItem key={k} value={k} className="font-bangla">{v}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filters.sort} onValueChange={(v) => patch({ sort: v as VocabSort })}>
        <SelectTrigger aria-label="Sort" className="h-9 w-[168px] rounded-xl font-bangla">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(SORT_LABELS) as VocabSort[]).map((k) => (
            <SelectItem key={k} value={k} className="font-bangla">{SORT_LABELS[k]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );

  const viewToggle = (
    <div role="group" aria-label="View mode" className="flex items-center rounded-xl border">
      <button
        type="button"
        onClick={() => setView('list')}
        aria-pressed={view === 'list'}
        aria-label="List view"
        className={`flex h-9 w-9 items-center justify-center rounded-l-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${view === 'list' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted'}`}
      >
        <ListIcon className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => setView('card')}
        aria-pressed={view === 'card'}
        aria-label="Card view"
        className={`flex h-9 w-9 items-center justify-center rounded-r-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${view === 'card' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted'}`}
      >
        <LayoutGrid className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );

  const shown = filtered.slice(0, visibleCount);

  return (
    <div className="pt-6">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Vocabulary</h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground font-bangla">
            তোমার শেখা জার্মান শব্দ, অগ্রগতি ও রিভিউ এক জায়গায়।
          </p>
        </div>
        <Button
          onClick={() => onStartReview({ kind: 'due' })}
          disabled={!loaded || summary.due === 0}
          className="h-10 shrink-0 rounded-xl px-4 font-bangla"
        >
          <Repeat className="h-4 w-4" aria-hidden="true" />
          <span className="hidden min-[400px]:inline font-bangla">রিভিউ শুরু করো</span>
          <span className="min-[400px]:hidden font-bangla">রিভিউ</span>
          {summary.due > 0 && (
            <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-foreground/25 px-1 text-[10px] font-bold">
              {bnNum(summary.due)}
            </span>
          )}
        </Button>
      </div>

      {/* ── Search + import/export + mobile filter trigger ──────────── */}
      <div className="mt-4 flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={filters.query}
            onChange={(e) => patch({ query: e.target.value })}
            placeholder="শব্দ, অর্থ, উদাহরণ বা নোট দিয়ে খোঁজো…"
            aria-label="Search vocabulary"
            className="h-10 rounded-xl pl-9 pr-9 font-bangla"
          />
          {filters.query && (
            <button
              type="button"
              onClick={() => patch({ query: '' })}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              disabled={entries.length === 0}
              aria-label="Export vocabulary"
              className="h-10 w-10 shrink-0 rounded-xl"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-xl">
            <DropdownMenuLabel className="font-bangla">কোন ফরম্যাটে?</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleExportJson} className="gap-2 font-bangla">
              <FileJson className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              JSON — ব্যাকআপ ও ইমপোর্ট (ইতিহাসসহ)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportCsv} className="gap-2 font-bangla">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              CSV — Excel/Sheets-এ খোলার জন্য
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          size="icon"
          onClick={() => fileRef.current?.click()}
          aria-label="Import vocabulary from JSON file"
          className="h-10 w-10 shrink-0 rounded-xl"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
        </Button>
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          aria-label="Filters and sorting"
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          {activeFilterCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
              {bnNum(activeFilterCount)}
            </span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImportFile(f);
            e.target.value = '';
          }}
        />
      </div>

      {/* ── Statistics (all from stored data) ───────────────────────── */}
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <button
          type="button"
          onClick={resetFilters}
          aria-label="Show all words"
          className="rounded-2xl border bg-card p-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
          <p className="mt-1.5 text-2xl font-bold tabular-nums font-bangla">{bnNum(summary.total)}</p>
          <p className="text-[11px] text-muted-foreground font-bangla">মোট শব্দ</p>
        </button>
        <button
          type="button"
          onClick={() => patch({ learnedOnly: !filters.learnedOnly })}
          aria-pressed={filters.learnedOnly}
          className={`rounded-2xl border bg-card p-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            filters.learnedOnly ? 'ring-2 ring-primary/40' : ''
          }`}
        >
          <GraduationCap className="h-4 w-4 text-primary" aria-hidden="true" />
          <p className="mt-1.5 text-2xl font-bold tabular-nums font-bangla">{bnNum(summary.mastered)}</p>
          <p className="text-[11px] text-muted-foreground font-bangla">শেখা হয়েছে</p>
        </button>
        <button
          type="button"
          onClick={() => patch({ dueOnly: !filters.dueOnly })}
          aria-pressed={filters.dueOnly}
          className={`rounded-2xl border bg-card p-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            filters.dueOnly ? 'ring-2 ring-primary/40' : ''
          }`}
        >
          <AlarmClock className="h-4 w-4 text-primary" aria-hidden="true" />
          <p className="mt-1.5 text-2xl font-bold tabular-nums font-bangla">{bnNum(summary.due)}</p>
          <p className="text-[11px] text-muted-foreground font-bangla">রিভিউ বাকি</p>
        </button>
        <div className="rounded-2xl border bg-card p-3.5 shadow-sm">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          <p className="mt-1.5 text-2xl font-bold tabular-nums font-bangla">{bnNum(summary.todayTotal)}</p>
          <p className="text-[11px] leading-tight text-muted-foreground font-bangla">আজ শিখেছি</p>
          <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground/70 font-bangla">আজ যোগ + আজ প্রথম মনে রাখা</p>
        </div>
      </div>

      {/* ── Filters row (desktop) ───────────────────────────────────── */}
      <div className="mt-3 hidden flex-wrap items-center gap-2 lg:flex">
        {selects}
        {chipButtons()}
        {viewToggle}
        {!filtersAreDefault(filters) && (
          <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9 rounded-xl text-xs text-muted-foreground font-bangla hover:text-foreground">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> রিসেট
          </Button>
        )}
      </div>

      {/* ── Entries ─────────────────────────────────────────────────── */}
      {!loaded ? (
        <p className="mt-10 text-center text-sm text-muted-foreground font-bangla">লোড হচ্ছে…</p>
      ) : entries.length === 0 ? (
        <div className="df-fade-up mt-8 rounded-2xl border border-dashed bg-card/60 p-8 text-center">
          <BookmarkX className="mx-auto h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium font-bangla">এখনো কোনো শব্দ সেভ করা হয়নি</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground font-bangla">
            Listen ট্যাবে শব্দ বা বাক্য লিখে প্লে করো — ফলাফল কার্ডে + চাপলেই শব্দটা এখানে জমা হবে।
            আগের ব্যাকআপ থাকলে উপরের ইমপোর্ট বোতামে JSON ফাইল দাও।
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="df-fade-up mt-8 rounded-2xl border border-dashed bg-card/60 p-8 text-center">
          <Search className="mx-auto h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium font-bangla">এই খোঁজে কিছু মেলেনি</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground font-bangla">
            বানান বদলে দেখো, অথবা সব ফিল্টার তুলে দাও।
          </p>
          <Button variant="outline" size="sm" onClick={resetFilters} className="mt-4 rounded-xl font-bangla">
            ফিল্টার রিসেট করো
          </Button>
        </div>
      ) : view === 'list' ? (
        <ul
          className="df-scroll mt-4 space-y-2 pb-2"
          onKeyDown={(e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            const rows = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-vocab-row]'));
            const cur = rows.indexOf(document.activeElement as HTMLButtonElement);
            const next = e.key === 'ArrowDown' ? (cur + 1) % rows.length : (cur - 1 + rows.length) % rows.length;
            e.preventDefault();
            rows[next]?.focus();
          }}
        >
          {shown.map((entry, i) => (
            <VocabRow
              key={entry.id}
              entry={entry}
              actions={{
                onOpen: () => setDetailIndex(i),
                onPlay: () => speakNow(entry.german),
                onFavorite: () => void update(entry.id, { favorite: !entry.favorite }),
                onReview: () => onStartReview({ kind: 'word', id: entry.id }),
                onEdit: () => setEditing(entry),
                onDelete: () => {
                  setDeleting(entry);
                  setConfirmDelete(false);
                },
              }}
            />
          ))}
        </ul>
      ) : (
        <ul className="df-scroll mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {shown.map((entry, i) => (
            <VocabCard
              key={entry.id}
              entry={entry}
              actions={{
                onOpen: () => setDetailIndex(i),
                onPlay: () => speakNow(entry.german),
                onFavorite: () => void update(entry.id, { favorite: !entry.favorite }),
                onReview: () => onStartReview({ kind: 'word', id: entry.id }),
                onEdit: () => setEditing(entry),
                onDelete: () => {
                  setDeleting(entry);
                  setConfirmDelete(false);
                },
              }}
            />
          ))}
        </ul>
      )}

      {filtered.length > visibleCount && (
        <div className="mt-4 text-center">
          <Button variant="outline" onClick={showMore} className="rounded-xl font-bangla">
            আরও দেখাও ({bnNum(filtered.length - visibleCount)}টি বাকি)
          </Button>
        </div>
      )}

      {/* ── Footer summary ──────────────────────────────────────────── */}
      {entries.length > 0 && (
        <p className="mt-5 border-t border-border/60 pt-3 text-center text-xs text-muted-foreground font-bangla">
          {bnNum(summary.total)}টি শব্দ · {bnNum(summary.due)}টি রিভিউ বাকি
          {filtered.length !== summary.total && ` · এখন দেখা হচ্ছে ${bnNum(filtered.length)}টি`}
        </p>
      )}

      {/* ── Word detail sheet ───────────────────────────────────────── */}
      <WordDetailSheet
        entries={filtered}
        index={detailIndex ?? 0}
        onIndexChange={setDetailIndex}
        open={detailIndex !== null}
        onOpenChange={(open) => !open && setDetailIndex(null)}
        onReviewWord={(id) => onStartReview({ kind: 'word', id })}
        onEdit={(entry) => setEditing(entry)}
      />

      {/* ── Edit dialog ─────────────────────────────────────────────── */}
      <WordEditDialog entry={editing} open={!!editing} onOpenChange={(open) => !open && setEditing(null)} />

      {/* ── Delete confirm (two-step, irreversible) ─────────────────── */}
      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          {deleting && (
            <>
              <DialogHeader>
                <DialogTitle className="font-bangla">শব্দ মুছে ফেলবে?</DialogTitle>
                <DialogDescription className="font-bangla">
                  “{deleting.german}”{(deleting.reviewHistory?.length ?? 0) > 0
                    ? ` ও এর ${bnNum(deleting.reviewHistory?.length ?? 0)}টি রিভিউ রেকর্ড`
                    : ''} চিরতরে সরে যাবে — ফেরানো যাবে না।
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2 text-sm font-bangla">
                <Switch id="confirm-del" checked={confirmDelete} onCheckedChange={setConfirmDelete} />
                <Label htmlFor="confirm-del" className="font-bangla">হ্যাঁ, আমি নিশ্চিত</Label>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDeleting(null)} className="font-bangla">রাখো</Button>
                <Button
                  variant="destructive"
                  disabled={!confirmDelete}
                  onClick={() => {
                    void remove(deleting.id);
                    setDeleting(null);
                    toast({ title: 'মুছে ফেলা হয়েছে' });
                  }}
                  className="font-bangla"
                >
                  মুছে ফেলো
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Import preview dialog ───────────────────────────────────── */}
      <Dialog open={!!importPreview} onOpenChange={(open) => !open && setImportPreview(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          {importPreview && importPlan && (
            <>
              <DialogHeader>
                <DialogTitle className="font-bangla">ইমপোর্ট প্রিভিউ</DialogTitle>
                <DialogDescription className="truncate font-bangla">
                  {importPreview.fileName}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-muted/50 px-2 py-2.5">
                  <p className="text-lg font-bold tabular-nums font-bangla">{bnNum(importPreview.result.entries.length)}</p>
                  <p className="text-[11px] text-muted-foreground font-bangla">শব্দ</p>
                </div>
                <div className="rounded-xl bg-muted/50 px-2 py-2.5">
                  <p className="text-lg font-bold tabular-nums font-bangla">{bnNum(importPreview.result.historyRecords)}</p>
                  <p className="text-[11px] text-muted-foreground font-bangla">রিভিউ রেকর্ড</p>
                </div>
                <div className="rounded-xl bg-muted/50 px-2 py-2.5">
                  <p className="text-lg font-bold tabular-nums font-bangla">{bnNum(importPlan.duplicates)}</p>
                  <p className="text-[11px] text-muted-foreground font-bangla">ডুপ্লিকেট</p>
                </div>
              </div>
              {importPreview.result.skipped > 0 && (
                <p className="text-xs text-destructive font-bangla">
                  {bnNum(importPreview.result.skipped)}টি অবৈধ এন্ট্রি বাদ যাবে।
                </p>
              )}
              <RadioGroup value={importMode} onValueChange={(v) => setImportMode(v as ImportMode)} className="gap-2">
                {(
                  [
                    { value: 'merge', label: 'মার্জ করো', desc: 'নতুনগুলো যোগ হবে; পুরোনোর সাথে মিললে ফাঁকা ঘর ভরবে — তোমার রিভিউ ইতিহাস অক্ষত থাকবে।' },
                    { value: 'skip', label: 'ডুপ্লিকেট বাদ দাও', desc: 'আগে থেকে যে শব্দ আছে সেটা স্পর্শ হবে না, শুধু নতুনগুলো যোগ হবে।' },
                    { value: 'replace', label: 'সব বদলে দাও', desc: 'সতর্কতা: এখনকার পুরো তালিকা ও ইতিহাস মুছে ফাইলেরটা বসবে।', destructive: true },
                  ] as const
                ).map((opt) => (
                  <Label
                    key={opt.value}
                    htmlFor={`import-${opt.value}`}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors ${
                      importMode === opt.value ? 'border-primary/40 bg-accent/60' : 'hover:bg-muted/50'
                    }`}
                  >
                    <RadioGroupItem id={`import-${opt.value}`} value={opt.value} className="mt-0.5" />
                    <span className="min-w-0">
                      <span className={`block text-sm font-medium font-bangla ${'destructive' in opt && opt.destructive ? 'text-destructive' : ''}`}>
                        {opt.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground font-bangla">{opt.desc}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setImportPreview(null)} className="font-bangla">বাতিল</Button>
                <Button
                  onClick={confirmImport}
                  variant={importMode === 'replace' ? 'destructive' : 'default'}
                  className="font-bangla"
                >
                  ইমপোর্ট করো ({bnNum(importMode === 'skip' ? importPlan.toAdd.length : importPlan.toAdd.length + importPlan.toUpdate.length)}টি)
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Mobile filter sheet ─────────────────────────────────────── */}
      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl df-scroll">
          <SheetHeader className="p-0 pb-2 text-left">
            <SheetTitle className="font-bangla">ফিল্টার ও সাজানো</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 pb-2">
            <div className="flex flex-wrap gap-2">{selects}</div>
            <div className="flex flex-wrap gap-2">{chipButtons()}</div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium font-bangla">দেখার ধরন</p>
              {viewToggle}
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={resetFilters} disabled={filtersAreDefault(filters)} className="rounded-xl text-muted-foreground font-bangla hover:text-foreground">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> সব রিসেট
              </Button>
              <Button onClick={() => setFilterOpen(false)} className="rounded-xl font-bangla">
                প্রয়োগ করো ({bnNum(filtered.length)}টি)
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Row + card ────────────────────────────────────────────────────────

interface RowActions {
  onOpen: () => void;
  onPlay: () => void;
  onFavorite: () => void;
  onReview: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function RowMenu({ entry, actions }: { entry: VocabEntry; actions: RowActions }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`More actions for ${entry.german}`} className="h-10 w-10 rounded-xl text-muted-foreground hover:text-foreground">
          <MoreVertical className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-xl">
        <DropdownMenuItem onClick={actions.onOpen} className="font-bangla">
          খুলে দেখো
        </DropdownMenuItem>
        <DropdownMenuItem onClick={actions.onReview} className="gap-2 font-bangla">
          <Repeat className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> এই শব্দ রিভিউ করো
        </DropdownMenuItem>
        <DropdownMenuItem onClick={actions.onEdit} className="gap-2 font-bangla">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> এডিট করো
        </DropdownMenuItem>
        <DropdownMenuItem onClick={actions.onDelete} className="gap-2 text-destructive font-bangla focus:text-destructive">
          <Trash2 className="h-4 w-4" aria-hidden="true" /> মুছে ফেলো
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EntryBadges({ entry }: { entry: VocabEntry }) {
  const due = entry.review.dueAt <= Date.now();
  const state = STATE_CHIP[learningState(entry.review)];
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {entry.cefrLevel && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">{entry.cefrLevel}</span>
      )}
      {entry.partOfSpeech && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium font-bangla">
          {POS_LABELS[entry.partOfSpeech]}
        </span>
      )}
      {entry.plural && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]" lang="de">Pl. {entry.plural}</span>
      )}
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-medium font-bangla ${
          due ? 'bg-primary/10 text-primary' : state.className
        }`}
      >
        {due ? 'রিভিউর সময়' : state.label}
      </span>
    </div>
  );
}

function ActionColumn({ entry, actions }: { entry: VocabEntry; actions: RowActions }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        onClick={actions.onPlay}
        aria-label={`Play ${entry.german}`}
        className="h-10 w-10 rounded-xl text-muted-foreground hover:text-primary"
      >
        <Play className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={actions.onFavorite}
        aria-label={entry.favorite ? 'Remove from favorites' : 'Add to favorites'}
        aria-pressed={entry.favorite}
        className="h-10 w-10 rounded-xl text-muted-foreground hover:text-primary"
      >
        <Star className={`h-4 w-4 ${entry.favorite ? 'fill-chart-2 text-chart-2' : ''}`} aria-hidden="true" />
      </Button>
      <RowMenu entry={entry} actions={actions} />
    </div>
  );
}

function VocabRow({ entry, actions }: { entry: VocabEntry; actions: RowActions }) {
  return (
    <li className="rounded-2xl border bg-card p-3.5 shadow-sm transition-[box-shadow,border-color] duration-300 hover:border-primary/30 hover:shadow-md">
      <div className="flex items-start gap-2">
        <button
          type="button"
          data-vocab-row
          onClick={actions.onOpen}
          className="min-w-0 flex-1 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Open ${entry.german} details`}
        >
          <p className="font-german text-lg font-semibold leading-snug" lang="de">
            {entry.article && <span className="mr-1 text-primary/80">{entry.article}</span>}
            {entry.german}
          </p>
          {entry.bengaliPronunciation && (
            <p className="mt-0.5 text-sm font-medium text-accent-foreground font-bangla" lang="bn">
              {entry.bengaliPronunciation}
            </p>
          )}
          {entry.banglaMeaning && (
            <p className="mt-0.5 truncate text-sm text-muted-foreground font-bangla" lang="bn">
              {entry.banglaMeaning}
            </p>
          )}
          <EntryBadges entry={entry} />
        </button>
        <ActionColumn entry={entry} actions={actions} />
      </div>
      {entry.notes && (
        <p className="mt-2 rounded-lg bg-muted/60 px-3 py-1.5 text-xs leading-relaxed font-bangla">{entry.notes}</p>
      )}
    </li>
  );
}

function VocabCard({ entry, actions }: { entry: VocabEntry; actions: RowActions }) {
  const example = entry.examples[0];
  return (
    <li className="flex flex-col rounded-2xl border bg-card p-4 shadow-sm transition-[box-shadow,border-color] duration-300 hover:border-primary/30 hover:shadow-md">
      <div className="flex items-start gap-1">
        <button
          type="button"
          data-vocab-row
          onClick={actions.onOpen}
          className="min-w-0 flex-1 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Open ${entry.german} details`}
        >
          <p className="font-german text-lg font-semibold leading-snug" lang="de">
            {entry.article && <span className="mr-1 text-primary/80">{entry.article}</span>}
            {entry.german}
          </p>
          {entry.bengaliPronunciation && (
            <p className="mt-0.5 text-sm font-medium text-accent-foreground font-bangla" lang="bn">
              {entry.bengaliPronunciation}
            </p>
          )}
          {entry.banglaMeaning && (
            <p className="mt-0.5 text-sm text-muted-foreground font-bangla" lang="bn">
              {entry.banglaMeaning}
            </p>
          )}
          <EntryBadges entry={entry} />
        </button>
        <RowMenu entry={entry} actions={actions} />
      </div>
      {example && (
        <p className="mt-2.5 truncate rounded-lg bg-muted/60 px-3 py-1.5 text-xs font-german" lang="de">
          {example.german}
        </p>
      )}
      <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-border/60 pt-2">
        <div className="flex gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={actions.onPlay}
            aria-label={`Play ${entry.german}`}
            className="h-9 w-9 rounded-lg text-muted-foreground hover:text-primary"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={actions.onFavorite}
            aria-label={entry.favorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={entry.favorite}
            className="h-9 w-9 rounded-lg text-muted-foreground hover:text-primary"
          >
            <Star className={`h-4 w-4 ${entry.favorite ? 'fill-chart-2 text-chart-2' : ''}`} aria-hidden="true" />
          </Button>
        </div>
        <Button variant="ghost" size="sm" onClick={actions.onReview} className="h-9 rounded-lg text-xs text-muted-foreground font-bangla hover:text-foreground">
          <Repeat className="h-3.5 w-3.5" aria-hidden="true" /> রিভিউ
        </Button>
      </div>
    </li>
  );
}
