'use client';

import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Globe,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Star,
  Trash2,
  Volume1,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { speakNow } from '@/lib/speech-client';
import { useVocab, reviewHistoryOf, type VocabEntry } from '@/lib/vocabulary';
import {
  dueLabel,
  learningState,
  recallStats,
  MIN_EASE,
  MAX_EASE,
} from '@/lib/review';
import { bnDate, bnDateTime, bnNum, bnPct } from '@/lib/bn';
import { POS_LABELS } from './word-edit-dialog';

const STATE_LABELS = {
  new: { label: 'নতুন', className: 'bg-muted text-muted-foreground' },
  learning: { label: 'শিখছি', className: 'bg-primary/10 text-primary' },
  mastered: { label: 'শেখা হয়েছে', className: 'bg-primary text-primary-foreground' },
} as const;

const RATING_LABELS = { again: 'আবার', hard: 'কঠিন', good: 'ভালো', easy: 'সহজ' } as const;

function HistoryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2.5">
      <p className="text-[11px] leading-tight text-muted-foreground font-bangla">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums font-bangla">{value}</p>
    </div>
  );
}

/**
 * Full-word detail sheet: linguistic overview, pronunciation controls,
 * personal examples/notes and the honest per-word learning history built
 * from the append-only review log. Nothing here is fabricated — missing
 * grammar stays "জানা নেই".
 */
export function WordDetailSheet({
  entries,
  index,
  onIndexChange,
  open,
  onOpenChange,
  onReviewWord,
  onEdit,
}: {
  entries: VocabEntry[];
  index: number;
  onIndexChange: (index: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Launch a single-word flashcard session. */
  onReviewWord: (id: string) => void;
  onEdit: (entry: VocabEntry) => void;
}) {
  const { toast } = useToast();
  const { update, remove, reviewWord } = useVocab();
  const [exampleDraft, setExampleDraft] = useState({ german: '', bangla: '' });
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const entry = entries[index] ?? null;

  if (!entry) return null;

  const history = reviewHistoryOf(entry);
  const stats = recallStats(history);
  const state = learningState(entry.review);
  const stateMeta = STATE_LABELS[state];
  const showTrend = history.length >= 3;

  const addExample = () => {
    const german = exampleDraft.german.trim();
    if (!german) return;
    void update(entry.id, {
      examples: [...entry.examples, { german, bangla: exampleDraft.bangla.trim() || null }].slice(-10),
    });
    setExampleDraft({ german: '', bangla: '' });
    toast({ title: 'উদাহরণ যোগ হয়েছে', description: 'তোমার নিজের লেখা উদাহরণ হিসেবে সেভ হলো।' });
  };

  const saveNotes = () => {
    if (notesDraft === null) return;
    void update(entry.id, { notes: notesDraft });
    setNotesDraft(null);
    toast({ title: 'নোট সেভ হয়েছে' });
  };

  const resetSchedule = () => {
    void update(entry.id, {
      review: {
        interval: 0,
        ease: 2.5,
        repetitions: 0,
        dueAt: 0,
        lastReviewedAt: null,
        lapses: 0,
      },
    });
    setConfirmReset(false);
    toast({ title: 'শিডিউল রিসেট হয়েছে', description: 'শব্দটা আবার নতুন কার্ডের মতো শুরু হবে; পুরোনো রিভিউ ইতিহাস থাকবে।' });
  };

  const doDelete = () => {
    void remove(entry.id);
    setDeleting(false);
    setConfirmDelete(false);
    onOpenChange(false);
    toast({ title: 'মুছে ফেলা হয়েছে', description: `“${entry.german}” ও এর রিভিউ ইতিহাস সরে গেছে।` });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-lg overflow-y-auto p-0 sm:max-w-lg df-scroll">
        <div className="px-5 pb-8 pt-2">
          <SheetHeader className="p-0 text-left">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <SheetTitle className="font-german text-2xl leading-snug" lang="de">
                  {entry.article && <span className="mr-1.5 text-primary/80">{entry.article}</span>}
                  {entry.german}
                </SheetTitle>
                {entry.bengaliPronunciation && (
                  <SheetDescription className="mt-1 text-base font-medium text-accent-foreground font-bangla" lang="bn">
                    {entry.bengaliPronunciation}
                  </SheetDescription>
                )}
              </div>
              <div className="flex shrink-0 gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void update(entry.id, { favorite: !entry.favorite })}
                  aria-label={entry.favorite ? 'Remove from favorites' : 'Add to favorites'}
                  aria-pressed={entry.favorite}
                  className="h-9 w-9 rounded-xl"
                >
                  <Star className={`h-4 w-4 ${entry.favorite ? 'fill-chart-2 text-chart-2' : ''}`} aria-hidden="true" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="More actions" className="h-9 w-9 rounded-xl">
                      <MoreVertical className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-xl">
                    <DropdownMenuItem onClick={() => onEdit(entry)} className="gap-2 font-bangla">
                      <Pencil className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> এডিট করো
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onReviewWord(entry.id)} className="gap-2 font-bangla">
                      <RotateCcw className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> এই শব্দ রিভিউ করো
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setConfirmReset(true)} className="gap-2 font-bangla">
                      <RotateCcw className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> শিডিউল রিসেট
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDeleting(true)} className="gap-2 text-destructive font-bangla focus:text-destructive">
                      <Trash2 className="h-4 w-4" aria-hidden="true" /> মুছে ফেলো
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </SheetHeader>

          {/* ── Status + pronunciation controls ─────────────────────── */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold font-bangla ${stateMeta.className}`}>
              {stateMeta.label}
            </span>
            {entry.cefrLevel && (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold">{entry.cefrLevel}</span>
            )}
            {entry.partOfSpeech && (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium font-bangla">
                {POS_LABELS[entry.partOfSpeech]}
              </span>
            )}
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium font-bangla">
              {entry.review.dueAt <= Date.now() ? 'রিভিউর সময়' : dueLabel(entry.review.dueAt)}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={() => speakNow(entry.german)} className="h-10 rounded-xl px-4 font-bangla">
              <Play className="h-4 w-4" aria-hidden="true" /> শোনো
            </Button>
            <Button variant="outline" onClick={() => speakNow(entry.german)} className="h-10 rounded-xl px-4 font-bangla" aria-label="Replay">
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> আবার
            </Button>
            <Button variant="outline" onClick={() => speakNow(entry.german, 0.75)} className="h-10 rounded-xl px-4 font-bangla">
              <Volume1 className="h-4 w-4" aria-hidden="true" /> ধীরে
            </Button>
          </div>

          {/* ── Meanings ────────────────────────────────────────────── */}
          <section className="mt-6" aria-label="Meanings">
            <h3 className="text-[13px] font-semibold text-muted-foreground font-bangla">অর্থ</h3>
            <div className="mt-2 space-y-1.5 rounded-2xl border bg-card p-4">
              <p className="text-xl font-bold font-bangla" lang="bn">
                {entry.banglaMeaning ?? <span className="text-sm font-normal text-muted-foreground">বাংলা অর্থ এখনো লেখা হয়নি — এডিট থেকে যোগ করো</span>}
              </p>
              {entry.englishMeaning && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {entry.englishMeaning}
                </p>
              )}
            </div>
          </section>

          {/* ── Grammar ─────────────────────────────────────────────── */}
          <section className="mt-4" aria-label="Grammar">
            <h3 className="text-[13px] font-semibold text-muted-foreground font-bangla">ব্যাকরণ</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-xl border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground font-bangla">Article</p>
                <p className="font-medium" lang="de">{entry.article ?? '—'}</p>
              </div>
              <div className="rounded-xl border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground font-bangla">Plural</p>
                <p className="font-medium" lang="de">{entry.plural ?? '—'}</p>
              </div>
              <div className="rounded-xl border bg-card px-3 py-2">
                <p className="text-[11px] text-muted-foreground font-bangla">লেভেল</p>
                <p className="font-medium">{entry.cefrLevel ?? '—'}</p>
              </div>
            </div>
            {entry.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {entry.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-medium text-accent-foreground font-bangla">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* ── Examples (source + saved + personal) ────────────────── */}
          <section className="mt-4" aria-label="Examples">
            <h3 className="text-[13px] font-semibold text-muted-foreground font-bangla">উদাহরণ</h3>
            <div className="mt-2 space-y-2">
              {entry.sourceSentence && entry.sourceSentence !== entry.german && (
                <div className="rounded-xl border bg-card px-3.5 py-2.5">
                  <p className="text-sm font-german" lang="de">{entry.sourceSentence}</p>
                  {entry.banglaMeaning && (
                    <p className="mt-0.5 text-xs text-muted-foreground font-bangla">সেভ করা বাক্য থেকে · {entry.banglaMeaning}</p>
                  )}
                </div>
              )}
              {entry.examples
                .filter((ex) => ex.german !== entry.sourceSentence)
                .map((ex, i) => (
                  <div key={`${ex.german}-${i}`} className="rounded-xl border bg-card px-3.5 py-2.5">
                    <p className="text-sm font-german" lang="de">{ex.german}</p>
                    {ex.bangla && <p className="mt-0.5 text-xs text-muted-foreground font-bangla" lang="bn">{ex.bangla}</p>}
                    <p className="mt-1 text-[10px] text-muted-foreground/70 font-bangla">তোমার সেভ করা উদাহরণ</p>
                  </div>
                ))}
            </div>
            <div className="mt-2 rounded-xl border border-dashed p-3">
              <Label htmlFor="ex-german" className="text-xs font-bangla">নিজের উদাহরণ যোগ করো</Label>
              <Input
                id="ex-german"
                value={exampleDraft.german}
                onChange={(e) => setExampleDraft((d) => ({ ...d, german: e.target.value }))}
                placeholder="Ich brauche eine Pause…"
                className="mt-1.5 h-9"
                lang="de"
              />
              <div className="mt-2 flex gap-2">
                <Input
                  value={exampleDraft.bangla}
                  onChange={(e) => setExampleDraft((d) => ({ ...d, bangla: e.target.value }))}
                  placeholder="বাংলা অনুবাদ (ইচ্ছা হলে)"
                  className="h-9 font-bangla"
                  lang="bn"
                  aria-label="Bangla translation of your example"
                />
                <Button size="sm" onClick={addExample} disabled={!exampleDraft.german.trim()} className="h-9 shrink-0 rounded-lg font-bangla">
                  <Plus className="h-4 w-4" aria-hidden="true" /> যোগ করো
                </Button>
              </div>
            </div>
          </section>

          {/* ── Notes ───────────────────────────────────────────────── */}
          <section className="mt-4" aria-label="Notes">
            <h3 className="text-[13px] font-semibold text-muted-foreground font-bangla">নোট</h3>
            <Textarea
              value={notesDraft ?? entry.notes}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={2}
              placeholder="নিজের মনে রাখার টিপ লিখে রাখো…"
              className="mt-2 font-bangla"
              aria-label="Personal notes"
            />
            {notesDraft !== null && notesDraft !== entry.notes && (
              <Button size="sm" onClick={saveNotes} className="mt-2 rounded-lg font-bangla">নোট সেভ করো</Button>
            )}
          </section>

          {/* ── Personal learning history ───────────────────────────── */}
          <section className="mt-6" aria-label="আমার শেখার ইতিহাস">
            <h3 className="text-[13px] font-semibold text-muted-foreground font-bangla">আমার শেখার ইতিহাস</h3>
            {history.length === 0 ? (
              <p className="mt-2 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground font-bangla">
                এখনো কোনো রিভিউ হয়নি। কার্ড থেকে রেটিং দিলেই এখানে আসল ইতিহাস জমা হবে — অডিও চালানো বা খুলে দেখা গোনা হয় না।
              </p>
            ) : (
              <>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <HistoryMetric label="মোট রিভিউ" value={`${bnNum(stats.attempts)} বার`} />
                  <HistoryMetric label="সঠিক মনে রেখেছি" value={`${bnNum(stats.correct)} বার`} />
                  <HistoryMetric label="ভুল হয়েছে" value={`${bnNum(stats.wrong)} বার`} />
                  <HistoryMetric label="সঠিক উত্তরের হার" value={bnPct(stats.rate ?? 0)} />
                  <HistoryMetric label="টানা সঠিক" value={`${bnNum(stats.consecutiveCorrect)} বার`} />
                  <HistoryMetric
                    label="বর্তমান ব্যবধান"
                    value={entry.review.interval > 0 ? `${bnNum(entry.review.interval)} দিন` : 'শেখা শুরুতেই'}
                  />
                  <HistoryMetric
                    label="Ease (সহজ-কাঠিন্য)"
                    value={`${bnNum(entry.review.ease.toFixed(2))} · ${bnNum(MIN_EASE)}–${bnNum(MAX_EASE)}`}
                  />
                  <HistoryMetric label="যোগ করেছি" value={bnDate(entry.createdAt)} />
                  <HistoryMetric
                    label="প্রথম মনে রেখেছি"
                    value={stats.firstCorrectAt ? bnDate(stats.firstCorrectAt) : '—'}
                  />
                  <HistoryMetric
                    label="শেষ রিভিউ"
                    value={entry.review.lastReviewedAt ? bnDateTime(entry.review.lastReviewedAt) : '—'}
                  />
                  <HistoryMetric
                    label="পরের রিভিউ"
                    value={entry.review.dueAt <= Date.now() ? 'এখনই' : bnDateTime(entry.review.dueAt)}
                  />
                  <HistoryMetric label="মোট ভুল (lapse)" value={`${bnNum(entry.review.lapses)} বার`} />
                </div>

                {/* Correctness trend — only with enough data to be honest */}
                {showTrend && (
                  <div className="mt-3" role="img" aria-label={`Recall trend across ${history.length} reviews`}>
                    <p className="text-[11px] text-muted-foreground font-bangla">রিভিউের ধারা (পুরোনো → নতুন)</p>
                    <div className="mt-1.5 flex items-center gap-1">
                      {history.slice(-24).map((rec, i) => (
                        <span
                          key={i}
                          title={`${bnDateTime(rec.at)} · ${RATING_LABELS[rec.rating]}`}
                          className={`h-5 w-2 rounded-sm ${rec.correct ? 'bg-primary/80' : 'bg-destructive/80'}`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {/* ── Review timeline ─────────────────────────────────────── */}
          {history.length > 0 && (
            <section className="mt-6" aria-label="Review timeline">
              <h3 className="text-[13px] font-semibold text-muted-foreground font-bangla">রিভিউ টাইমলাইন</h3>
              <ol className="mt-2 space-y-1.5">
                {[...history].reverse().map((rec, i) => (
                  <li key={`${rec.at}-${i}`} className="flex items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        rec.correct ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'
                      }`}
                      aria-hidden="true"
                    >
                      {rec.correct ? '✓' : '✕'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium font-bangla">
                        {RATING_LABELS[rec.rating]}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {bnDateTime(rec.at)}
                        </span>
                      </p>
                      <p className="text-[11px] text-muted-foreground font-bangla">
                        ব্যবধান: {rec.prevInterval > 0 ? `${bnNum(rec.prevInterval)} দিন` : 'নতুন'} →{' '}
                        {rec.newInterval > 0 ? `${bnNum(rec.newInterval)} দিন` : '১০ মিনিট'}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* ── Prev / next navigation ──────────────────────────────── */}
          <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={index <= 0}
              onClick={() => {
                onIndexChange(index - 1);
                setNotesDraft(null);
              }}
              className="rounded-xl font-bangla"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> আগের শব্দ
            </Button>
            <span className="text-[11px] tabular-nums text-muted-foreground font-bangla">
              {bnNum(index + 1)} / {bnNum(entries.length)}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={index >= entries.length - 1}
              onClick={() => {
                onIndexChange(index + 1);
                setNotesDraft(null);
              }}
              className="rounded-xl font-bangla"
            >
              পরের শব্দ <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* Reset scheduling confirm */}
        <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
          <DialogContent className="max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-bangla">শিডিউল রিসেট করবে?</DialogTitle>
              <DialogDescription className="font-bangla">
                “{entry.german}” আবার নতুন কার্ডের মতো শুরু হবে। পুরোনো রিভিউ ইতিহাস মুছবে না।
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmReset(false)} className="font-bangla">থাক</Button>
              <Button onClick={resetSchedule} className="font-bangla">রিসেট করো</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirm — deleting also removes the review history */}
        <Dialog open={deleting} onOpenChange={(o) => { setDeleting(o); if (!o) setConfirmDelete(false); }}>
          <DialogContent className="max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-bangla">শব্দটা পুরোপুরি মুছে ফেলবে?</DialogTitle>
              <DialogDescription className="font-bangla">
                “{entry.german}”{history.length > 0 ? ` ও এর ${bnNum(history.length)}টি রিভিউ রেকর্ড` : ''} চিরতরে সরে যাবে — ফেরানো যাবে না।
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 text-sm font-bangla">
              <Switch id="confirm-del-detail" checked={confirmDelete} onCheckedChange={setConfirmDelete} />
              <Label htmlFor="confirm-del-detail" className="font-bangla">হ্যাঁ, আমি নিশ্চিত</Label>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDeleting(false)} className="font-bangla">রাখো</Button>
              <Button variant="destructive" disabled={!confirmDelete} onClick={doDelete} className="font-bangla">
                মুছে ফেলো
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}
