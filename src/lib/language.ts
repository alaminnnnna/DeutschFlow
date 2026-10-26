import type { InputLang } from './types';

/**
 * Lightweight client + server language detection.
 *
 * Priority:
 *  1. Bengali Unicode block presence  -> 'bn'
 *  2. German marker words + umlauts   -> 'de'
 *  3. everything else                 -> 'en'
 */

const BN_CHAR_RE = /[\u0980-\u09FF]/g;
const LATIN_CHAR_RE = /[A-Za-zÄÖÜäöüß]/g;

const DE_MARKERS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer',
  'und', 'ist', 'sind', 'bin', 'bist', 'war', 'waren', 'habe', 'hast', 'hat', 'haben',
  'ich', 'mich', 'mir', 'du', 'dich', 'dir', 'er', 'ihn', 'ihm', 'sie', 'ihr', 'ihnen',
  'es', 'wir', 'uns', 'nicht', 'kein', 'keine', 'mit', 'auf', 'aus', 'für', 'von', 'zu',
  'zum', 'zur', 'bei', 'nach', 'vor', 'über', 'unter', 'durch', 'ohne', 'um', 'im', 'am',
  'wie', 'was', 'wer', 'wo', 'wann', 'warum', 'woher', 'wohin', 'guten', 'gute', 'morgen',
  'tag', 'abend', 'nacht', 'danke', 'hallo', 'bitte', 'tschüss', 'ja', 'nein', 'heiße',
  'heißen', 'lerne', 'lernen', 'lernt', 'spreche', 'sprechen', 'spricht', 'deutsch',
  'deutsche', 'deutschland', 'gehen', 'geht', 'komme', 'kommst', 'kommen', 'kommt',
  'mache', 'machen', 'macht', 'will', 'wollen', 'möchte', 'kann', 'kannst', 'können',
  'muss', 'müssen', 'sehr', 'gut', 'auch', 'noch', 'schon', 'wieder', 'immer', 'jetzt',
  'heute', 'gestern', 'wasser', 'haus', 'schule', 'straße', 'arbeit', 'arbeiten', 'lieb',
  'liebe', 'lieben', 'freund', 'freundin', 'frau', 'mann', 'kind', 'kinder', 'vater',
  'mutter', 'bruder', 'schwester', 'ja', 'danke', 'wirklich', 'vielleicht', 'alles',
  'etwas', 'nichts', 'alle', 'man', 'jahren', 'sagen', 'sagte', 'dank', 'gerne', 'gern',
]);

const EN_MARKERS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'am', 'be', 'been', 'was', 'were',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your', 'his', 'her', 'its', 'our',
  'their', 'me', 'him', 'us', 'them', 'name', 'hello', 'hi', 'hey', 'good', 'morning',
  'evening', 'night', 'thanks', 'thank', 'please', 'yes', 'no', 'not', 'what', 'how',
  'where', 'when', 'why', 'who', 'learn', 'learning', 'learned', 'speak', 'speaking',
  'speak', 'want', 'can', 'could', 'have', 'has', 'had', 'do', 'does', 'did', 'with',
  'from', 'to', 'for', 'on', 'in', 'at', 'of', 'today', 'tomorrow', 'yesterday', 'water',
  'house', 'school', 'work', 'working', 'love', 'friend', 'woman', 'man', 'child', 'this',
  'that', 'these', 'those', 'very', 'much', 'many', 'now', 'later', 'always', 'again',
  'german', 'english', 'language', 'saying', 'say', 'said', 'nice', 'day', 'time', 'year',
]);

export function detectLanguage(text: string): InputLang {
  const trimmed = text.trim();
  if (!trimmed) return 'en';

  const bnChars = (trimmed.match(BN_CHAR_RE) || []).length;
  const latinChars = (trimmed.match(LATIN_CHAR_RE) || []).length;
  const total = bnChars + latinChars;
  if (total === 0) return 'en';
  if (bnChars > 0 && bnChars / total >= 0.25) return 'bn';

  const words = trimmed
    .toLowerCase()
    .split(/[^\p{L}\u00C0-\u024F]+/u)
    .filter(Boolean);

  let deScore = 0;
  let enScore = 0;
  for (const w of words) {
    if (DE_MARKERS.has(w)) deScore += 2;
    if (EN_MARKERS.has(w)) enScore += 2;
  }

  // umlauts / ß are strong German signals
  const umlauts = (trimmed.match(/[äöüß]/gi) || []).length;
  deScore += Math.min(umlauts, 4);

  // common German graphotactic patterns
  if (/\b[a-zäöüß]*sch[a-zäöüß]*\b/i.test(trimmed)) deScore += 1;
  if (/\b[a-zäöüß]*(?:ung|chen|heit|keit|lich)\b/i.test(trimmed)) deScore += 1;
  if (/\b[a-zäöüß]*(?:ei|ie|tz)\b/i.test(trimmed)) deScore += 0.5;

  return deScore > enScore ? 'de' : 'en';
}

export const LANG_LABELS: Record<InputLang, string> = {
  bn: 'বাংলা',
  en: 'English',
  de: 'Deutsch',
};

export const LANG_HINTS: Record<InputLang, string> = {
  bn: 'বাংলা শনাক্ত হয়েছে → জার্মানে অনুবাদ হবে',
  en: 'English detected → will translate to German',
  de: 'Deutsch erkannt → সরাসরি জার্মান শোনা হবে',
};
