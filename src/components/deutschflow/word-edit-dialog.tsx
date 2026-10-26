'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { useVocab, findDuplicate, type VocabEntry, type PartOfSpeech, type CefrLevel } from '@/lib/vocabulary';

export const POS_LABELS: Record<PartOfSpeech, string> = {
  noun: 'বিশেষ্য (noun)',
  verb: 'ক্রিয়া (verb)',
  adjective: 'বিশেষণ (adjective)',
  adverb: 'ক্রিয়া-বিশেষণ (adverb)',
  phrase: 'বাক্যাংশ (phrase)',
  question: 'প্রশ্নবোধক',
  number: 'সংখ্যা',
  other: 'অন্যান্য',
};

/**
 * Edit dialog for one vocabulary entry. Editing never touches the review
 * state or the review history — those live on untouched fields.
 */
export function WordEditDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: VocabEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { entries, update } = useVocab();
  const [draft, setDraft] = useState<VocabEntry | null>(entry);

  // Re-seed the draft whenever a different word is opened.
  const [seedId, setSeedId] = useState<string | null>(entry?.id ?? null);
  if (entry && (entry.id !== seedId || !draft)) {
    setSeedId(entry.id);
    setDraft(entry);
  }

  const duplicateConflict = useMemo(() => {
    if (!draft) return false;
    const dup = findDuplicate(entries, draft.german.trim());
    return !!dup && dup.id !== draft.id;
  }, [draft, entries]);

  if (!entry || !draft) return null;

  const save = () => {
    void update(entry.id, {
      german: draft.german.trim() || entry.german,
      banglaMeaning: draft.banglaMeaning,
      englishMeaning: draft.englishMeaning,
      partOfSpeech: draft.partOfSpeech,
      article: draft.article,
      plural: draft.plural,
      cefrLevel: draft.cefrLevel,
      tags: draft.tags,
      notes: draft.notes,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-bangla">শব্দ এডিট করো</DialogTitle>
          <DialogDescription className="font-bangla">
            অর্থ, নোট ও ব্যাকরণ তথ্য বদলাতে পারো — রিভিউ ইতিহাস ও শিডিউল অক্ষত থাকবে।
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1 df-scroll">
          <div>
            <Label htmlFor="edit-german" className="font-bangla">জার্মান শব্দ</Label>
            <Input
              id="edit-german"
              value={draft.german}
              onChange={(e) => setDraft({ ...draft, german: e.target.value })}
              className="mt-1"
              lang="de"
              aria-invalid={duplicateConflict}
            />
            {duplicateConflict && (
              <p className="mt-1 text-xs text-destructive font-bangla">
                এই বানানে আরেকটা শব্দ আগে থেকেই আছে — সেভ করা যাবে না।
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="edit-bangla" className="font-bangla">বাংলা অর্থ</Label>
            <Input
              id="edit-bangla"
              value={draft.banglaMeaning ?? ''}
              onChange={(e) => setDraft({ ...draft, banglaMeaning: e.target.value || null })}
              className="mt-1 font-bangla"
              lang="bn"
            />
          </div>
          <div>
            <Label htmlFor="edit-english" className="font-bangla">English অর্থ (জানা থাকলে)</Label>
            <Input
              id="edit-english"
              value={draft.englishMeaning ?? ''}
              onChange={(e) => setDraft({ ...draft, englishMeaning: e.target.value || null })}
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="edit-pos" className="font-bangla">ধরন</Label>
              <Select
                value={draft.partOfSpeech ?? 'none'}
                onValueChange={(v) => setDraft({ ...draft, partOfSpeech: v === 'none' ? null : (v as PartOfSpeech) })}
              >
                <SelectTrigger className="mt-1 font-bangla"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="font-bangla">জানা নেই</SelectItem>
                  {Object.entries(POS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k} className="font-bangla">{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-article" className="font-bangla">Article</Label>
              <Select
                value={draft.article ?? 'none'}
                onValueChange={(v) => setDraft({ ...draft, article: v === 'none' ? null : v })}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  <SelectItem value="der">der</SelectItem>
                  <SelectItem value="die">die</SelectItem>
                  <SelectItem value="das">das</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="edit-plural" className="font-bangla">Plural (জানা থাকলে)</Label>
              <Input
                id="edit-plural"
                value={draft.plural ?? ''}
                onChange={(e) => setDraft({ ...draft, plural: e.target.value || null })}
                className="mt-1"
                lang="de"
              />
            </div>
            <div>
              <Label htmlFor="edit-level" className="font-bangla">লেভেল</Label>
              <Select
                value={draft.cefrLevel ?? 'none'}
                onValueChange={(v) => setDraft({ ...draft, cefrLevel: v === 'none' ? null : (v as CefrLevel) })}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="font-bangla">জানা নেই</SelectItem>
                  <SelectItem value="A1">A1</SelectItem>
                  <SelectItem value="A2">A2</SelectItem>
                  <SelectItem value="B1">B1</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="edit-tags" className="font-bangla">ট্যাগ (কমা দিয়ে আলাদা)</Label>
            <Input
              id="edit-tags"
              value={draft.tags.join(', ')}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                })
              }
              className="mt-1 font-bangla"
              placeholder="পরিবার, খাবার…"
            />
          </div>
          <div>
            <Label htmlFor="edit-notes" className="font-bangla">ব্যক্তিগত নোট</Label>
            <Textarea
              id="edit-notes"
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              rows={2}
              className="mt-1 font-bangla"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="font-bangla">বাতিল</Button>
          <Button onClick={save} disabled={duplicateConflict || !draft.german.trim()} className="font-bangla">
            সেভ করো
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
