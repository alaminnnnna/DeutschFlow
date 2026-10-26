# DeutschFlow

**German Listening & Vocabulary Platform for Bengali-speaking learners (A1 → B1).**

Type English, বাংলা or Deutsch in one box → click **Listen Now** once → hear
German instantly, see a Bengali-script pronunciation guide, the Bangla meaning
and a word-by-word breakdown — then save words to your vocabulary and review
them with spaced repetition. One action, the whole learning loop.

> **Type → Detect → Hear German → Bengali pronunciation → Meaning → Save → Review → Remember.**

---

## Features

### Listen (the core workspace)
- **One-click flow** — language auto-detection (bn / en / de), translation,
  pronunciation and audio playback all fire from a single submit. Enter
  submits, Shift+Enter makes a new line.
- **German passthrough** — German input is detected and played directly, no
  unnecessary translation (a Bangla meaning is still fetched best-effort).
- **God-level German → Bengali pronunciation engine** — a hybrid G2P system
  (phrase lexicon → word lexicon → phonetic rule engine) that models real
  German phonology. Fully offline, instant, replay-safe.
- **Word-by-word chips** — tap a chip to hear that word alone, see its
  Bengali approximation *and* its contextual Bangla meaning (fetched
  progressively after audio starts, never blocking it), save it with one
  click, or flag a wrong approximation and set your own correction.
- **Pronunciation confidence + source** — each result shows whether it came
  from the curated lexicon (high confidence) or the rule engine; your
  personal corrections are always marked as such.
- **Speaking practice (optional)** — with browser Speech Recognition, hear
  the sentence, speak it, and see which words were recognized. It explicitly
  does NOT measure accent quality — no fake phonetic scores.
- **Web Speech API audio** — prefers a `de-DE` voice, scores installed voices,
  reliable cancellation (no overlapping speech), 0.75× / 1× / 1.25× speeds
  applied live, replay without any network call, iOS unlock via priming.

### Vocabulary (first-class library)
- One-click save from the result card, any word chip, the word of the day or
  the A1 discovery collections.
- Grammar fields (article, plural, part of speech, CEFR level) that stay
  honestly empty when unknown — the app never fabricates linguistic data.
- Search-as-you-type across German *and* Bangla (umlaut-folded), filters by
  level / part of speech / favorites / due, sorting by date, alphabet, review.
- Edit and two-step delete; duplicate saves merge into the existing entry
  (fill empty fields, append a new example) instead of creating copies.
- Export as JSON or CSV, import JSON, bulk reset.

### Review (SM-2 spaced repetition)
- Again / Hard / Good / Easy ratings with a documented SM-2 variant
  (ease factor, growing intervals, 10-minute relearn queue).
- Daily target configurable in Settings; missing days never punish you —
  overdue cards are still exactly one review away.
- Session progress bar, quick exit that preserves everything already rated.

### History, Progress, Settings
- **History** — every processed sentence (searchable, removable, click to
  replay instantly from cache), retention configurable (30/100/200).
- **Progress** — honest counters only: streak of active days, saved words,
  due count, a 7-day listens/reviews bar, word of the day and curated A1
  topic collections. No fabricated scores or minutes.
- **Settings** — theme (light/dark/system), German voice picker, default
  speed, autoplay toggle, review target, history retention, cache clearing,
  export/import and a guarded full reset.

### Caching architecture
- **Layer 1** — bounded in-memory LRU for translations, glossaries and
  pronunciations.
- **Layer 2** — IndexedDB persistent cache with versioned keys
  (`schema|kind|from|to|text`) and TTLs, so pronunciation-rule updates or
  provider changes invalidate stale entries automatically.
- Identical in-flight requests are deduplicated; cached results replay
  instantly with zero network calls.

---

## The pronunciation engine (`src/lib/pronunciation/`)

Letter-by-letter transliteration sounds terrible, so the engine implements
actual German phonology rules:

| Rule | Example |
| --- | --- |
| Final devoicing (Auslautverhärtung) | *Tag → টাক*, *und → উন্ট*, *ob → ওপ* |
| `sp`/`st` → [ʃ] initially & after prefixes (not inside *beste*) | *Straße → শট্রাসে*, *verstehen → ফারশটেহেন* |
| `ch` allophony + `chs` | *Buch → বুখ*, *ich → ইখ*, *sechs → জেক্স* |
| `z`/`tz` → [ts] | *Zeit → ৎসাইট*, *jetzt → যেৎসট* |
| s-voicing (initial/intervocalic) | *Sonne → জোনে*, *lesen → লেজেন*, *Haus → হাউস* |
| w/v swap | *Wasser → ভাসার*, *Vater → ফাটার* |
| r-vocalization | *dir → ডিয়ার*, *Vater → ফাটার*, *werden → ভার্ডেন*, *Uhr → উয়ার* |
| Silent lengthening h | *gehen → গেন*, *Wohnung → ভোনুং* |
| Diphthongs | *neu → নয়*, *Häuser → হয়জার*, *Stein → স্টাইন* |
| Umlauts | *fünf → ফুইন্ফ*, *schön → শ্যোন*, *Männer → ম্যানার* |
| n-assimilation, `-ung`, `-ig` | *Danke → ডাঙ্কে*, *Zeitung → ৎসাইটুং*, *zwanzig → ৎসভানৎসিখ* |
| Bengali conjunct assembly | automatic virama clusters (ন্ড, র্গ, ন্ফ), glide handling |

The output is always labelled as an **approximate teaching aid** — the UI
tells learners to listen to the audio for the real sound. The engine sits
behind a `PronunciationProvider` interface, so it can be swapped or upgraded
(e.g. an AI transcription service) without touching the UI. Run the test
suites with:

```bash
bun test                              # 65 unit tests (engine, detection, SM-2, vocab, cache)
bun run scripts/test-pronunciation.ts # 83-assertion G2P harness with sentence smoke tests
```

## Translation providers

The client only talks to our own route (`POST /api/translate`). The server
chains providers until one succeeds — **no API key is required out of the
box**:

1. **Built-in LLM** — via `z-ai-web-dev-sdk` (server-side only, best quality)
2. **MyMemory** — free, keyless
3. **Google gtx** — keyless endpoint
4. **DeepL** — optional, set `DEEPL_API_KEY` (see `.env.example`)

A second route (`POST /api/glossary`) produces contextual Bangla meanings for
individual words of a German sentence — also server-side, also cached.
Secrets live only in environment variables on the server and are never
shipped to the client.

## Getting started

```bash
bun install
bun run dev        # http://localhost:3000
```

- `bun run lint` — ESLint
- `bun test` — unit tests
- `bun run scripts/test-pronunciation.ts` — G2P harness
- `bun run db:push` — only if you add Prisma models (the app needs no database)

## Project structure

```
src/
  app/
    page.tsx                  # section routing + listening flow orchestration
    api/translate/route.ts    # server translation endpoint (provider chain)
    api/glossary/route.ts     # per-word Bangla meanings (LLM, cached)
  components/deutschflow/     # app shell, views, cards, chips, dialogs
  lib/
    pronunciation/            # lexicon + phonetic rule engine (the core)
    speech.ts                 # Web Speech API engine (voices, queue, speeds)
    speech-client.ts          # app-wide speech singleton + reactive store
    language.ts               # bn/en/de detection
    translation/              # client wrapper (cached) + server providers
    vocabulary.ts             # entry model, store, search, export/import
    review.ts                 # SM-2 scheduling (pure, testable)
    cache.ts                  # LRU + IndexedDB cache with versioned keys
    storage/idb.ts            # minimal IndexedDB wrapper (memory fallback)
    overrides.ts              # personal pronunciation corrections
    curated.ts                # A1 discovery collections + word of the day
    stats.ts                  # honest activity counters
    settings.ts               # persisted preferences
    history.ts                # listening history (localStorage)
    types.ts                  # shared TypeScript types
scripts/test-pronunciation.ts # G2P test harness
src/__tests__/                # bun unit tests
```

## Browser support

Audio uses the Web Speech API: current desktop Chrome/Edge give the best
German voices; Safari works on macOS/iOS; Android Chrome depends on the
installed TTS engine. Voice quality genuinely varies per device — the
settings view lists every German voice found on the system and lets you pick
one, and the app says so honestly when no German voice exists. Speaking
practice additionally needs Speech Recognition (Chrome-family) and is hidden
elsewhere; the rest of the app never depends on it.

## Deployment

Any Node host (Vercel, Fly, Docker) works. No database, no auth, no external
state — vocabulary, history and preferences stay in the browser
(IndexedDB + localStorage). Configure `DEEPL_API_KEY` only if you want DeepL
in the translation chain.
