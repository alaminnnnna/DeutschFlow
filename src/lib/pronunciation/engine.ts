/**
 * God-level German → Bengali phonetic transliteration engine.
 *
 * This is a classic hybrid G2P system:
 *   1. phrase lexicon  → iconic A1 phrases, guaranteed quality
 *   2. word lexicon    → high-frequency / irregular words
 *   3. rule engine     → context-sensitive phonetic rules for everything else
 *
 * The rule engine models real German phonology (not letter-by-letter mapping):
 *
 *   • Digraphs/trigraphs: sch→শ, tsch→চ, chs→ক্স, ck→ক, ph→ফ, th→ট,
 *     qu→ক্ভ, pf→পফ, dt→ট, -tion→ৎসিওন
 *   • ch allophony: after a/o/u → খ [x]; otherwise খ [ç] (learner convention);
 *     initial ch+ao/u/l/r → ক (Chor, Chaos)
 *   • Initial/prefix sp/st → শপ/শট ([ʃp]/[ʃt]) with a morphological prefix list
 *     (ver-, er-, ent-, aus- …), but NOT inside words like "beste" → বেসটে
 *   • z/tz → ৎস [ts] (after a consonant → চ for readability)
 *   • s voicing: word-initial or post-vocalic s + vowel → জ [z]; otherwise স [s];
 *     ss/ß → স
 *   • w → ভ [v], v → ফ [f], j → য [j]
 *   • Final devoicing (Auslautverhärtung): b/d/g word-final or before a
 *     consonant → প/ট/ক  (Tag→টাক, und→উন্ট, ob→ওপ, sagt→জাকট, Wald→ভাল্ট)
 *   • r-vocalization: word-final -er → আর (Vater→ফাটার); stressed er before a
 *     consonant → আর (werden→ভার্ডেন, lerne→লার্নে); other post-vocalic
 *     word-final r → য়ার (dir→ডিয়ার, Uhr→উয়ার, sehr→জেয়ার)
 *   • Silent lengthening h: gehen→গেন, sehen→সেন, ihr→ঈয়ার, Wohnung→ভোনুং
 *   • Diphthongs: ei/ai→াই, au→াউ, eu/äu→য় (neu→নয়, Deutsch→ডয়চ,
 *     Häuser→হয়জার — consonant+য় reads [Cɔj] in Bengali)
 *   • Umlauts: ü→ুই (fünf→ফুইন্ফ), ö→্যো (schön→শ্যোন), ä long→ে /
 *     short→্যা (Männer→ম্যানার), with doubled-consonant shortness heuristic
 *   • n assimilation: nk→ঙ্ক (Danke→ডাঙ্কে), ng→ঙ্গ, -ung→ুং (Zeitung)
 *   • -ig word-final → িখ [ɪç] (zwanzig→ৎসভানচিখ, wichtig→ভিখসটিখ)
 *   • Bengali orthographic assembly: automatic virama conjuncts (ন্ড, র্গ, ন্ফ),
 *     vowel signs after consonants vs. independent vowels word-initially,
 *     glide handling so য় never gets a virama (ডয়চ, not ডয়্চ)
 *
 * The output is an approximate teaching aid — the UI must always label it as
 * such. The PronunciationProvider interface below lets this engine be swapped
 * or upgraded (e.g. an AI transcription service) without touching the UI.
 */

import { LEXICON, PHRASES } from './lexicon';
import type { PronunciationResult, PronunciationWord } from '../types';

// ── Bengali script helpers ───────────────────────────────────────────

const VIRAMA = '\u09CD';
/** য় as a single NFC codepoint — must never appear decomposed (য + nukta). */
const YA = '\u09DF';

function cp(ch: string | undefined): number {
  return ch ? ch.codePointAt(0)! : -1;
}

function isBnConsonant(ch: string | undefined): boolean {
  const c = cp(ch);
  return (
    (c >= 0x0995 && c <= 0x09b9) || c === 0x09ce || (c >= 0x09dc && c <= 0x09df)
  );
}

function isBnVowelSign(ch: string | undefined): boolean {
  const c = cp(ch);
  return (
    (c >= 0x09be && c <= 0x09c4) ||
    c === 0x09c7 ||
    c === 0x09c8 ||
    (c >= 0x09cb && c <= 0x09cc) ||
    c === 0x09d7
  );
}

function isBnIndependentVowel(ch: string | undefined): boolean {
  const c = cp(ch);
  return c >= 0x0985 && c <= 0x0994;
}

// ── Tokenizer ────────────────────────────────────────────────────────

interface Token {
  type: 'word' | 'sep';
  text: string;
}

const WORD_RE = /[A-Za-zÄÖÜäöüß]+(?:['’-][A-Za-zÄÖÜäöüß]+)*/g;

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(text)) !== null) {
    if (m.index > last) tokens.push({ type: 'sep', text: text.slice(last, m.index) });
    tokens.push({ type: 'word', text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ type: 'sep', text: text.slice(last) });
  return tokens;
}

// ── Rule tables ──────────────────────────────────────────────────────

/** sp/st are [ʃ] right after these (morpheme boundaries) or word-initially. */
const SPIRANT_PREFIXES = [
  'ver', 'er', 'zer', 'ent', 'emp', 'miss', 'auf', 'aus', 'an', 'ab',
  'vor', 'ein', 'unter', 'über', 'durch', 'hinter', 'her', 'hin',
];

function afterSpirantPrefix(w: string, i: number): boolean {
  if (i === 0) return true;
  for (const p of SPIRANT_PREFIXES) {
    if (w.startsWith(p) && i === p.length && w.length > p.length) return true;
  }
  return false;
}

/** Clusters that close a syllable → short ä (ম্যা), otherwise long ä (ে). */
const SHORT_AE_CLUSTERS = new Set([
  'll', 'mm', 'nn', 'ss', 'tt', 'ff', 'pp', 'rr', 'ck', 'tz', 'pf',
  'nd', 'nt', 'mp', 'ns', 'ms', 'ft', 'kt', 'xt', 'lt', 'lf', 'lp',
  'rm', 'rn', 'rt', 'rs', 'ts', 'ks', 'ls', 'st', 'sk', 'sp', 'nb', 'ng',
]);

const VOWELS = 'aeiouäöüy';

function isVowelLetter(c: string | undefined): boolean {
  return !!c && VOWELS.includes(c);
}

// ── Word-level transcription ─────────────────────────────────────────

export interface WordTranscription {
  bengali: string;
  source: 'lexicon' | 'rules';
  skipped: number;
}

export function transcribeWord(rawWord: string): WordTranscription {
  const key = rawWord.toLowerCase();
  const lex = LEXICON[key];
  if (lex) return { bengali: lex, source: 'lexicon', skipped: 0 };

  let skipped = 0;
  // Split on hyphens/apostrophes and scan each part separately.
  const parts = key.split(/([-'])/);
  let out = '';
  for (const part of parts) {
    if (!part) continue;
    if (part === '-' || part === "'" || part === '’') {
      out += part === '-' ? '-' : '';
      continue;
    }
    const r = scanWord(part);
    out += r.text;
    skipped += r.skipped;
  }
  return { bengali: out, source: 'rules', skipped };
}

interface ScanResult {
  text: string;
  skipped: number;
}

function scanWord(w: string): ScanResult {
  let out = '';
  let i = 0;
  let skipped = 0;
  /** True when the previous output is a য় used as a diphthong coda (no virama). */
  let glide = false;

  const at = (s: string) => w.startsWith(s, i);
  const rest = () => w.length - i;

  const endsVowelish = (): boolean => {
    if (glide) return true;
    const last = out.slice(-1);
    return !!last && (isBnVowelSign(last) || isBnIndependentVowel(last));
  };

  const endsConsonant = (): boolean => {
    if (glide) return false;
    return isBnConsonant(out.slice(-1));
  };

  /** Append a consonant chunk; inserts a virama to build Bengali conjuncts. */
  const appendCons = (chunk: string, noVirama = false): void => {
    if (
      !noVirama &&
      !glide &&
      out.length > 0 &&
      isBnConsonant(out.slice(-1)) &&
      isBnConsonant(chunk[0])
    ) {
      out += VIRAMA;
    }
    out += chunk;
    glide = false;
  };

  /** Emit a vowel: sign form after a consonant, independent form otherwise. */
  const emitVowel = (sign: string, indep: string): void => {
    if (out.length > 0 && isBnConsonant(out.slice(-1))) out += sign;
    else out += indep;
    glide = false;
  };

  while (i < w.length) {
    const c = w[i];

    // ── Trigraphs / digraphs (longest match first) ──────────────────

    if (at('tsch')) { appendCons('চ'); i += 4; continue; }
    if (at('sch')) { appendCons('শ'); i += 3; continue; }
    if ((at('st') || at('sp')) && afterSpirantPrefix(w, i)) {
      appendCons(at('st') ? 'শট' : 'শপ');
      i += 2;
      continue;
    }
    if (at('chs')) { appendCons('ক্স'); i += 3; continue; }
    if (at('ch')) {
      if (i === 0 && (at('cha') || at('cho') || at('chu') || at('chl') || at('chr'))) {
        appendCons('ক'); // Chor, Chaos, Chlor, Chrysler
      } else {
        appendCons('খ');
      }
      i += 2;
      continue;
    }
    if (at('ck')) { appendCons('ক'); i += 2; continue; }
    if (at('th')) { appendCons('ট'); i += 2; continue; }
    if (at('ph')) { appendCons('ফ'); i += 2; continue; }
    if (at('qu')) { appendCons('ক্ভ'); i += 2; continue; }
    if (at('pf')) { appendCons('পফ'); i += 2; continue; }
    if (at('dt')) { appendCons('ট'); i += 2; continue; }
    if (at('nk')) { appendCons('ঙ্ক'); i += 2; continue; }
    if (at('ng')) { appendCons('ঙ্গ'); i += 2; continue; }
    if (at('tion')) { appendCons('ৎসিওন', true); i += 4; continue; }

    // ── -ig / -ige / -igen word endings → [ɪç] ──────────────────────

    if (at('igen') && rest() === 4) { emitVowel('ি', 'ই'); appendCons('খেন'); i += 4; continue; }
    if (at('ige') && rest() === 3) { emitVowel('ি', 'ই'); appendCons('খে'); i += 3; continue; }
    if (at('ig') && rest() === 2) { emitVowel('ি', 'ই'); appendCons('খ'); i += 2; continue; }

    // ── -ung word ending → [ʊŋ] ─────────────────────────────────────

    if (at('ung') && rest() === 3) { emitVowel('ু', 'উ'); appendCons('ং'); i += 3; continue; }

    // ── r-vocalization (word-final -er, and er before a consonant) ──

    if (i > 0 && at('er') && (rest() === 2 || !isVowelLetter(w[i + 2]))) {
      // After a consonant use the sign form: Vater → ফাটার, Bilder → বিলডার,
      // Häuser → হয়জার, Bayern → বায়ার্ন; after a vowel: বাউআর.
      if (out.length > 0 && isBnConsonant(out.slice(-1))) out += 'ার';
      else out += 'আর';
      glide = false;
      i += 2;
      continue;
    }

    // ── Diphthongs ──────────────────────────────────────────────────

    if (at('eu') || at('äu')) {
      if (out.length === 0) { out += 'অ' + YA; glide = true; }
      else { out += YA; glide = true; }
      i += 2;
      continue;
    }
    if (at('au')) { emitVowel('াউ', 'আউ'); i += 2; continue; }
    if (at('ei') || at('ai')) { emitVowel('াই', 'আই'); i += 2; continue; }
    if (at('ie')) { emitVowel('ী', 'ঈ'); i += 2; continue; }
    if (at('ee')) { emitVowel('ে', 'এ'); i += 2; continue; }
    if (at('aa')) { emitVowel('া', 'আ'); i += 2; continue; }
    if (at('oo')) { emitVowel('ো', 'ও'); i += 2; continue; }

    // ── Umlauts ─────────────────────────────────────────────────────

    if (at('äh')) { emitVowel('ে', 'এ'); i += 2; continue; }
    if (at('ö')) {
      if (out.length > 0 && out.slice(-1) === 'র') out += 'ো'; // Schröder → শ্রোডার
      else emitVowel('্যো', 'অ্যো');
      i += 1;
      continue;
    }
    if (at('ü')) { emitVowel('ুই', 'উই'); i += 1; continue; }
    if (at('ä')) {
      const pair = w.slice(i + 1, i + 3);
      if (SHORT_AE_CLUSTERS.has(pair)) emitVowel('্যা', 'অ্যা');
      else emitVowel('ে', 'এ');
      i += 1;
      continue;
    }

    // ── Silent lengthening h after a vowel ──────────────────────────

    const next = w[i + 1];
    const afterNext = w[i + 2];
    if (
      'aeiouäöü'.includes(c) &&
      next === 'h' &&
      (afterNext === undefined || !isVowelLetter(afterNext) || afterNext === 'e')
    ) {
      switch (c) {
        case 'a': emitVowel('া', 'আ'); break;
        case 'e': emitVowel('ে', 'এ'); break;
        case 'i': emitVowel('ি', 'ই'); break;
        case 'o': emitVowel('ো', 'ও'); break;
        case 'u': emitVowel('ু', 'উ'); break;
        case 'ä': emitVowel('ে', 'এ'); break;
        case 'ö': emitVowel('্যো', 'অ্যো'); break;
        case 'ü': emitVowel('ুই', 'উই'); break;
      }
      i += 2;
      continue;
    }

    // ── Word-final r after a vowel → য়ার ────────────────────────────

    if (c === 'r' && rest() === 1) {
      appendCons(YA + 'ার', true);
      i += 1;
      continue;
    }

    // ── s / ss / ß voicing ──────────────────────────────────────────

    if (at('ss')) { appendCons('স'); i += 2; continue; }
    if (c === 'ß') { appendCons('স'); i += 1; continue; }
    if (c === 's') {
      if (isVowelLetter(w[i + 1]) && (i === 0 || endsVowelish())) appendCons('জ');
      else appendCons('স');
      i += 1;
      continue;
    }

    // ── z / tz → [ts] ───────────────────────────────────────────────

    if (at('tz')) { appendCons(endsConsonant() ? 'চ' : 'ৎস'); i += 2; continue; }
    if (c === 'z') { appendCons(endsConsonant() ? 'চ' : 'ৎস'); i += 1; continue; }

    // ── y ───────────────────────────────────────────────────────────

    if (c === 'y') {
      if (i === 0) appendCons('য');
      else if (endsVowelish() && isVowelLetter(w[i + 1])) { out += YA; glide = true; }
      else emitVowel('ুই', 'উই');
      i += 1;
      continue;
    }

    // ── v / w / j ───────────────────────────────────────────────────

    if (c === 'v') { appendCons('ফ'); i += 1; continue; }
    if (c === 'w') { appendCons('ভ'); i += 1; continue; }
    if (c === 'j') { appendCons('য'); i += 1; continue; }

    // ── h as an onset ───────────────────────────────────────────────

    if (c === 'h') { appendCons('হ'); i += 1; continue; }

    // ── doubled consonants collapse to one Bengali letter ───────────

    let step = 1;
    if (
      'bdfglmnprtz'.includes(c) &&
      w[i + 1] === c &&
      c !== 'z' // tz handled above; zz is rare
    ) {
      step = 2;
    }

    // ── Final devoicing: b/d/g → প/ট/ক ──────────────────────────────

    if (c === 'b') {
      const devoice = rest() === 1 || (i > 0 && !isVowelLetter(w[i + 1]));
      appendCons(devoice ? 'প' : 'ব');
      i += step;
      continue;
    }
    if (c === 'd') {
      const devoice = rest() === 1 || (i > 0 && !isVowelLetter(w[i + 1]));
      appendCons(devoice ? 'ট' : 'ড');
      i += step;
      continue;
    }
    if (c === 'g') {
      const devoice = rest() === 1 || (i > 0 && !isVowelLetter(w[i + 1]));
      appendCons(devoice ? 'ক' : 'গ');
      i += step;
      continue;
    }

    // ── Remaining single letters ────────────────────────────────────

    switch (c) {
      case 'a': emitVowel('া', 'আ'); break;
      case 'e': emitVowel('ে', 'এ'); break;
      case 'i': emitVowel('ি', 'ই'); break;
      case 'o': emitVowel('ো', 'ও'); break;
      case 'u': emitVowel('ু', 'উ'); break;
      case 'm': appendCons('ম'); break;
      case 'n': appendCons('ন'); break;
      case 'l': appendCons('ল'); break;
      case 'r': appendCons('র'); break;
      case 't': appendCons('ট'); break;
      case 'p': appendCons('প'); break;
      case 'k': appendCons('ক'); break;
      case 'f': appendCons('ফ'); break;
      case 'c': appendCons(i + 1 < w.length && 'eiy'.includes(w[i + 1]) ? 'স' : 'ক'); break;
      case 'x': appendCons('ক্স'); break;
      case 'q': appendCons('ক'); break;
      default:
        skipped += 1;
        break;
    }
    i += step;
  }

  return { text: out.normalize('NFC'), skipped };
}

// ── Sentence / text level ────────────────────────────────────────────

function normalizeChunkKey(chunk: string): string {
  return chunk
    .toLowerCase()
    .replace(/[.,;:!?¡¿"„“”()«»\-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function transliterate(text: string): PronunciationResult {
  if (!text || !text.trim()) {
    return { bengali: '', words: [], confidence: 0, hasUncertain: true };
  }

  // Split into sentence-like chunks so phrases can match per sentence,
  // while punctuation and whitespace are preserved verbatim.
  const chunkRe = /[^.!?…]+(?:[.!?…]+|$)/g;
  const chunks = text.match(chunkRe) || [text];

  const words: PronunciationWord[] = [];
  let out = '';
  let lexCount = 0;
  let wordCount = 0;
  let skippedTotal = 0;

  for (const chunk of chunks) {
    if (!chunk) continue;
    const phraseKey = normalizeChunkKey(chunk);
    const phrase = PHRASES[phraseKey];

    if (phrase) {
      const leading = chunk.match(/^\s*/)?.[0] ?? '';
      out += leading + phrase;
      const trailing = chunk.match(/[.!?…]+$/)?.[0] ?? '';
      out += trailing;
      // Word chips must preserve the ORIGINAL spelling (spec: "word
      // breakdown that preserves original German spelling").
      const chunkWords = tokenize(chunk)
        .filter((t) => t.type === 'word')
        .flatMap((t) => t.text.split(/([-'])/))
        .filter((p) => p && p !== '-' && p !== "'" && p !== '’');
      for (const w of chunkWords) {
        const r = transcribeWord(w);
        words.push({ german: w, bengali: r.bengali, source: 'lexicon' });
        lexCount += 1;
        wordCount += 1;
      }
      continue;
    }

    const tokens = tokenize(chunk);
    for (const t of tokens) {
      if (t.type === 'sep') {
        out += t.text;
        continue;
      }
      const parts = t.text.split(/([-'])/);
      for (const part of parts) {
        if (!part) continue;
        if (part === '-' || part === "'" || part === '’') {
          out += part === '-' ? '-' : '';
          continue;
        }
        const r = transcribeWord(part);
        out += r.bengali;
        words.push({ german: part, bengali: r.bengali, source: r.source });
        wordCount += 1;
        if (r.source === 'lexicon') lexCount += 1;
        skippedTotal += r.skipped;
      }
    }
  }

  const lexRatio = wordCount > 0 ? lexCount / wordCount : 0;
  let confidence = wordCount > 0 ? Math.min(1, 0.75 + 0.25 * lexRatio) : 0;
  if (skippedTotal > 0) confidence = Math.min(confidence, 0.7);
  if (!out.trim()) confidence = 0;

  return {
    bengali: out.normalize('NFC'),
    words,
    confidence,
    hasUncertain: skippedTotal > 0 || !out.trim(),
  };
}
