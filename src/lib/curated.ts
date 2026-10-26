/**
 * Compact curated A1 discovery collections.
 *
 * These are hand-written, verified entries (word → Bangla meaning) for the
 * discovery surface — word of the day and topic chips. They are NOT scraped
 * from any licensed dataset and carry no external licensing claims.
 */

import type { CefrLevel, PartOfSpeech } from './vocabulary';

export interface CuratedWord {
  german: string;
  bangla: string;
  pos: PartOfSpeech;
  article?: string | null;
  level: CefrLevel;
  topic: string;
}

export const TOPICS = [
  'অভিবাদন',
  'পরিবার',
  'সংখ্যা',
  'খাবার',
  'সময়',
  'ভ্রমণ',
  'বাড়ি',
  'স্কুল-কাজ',
  'ক্রিয়া',
  'বিশেষণ',
  'প্রশ্ন',
] as const;

export const CURATED: CuratedWord[] = [
  // ── অভিবাদন (greetings) ─────────────────────────────────────────────
  { german: 'Hallo', bangla: 'হ্যালো / নমস্কার', pos: 'phrase', level: 'A1', topic: 'অভিবাদন' },
  { german: 'Guten Morgen', bangla: 'শুভ সকাল', pos: 'phrase', level: 'A1', topic: 'অভিবাদন' },
  { german: 'Guten Tag', bangla: 'শুভ দিন', pos: 'phrase', level: 'A1', topic: 'অভিবাদন' },
  { german: 'Guten Abend', bangla: 'শুভ সন্ধ্যা', pos: 'phrase', level: 'A1', topic: 'অভিবাদন' },
  { german: 'Danke', bangla: 'ধন্যবাদ', pos: 'phrase', level: 'A1', topic: 'অভিবাদন' },
  { german: 'Bitte', bangla: 'অনুগ্রহ করে / স্বাগতম', pos: 'phrase', level: 'A1', topic: 'অভিবাদন' },
  { german: 'Ja', bangla: 'হ্যাঁ', pos: 'other', level: 'A1', topic: 'অভিবাদন' },
  { german: 'Nein', bangla: 'না', pos: 'other', level: 'A1', topic: 'অভিবাদন' },
  { german: 'Tschüss', bangla: 'বিদায়', pos: 'phrase', level: 'A1', topic: 'অভিবাদন' },
  { german: 'Entschuldigung', bangla: 'ক্ষমা করবেন', pos: 'phrase', level: 'A1', topic: 'অভিবাদন' },

  // ── পরিবার (family) ─────────────────────────────────────────────────
  { german: 'die Familie', bangla: 'পরিবার', pos: 'noun', article: 'die', level: 'A1', topic: 'পরিবার' },
  { german: 'der Vater', bangla: 'বাবা', pos: 'noun', article: 'der', level: 'A1', topic: 'পরিবার' },
  { german: 'die Mutter', bangla: 'মা', pos: 'noun', article: 'die', level: 'A1', topic: 'পরিবার' },
  { german: 'der Bruder', bangla: 'ভাই', pos: 'noun', article: 'der', level: 'A1', topic: 'পরিবার' },
  { german: 'die Schwester', bangla: 'বোন', pos: 'noun', article: 'die', level: 'A1', topic: 'পরিবার' },
  { german: 'das Kind', bangla: 'শিশু', pos: 'noun', article: 'das', level: 'A1', topic: 'পরিবার' },
  { german: 'der Freund', bangla: 'বন্ধু (পুরুষ)', pos: 'noun', article: 'der', level: 'A1', topic: 'পরিবার' },
  { german: 'die Freundin', bangla: 'বন্ধু (মহিলা)', pos: 'noun', article: 'die', level: 'A1', topic: 'পরিবার' },
  { german: 'der Sohn', bangla: 'ছেলে সন্তান', pos: 'noun', article: 'der', level: 'A1', topic: 'পরিবার' },
  { german: 'die Tochter', bangla: 'মেয়ে সন্তান', pos: 'noun', article: 'die', level: 'A1', topic: 'পরিবার' },

  // ── সংখ্যা (numbers) ────────────────────────────────────────────────
  { german: 'eins', bangla: 'এক', pos: 'number', level: 'A1', topic: 'সংখ্যা' },
  { german: 'zwei', bangla: 'দুই', pos: 'number', level: 'A1', topic: 'সংখ্যা' },
  { german: 'drei', bangla: 'তিন', pos: 'number', level: 'A1', topic: 'সংখ্যা' },
  { german: 'vier', bangla: 'চার', pos: 'number', level: 'A1', topic: 'সংখ্যা' },
  { german: 'fünf', bangla: 'পাঁচ', pos: 'number', level: 'A1', topic: 'সংখ্যা' },
  { german: 'zehn', bangla: 'দশ', pos: 'number', level: 'A1', topic: 'সংখ্যা' },
  { german: 'zwanzig', bangla: 'বিশ', pos: 'number', level: 'A1', topic: 'সংখ্যা' },
  { german: 'hundert', bangla: 'শত', pos: 'number', level: 'A1', topic: 'সংখ্যা' },
  { german: 'tausend', bangla: 'হাজার', pos: 'number', level: 'A1', topic: 'সংখ্যা' },
  { german: 'null', bangla: 'শূন্য', pos: 'number', level: 'A1', topic: 'সংখ্যা' },

  // ── খাবার (food) ────────────────────────────────────────────────────
  { german: 'das Brot', bangla: 'রুটি', pos: 'noun', article: 'das', level: 'A1', topic: 'খাবার' },
  { german: 'das Wasser', bangla: 'পানি', pos: 'noun', article: 'das', level: 'A1', topic: 'খাবার' },
  { german: 'die Milch', bangla: 'দুধ', pos: 'noun', article: 'die', level: 'A1', topic: 'খাবার' },
  { german: 'der Kaffee', bangla: 'কফি', pos: 'noun', article: 'der', level: 'A1', topic: 'খাবার' },
  { german: 'der Tee', bangla: 'চা', pos: 'noun', article: 'der', level: 'A1', topic: 'খাবার' },
  { german: 'der Apfel', bangla: 'আপেল', pos: 'noun', article: 'der', level: 'A1', topic: 'খাবার' },
  { german: 'der Reis', bangla: 'ভাত', pos: 'noun', article: 'der', level: 'A1', topic: 'খাবার' },
  { german: 'das Fleisch', bangla: 'মাংস', pos: 'noun', article: 'das', level: 'A1', topic: 'খাবার' },
  { german: 'das Gemüse', bangla: 'সবজি', pos: 'noun', article: 'das', level: 'A1', topic: 'খাবার' },
  { german: 'das Obst', bangla: 'ফল', pos: 'noun', article: 'das', level: 'A1', topic: 'খাবার' },

  // ── সময় (time) ──────────────────────────────────────────────────────
  { german: 'heute', bangla: 'আজ', pos: 'adverb', level: 'A1', topic: 'সময়' },
  { german: 'morgen', bangla: 'আগামীকাল', pos: 'adverb', level: 'A1', topic: 'সময়' },
  { german: 'gestern', bangla: 'গতকাল', pos: 'adverb', level: 'A1', topic: 'সময়' },
  { german: 'der Tag', bangla: 'দিন', pos: 'noun', article: 'der', level: 'A1', topic: 'সময়' },
  { german: 'die Woche', bangla: 'সপ্তাহ', pos: 'noun', article: 'die', level: 'A1', topic: 'সময়' },
  { german: 'der Monat', bangla: 'মাস', pos: 'noun', article: 'der', level: 'A1', topic: 'সময়' },
  { german: 'das Jahr', bangla: 'বছর', pos: 'noun', article: 'das', level: 'A1', topic: 'সময়' },
  { german: 'die Uhrzeit', bangla: 'সময় (ঘড়া)', pos: 'noun', article: 'die', level: 'A1', topic: 'সময়' },
  { german: 'jetzt', bangla: 'এখন', pos: 'adverb', level: 'A1', topic: 'সময়' },
  { german: 'immer', bangla: 'সবসময়', pos: 'adverb', level: 'A1', topic: 'সময়' },

  // ── ভ্রমণ (travel) ──────────────────────────────────────────────────
  { german: 'der Bahnhof', bangla: 'রেলস্টেশন', pos: 'noun', article: 'der', level: 'A1', topic: 'ভ্রমণ' },
  { german: 'der Zug', bangla: 'ট্রেন', pos: 'noun', article: 'der', level: 'A1', topic: 'ভ্রমণ' },
  { german: 'das Auto', bangla: 'গাড়ি', pos: 'noun', article: 'das', level: 'A1', topic: 'ভ্রমণ' },
  { german: 'das Flugzeug', bangla: 'বিমান', pos: 'noun', article: 'das', level: 'A1', topic: 'ভ্রমণ' },
  { german: 'die Straße', bangla: 'রাস্তা', pos: 'noun', article: 'die', level: 'A1', topic: 'ভ্রমণ' },
  { german: 'das Ticket', bangla: 'টিকেট', pos: 'noun', article: 'das', level: 'A1', topic: 'ভ্রমণ' },
  { german: 'das Hotel', bangla: 'হোটেল', pos: 'noun', article: 'das', level: 'A1', topic: 'ভ্রমণ' },
  { german: 'die Stadt', bangla: 'শহর', pos: 'noun', article: 'die', level: 'A1', topic: 'ভ্রমণ' },
  { german: 'das Land', bangla: 'দেশ', pos: 'noun', article: 'das', level: 'A1', topic: 'ভ্রমণ' },
  { german: 'links / rechts', bangla: 'বামে / ডানে', pos: 'adverb', level: 'A1', topic: 'ভ্রমণ' },

  // ── বাড়ি (home) ─────────────────────────────────────────────────────
  { german: 'das Haus', bangla: 'বাড়ি', pos: 'noun', article: 'das', level: 'A1', topic: 'বাড়ি' },
  { german: 'das Zimmer', bangla: 'কক্ষ', pos: 'noun', article: 'das', level: 'A1', topic: 'বাড়ি' },
  { german: 'die Küche', bangla: 'রান্নাঘর', pos: 'noun', article: 'die', level: 'A1', topic: 'বাড়ি' },
  { german: 'das Bad', bangla: 'বাথরুম', pos: 'noun', article: 'das', level: 'A1', topic: 'বাড়ি' },
  { german: 'der Tisch', bangla: 'টেবিল', pos: 'noun', article: 'der', level: 'A1', topic: 'বাড়ি' },
  { german: 'der Stuhl', bangla: 'চেয়ার', pos: 'noun', article: 'der', level: 'A1', topic: 'বাড়ি' },
  { german: 'das Bett', bangla: 'বিছানা', pos: 'noun', article: 'das', level: 'A1', topic: 'বাড়ি' },
  { german: 'die Tür', bangla: 'দরজা', pos: 'noun', article: 'die', level: 'A1', topic: 'বাড়ি' },
  { german: 'das Fenster', bangla: 'জানালা', pos: 'noun', article: 'das', level: 'A1', topic: 'বাড়ি' },
  { german: 'die Lampe', bangla: 'বাতি', pos: 'noun', article: 'die', level: 'A1', topic: 'বাড়ি' },

  // ── স্কুল-কাজ (school & work) ───────────────────────────────────────
  { german: 'die Schule', bangla: 'স্কুল', pos: 'noun', article: 'die', level: 'A1', topic: 'স্কুল-কাজ' },
  { german: 'der Lehrer', bangla: 'শিক্ষক', pos: 'noun', article: 'der', level: 'A1', topic: 'স্কুল-কাজ' },
  { german: 'der Student', bangla: 'ছাত্র', pos: 'noun', article: 'der', level: 'A1', topic: 'স্কুল-কাজ' },
  { german: 'das Buch', bangla: 'বই', pos: 'noun', article: 'das', level: 'A1', topic: 'স্কুল-কাজ' },
  { german: 'die Arbeit', bangla: 'কাজ', pos: 'noun', article: 'die', level: 'A1', topic: 'স্কুল-কাজ' },
  { german: 'das Büro', bangla: 'অফিস', pos: 'noun', article: 'das', level: 'A1', topic: 'স্কুল-কাজ' },
  { german: 'die Sprache', bangla: 'ভাষা', pos: 'noun', article: 'die', level: 'A1', topic: 'স্কুল-কাজ' },
  { german: 'das Wort', bangla: 'শব্দ', pos: 'noun', article: 'das', level: 'A1', topic: 'স্কুল-কাজ' },
  { german: 'die Frage', bangla: 'প্রশ্ন', pos: 'noun', article: 'die', level: 'A1', topic: 'স্কুল-কাজ' },
  { german: 'die Antwort', bangla: 'উত্তর', pos: 'noun', article: 'die', level: 'A1', topic: 'স্কুল-কাজ' },

  // ── ক্রিয়া (verbs) ──────────────────────────────────────────────────
  { german: 'sein', bangla: 'হওয়া', pos: 'verb', level: 'A1', topic: 'ক্রিয়া' },
  { german: 'haben', bangla: 'থাকা (আমার)', pos: 'verb', level: 'A1', topic: 'ক্রিয়া' },
  { german: 'gehen', bangla: 'যাওয়া', pos: 'verb', level: 'A1', topic: 'ক্রিয়া' },
  { german: 'kommen', bangla: 'আসা', pos: 'verb', level: 'A1', topic: 'ক্রিয়া' },
  { german: 'sprechen', bangla: 'বলা / কথা বলা', pos: 'verb', level: 'A1', topic: 'ক্রিয়া' },
  { german: 'lernen', bangla: 'শেখা', pos: 'verb', level: 'A1', topic: 'ক্রিয়া' },
  { german: 'essen', bangla: 'খাওয়া', pos: 'verb', level: 'A1', topic: 'ক্রিয়া' },
  { german: 'trinken', bangla: 'পান করা', pos: 'verb', level: 'A1', topic: 'ক্রিয়া' },
  { german: 'arbeiten', bangla: 'কাজ করা', pos: 'verb', level: 'A1', topic: 'ক্রিয়া' },
  { german: 'verstehen', bangla: 'বোঝা', pos: 'verb', level: 'A1', topic: 'ক্রিয়া' },

  // ── বিশেষণ (adjectives) ─────────────────────────────────────────────
  { german: 'gut', bangla: 'ভালো', pos: 'adjective', level: 'A1', topic: 'বিশেষণ' },
  { german: 'schlecht', bangla: 'খারাপ', pos: 'adjective', level: 'A1', topic: 'বিশেষণ' },
  { german: 'groß', bangla: 'বড় / লম্বা', pos: 'adjective', level: 'A1', topic: 'বিশেষণ' },
  { german: 'klein', bangla: 'ছোট', pos: 'adjective', level: 'A1', topic: 'বিশেষণ' },
  { german: 'neu', bangla: 'নতুন', pos: 'adjective', level: 'A1', topic: 'বিশেষণ' },
  { german: 'alt', bangla: 'পুরনো / বয়স্ক', pos: 'adjective', level: 'A1', topic: 'বিশেষণ' },
  { german: 'schön', bangla: 'সুন্দর', pos: 'adjective', level: 'A1', topic: 'বিশেষণ' },
  { german: 'teuer', bangla: 'দামি', pos: 'adjective', level: 'A1', topic: 'বিশেষণ' },
  { german: 'billig', bangla: 'সস্তা', pos: 'adjective', level: 'A1', topic: 'বিশেষণ' },
  { german: 'leicht', bangla: 'সহজ / হালকা', pos: 'adjective', level: 'A1', topic: 'বিশেষণ' },

  // ── প্রশ্ন (questions) ──────────────────────────────────────────────
  { german: 'Wer', bangla: 'কে', pos: 'question', level: 'A1', topic: 'প্রশ্ন' },
  { german: 'Was', bangla: 'কী', pos: 'question', level: 'A1', topic: 'প্রশ্ন' },
  { german: 'Wo', bangla: 'কোথায়', pos: 'question', level: 'A1', topic: 'প্রশ্ন' },
  { german: 'Wann', bangla: 'কখন', pos: 'question', level: 'A1', topic: 'প্রশ্ন' },
  { german: 'Warum', bangla: 'কেন', pos: 'question', level: 'A1', topic: 'প্রশ্ন' },
  { german: 'Wie', bangla: 'কেমন / কীভাবে', pos: 'question', level: 'A1', topic: 'প্রশ্ন' },
  { german: 'Woher', bangla: 'কোথা থেকে', pos: 'question', level: 'A1', topic: 'প্রশ্ন' },
  { german: 'Wohin', bangla: 'কোথায় (গন্তব্যে)', pos: 'question', level: 'A1', topic: 'প্রশ্ন' },
  { german: 'Wie viel', bangla: 'কত', pos: 'question', level: 'A1', topic: 'প্রশ্ন' },
  { german: 'Wie viele', bangla: 'কয়টা', pos: 'question', level: 'A1', topic: 'প্রশ্ন' },
];

/** Deterministic word of the day — identical on the server and every client.
 *  A local-timezone day index can differ between the SSR host and the device
 *  (e.g. server on UTC, user on UTC+6), which crashes React hydration at day
 *  boundaries with two different words — so the index is derived from UTC,
 *  which both sides always agree on. */
export function wordOfTheDay(now = new Date()): CuratedWord {
  const utcDay = Math.floor(now.getTime() / 86_400_000);
  return CURATED[utcDay % CURATED.length];
}

export function curatedByTopic(topic: string): CuratedWord[] {
  return CURATED.filter((w) => w.topic === topic);
}
