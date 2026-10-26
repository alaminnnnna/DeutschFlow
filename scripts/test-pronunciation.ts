/**
 * Engine validation harness — run with: bun run scripts/test-pronunciation.ts
 */

import { transliterate } from '../src/lib/pronunciation/engine';

const CASES: Array<[string, string | null]> = [
  // Canonical examples from the product spec — must match exactly.
  ['Hallo', 'হালো'],
  ['Danke', 'ডাঙ্কে'],
  ['Guten Morgen', 'গুটেন মর্গেন'],
  ['Wie geht es dir?', 'ভি গেট এস ডিয়ার?'],
  ['Ich heiße Amin', 'ইখ হাইসে আমিন'],
  ['Ich lerne Deutsch.', 'ইখ লার্নে ডয়চ.'],
  // Rule engine showcase.
  ['Guten Tag', 'গুটেন টাক'],
  ['Gute Nacht', 'গুটে নাখট'],
  ['Auf Wiedersehen', 'আউফ ভীডারজেন'],
  ['Tschüss', 'চ্যুস'],
  ['Ich verstehe nicht', 'ইখ ফারশটে নিখট'],
  ['der', 'ডেয়া'],
  ['die', 'ডি'],
  ['das', 'দাস'],
  ['und', 'উন্ট'],
  ['nicht', 'নিখট'],
  ['ist', 'ইসট'],
  ['neu', 'নয়'],
  ['Deutschland', 'দয়চলান্ট'],
  ['Straße', 'শট্রাসে'],
  ['schön', 'শ্যোন'],
  ['fünf', 'ফুইন্ফ'],
  ['zwanzig', 'ৎসভানৎসিখ'],
  ['Zeit', 'ৎসাইট'],
  ['Häuser', 'হয়জার'],
  ['Wasser', 'ভাসার'],
  ['Vater', 'ফাটার'],
  ['Mutter', 'মুটার'],
  ['Männer', 'ম্যানার'],
  ['werden', 'ভার্ডেন'],
  ['verstehen', 'ফারশটেহেন'],
  ['spielen', 'শপীলেন'],
  ['wichtig', 'ভিখটিখ'],
  ['Wohnung', 'ভোনুং'],
  ['gehen', 'গেন'],
  ['sehen', 'সেন'],
  ['sehr', 'জেয়ার'],
  ['Uhr', 'উয়ার'],
  ['hier', 'হিয়ার'],
  ['ihr', 'ঈয়ার'],
  ['Dir', 'ডিয়ার'],
  ['Bayern', 'বায়ার্ন'],
  ['Liebe', 'লীবে'],
  ['sieben', 'জীবেন'],
  ['Sechs', 'জেক্স'],
  ['Buch', 'বুখ'],
  ['machen', 'মাখেন'],
  ['Nacht', 'নাখট'],
  ['Bach', 'বাখ'],
  ['Stadt', 'শটাট'],
  ['beste', 'বেস্টে'],
  ['Zug', 'ৎসুক'],
  ['sagt', 'জাক্ট'],
  ['ob', 'ওপ'],
  ['Wald', 'ভাল্ট'],
  ['Kind', 'কিন্ট'],
  ['jetzt', 'যেৎসট'],
  ['Katze', 'কাট্সে'],
  ['Entschuldigung', 'এনটশুলডিগুং'],
  ['Eule', 'অয়লে'],
  ['Schule', 'শুলে'],
  ['Quelle', 'ক্ভেলে'],
  ['Pferd', 'পফাট'],
  ['Bilder', 'বিল্ডার'],
  ['Rot', 'রোট'],
  ['grün', 'গ্রুইন'],
  ['Natur', 'নাটুয়ার'],
  ['Kaffee', 'কাফে'],
  ['Brief', 'ব্রীফ'],
  ['nie', 'নি'],
  ['Eis', 'আইস'],
  ['Haus', 'হাউস'],
  ['ein', 'আইন'],
  ['mein', 'মাইন'],
  ['Sonne', 'জোনে'],
  ['lesen', 'লেজেন'],
  ['Wiese', 'ভীজে'],
  ['Köln', 'ক্যোল্ন'],
  ['Schröder', 'শ্রোডার'],
  ['Goethe', 'গ্যোটে'],
  ['München', 'মিউনিখ'],
  ['Mozart', 'মোৎসার্ট'],
  ['Nation', 'নাৎসিওন'],
];

let pass = 0;
let fail = 0;
for (const [input, expected] of CASES) {
  const got = transliterate(input).bengali;
  if (expected === null) {
    console.log(`~ ${input.padEnd(18)} -> ${got}`);
    continue;
  }
  if (got === expected) {
    pass += 1;
  } else {
    fail += 1;
    console.log(`FAIL ${input.padEnd(18)} expected ${expected}  got ${got}`);
  }
}
console.log(`\n${pass} passed, ${fail} failed`);

// Full-sentence smoke tests
const sentences = [
  'Guten Morgen! Wie geht es dir?',
  'Ich heiße Amin. Ich lerne Deutsch.',
  'Mein Name ist Anna. Ich wohne in Berlin.',
  'Sprichst du Englisch?',
  'Das Wetter ist heute sehr schön.',
];
for (const s of sentences) {
  const r = transliterate(s);
  console.log(`\nDE: ${s}\nBN: ${r.bengali}`);
}
