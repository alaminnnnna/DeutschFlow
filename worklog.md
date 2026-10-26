# Worklog

---
Task ID: 1
Agent: main (Z.ai)
Task: Build DeutschFlow — German Listening & Pronunciation web app for Bengali-speaking A1 beginners, with a "god-level" German→Bengali pronunciation algorithm.

Work Log:
- Loaded fullstack-dev skill; ran init script (Next.js 16 + TS + Tailwind 4 + shadcn/ui scaffold on port 3000).
- Analyzed the user's spec: one-click flow (type → Listen Now → German audio + Bengali pronunciation + Bangla meaning), Web Speech API, localStorage history, light/dark, 320px-safe, lucide icons only.
- Built god-level G2P engine `src/lib/pronunciation/engine.ts` (~500 lines): tokenizer + phrase lexicon + word lexicon (~380 entries) + context-sensitive rule scanner implementing German phonology: final devoicing (Tag→টাক), prefix-aware sp/st→শ (verstehen→ফারশটেহেন but beste→বেস্টে), ch allophony + chs, z/tz→ৎস, s-voicing (Sonne→জোনে), w/v swap, r-vocalization (dir→ডিয়ার, werden→ভার্ডেন, -er→ার sign form), silent lengthening h, diphthongs eu/äu→য় glide (Häuser→হয়জার), ü→ুই, ö→্যো, ä long/short, nk→ঙ্ক (Danke→ডাঙ্কে), -ung→ুং, -ig→িখ, Bengali virama conjunct assembly + glide handling, NFC normalization for য়.
- Test harness `scripts/test-pronunciation.ts`: 83 assertions — ALL PASS. Reproduces every canonical example from the user's spec exactly (Guten Morgen! Wie geht es dir? → গুটেন মর্গেন! ভি গেট এস ডিয়ার?).
- Web Speech engine `src/lib/speech.ts`: German voice scoring (de-DE > de-*, natural/Google bonus), cancellation before every playback, sentence chunking, 0.75/1/1.25× rate, pause/resume, iOS prime() unlock, honest error surfacing.
- Language detection `src/lib/language.ts` (Bengali Unicode block → bn; German marker words + umlaut scoring → de; else en).
- Translation: `POST /api/translate` with server-side provider chain. Tested reachability: Google gtx blocked in sandbox, MyMemory works but returned a wrong TM match (0.98 match, wrong text) → reordered chain to LLM (z-ai-web-dev-sdk, ~1s, correct + natural) → MyMemory → Google → optional DeepL via DEEPL_API_KEY. Keys stay server-side; .env.example added.
- UI: warm-cream/deep-navy/green token system in globals.css (light + dark), font-bangla/font-german utilities, eq-bar + fade-up animations. Components: Header (voice settings popover + CSS-driven theme toggle), Hero (A1 badge), InputCard (auto-detect badge, Enter/Shift+Enter, loading state), ResultCard (German serif text + copy, accent Bengali pronunciation + approximate disclaimer, Bangla meaning, play/pause/replay, speed pills, word-by-word chips), EmptyState (3 clickable examples), HistoryList (localStorage, max 30, click-to-replay, two-step clear), footer (mt-auto sticky).
- page.tsx orchestration: stale-response guard (requestRef), duplicate-submission guard, history add/dedupe, rate change re-speaks live, voice picker persisted.
- Fixed lint errors (react-hooks/refs, set-state-in-effect) via CSS icon swap + queueMicrotask deferral. Lint now passes.
- Verified API: bn "সুপ্রভাত! তুমি কেমন আছ?" → "Guten Morgen! Wie geht es dir?" ✓; en "I am learning German" → "Ich lerne Deutsch" ✓; de passthrough + de→bn meaning ✓; empty → 400 ✓.
- Agent-browser E2E: example click → result + history ✓; Bangla flow "আমি জার্মান শিখছি" → "Ich lerne Deutsch" → "ইখ লার্নে ডয়চ" ✓; English flow ✓; word chips (ich→ইখ, lerne→লার্নে, deutsch→ডয়চ) ✓; dark theme ✓; 320px viewport scrollWidth=320 (no overflow) ✓; zero console errors ✓. Screenshots saved to download/.

Stage Summary:
- Working app: one-click translate→speak→pronounce flow, offline god-level Bengali G2P engine (83/83 tests), LLM-primary translation chain, history, themes, responsive, accessible, honest error/no-voice states.
- No database used (per spec). Secrets: none required; DEEPL_API_KEY optional.
- Key artifacts: src/lib/pronunciation/* (engine + lexicon), src/lib/speech.ts, src/app/api/translate/route.ts, src/components/deutschflow/*, scripts/test-pronunciation.ts, README.md, .env.example.

---
Task ID: 2
Agent: main (Z.ai)
Task: Upgrade DeutschFlow to the GOD-TIER spec — 6-section platform (Listen/Vocabulary/Review/History/Progress/Settings), two-layer caching, vocabulary system, SM-2 review, progressive glossary, pronunciation overrides, speaking practice.

Work Log:
- Phase A services: src/lib/storage/idb.ts (IndexedDB wrapper: cache/vocab/kv stores, in-memory fallback), cache.ts (LRU 200 + IDB, versioned keys schema|kind|from|to|text, TTL 30d, in-flight dedupe), settings.ts (zustand+persist: autoplay/rate/voice/reviewTarget/historyLimit, legacy voice-key migration), overrides.ts (personal pronunciation corrections + version bump), review.ts (SM-2: again 10min-relearn/hard/good/easy, ease clamp 1.3–2.8, no missed-day penalty), vocabulary.ts (VocabEntry, IDB store + zustand mirror, umlaut-folded duplicate merge, bengali-preserving search fold — fixed Bangla search bug, JSON/CSV export, JSON import), curated.ts (110 A1 words / 11 topics + word-of-day), stats.ts (honest per-day counters, streak), speech-client.ts (singleton engine + zustand store), glossary client + POST /api/glossary (LLM per-word Bangla meanings, cached).
- Pronunciation provider (index.ts) rewritten: overrides layered over lexicon/rules, memo + IDB cache keyed by RULES_VERSION + overrideVersion, live re-transliteration on override change (wired in page.tsx via onOverridesChange).
- Phase B UI: app-shell.tsx (desktop sidebar 6 items + mobile sticky header + bottom nav 5 items with safe-area), listen-view, vocabulary-view (search/filter/sort/edit-dialog/two-step delete/favorites/export-import), review-view (session queue, reveal, 4 ratings, progress bar, completion stats), history-view (search, per-item delete, day labels), progress-view (stat cards, 7-day bar chart, word-of-day, topic collections), settings-view (theme light/dark/system, voice picker+test, default speed, autoplay, targets, cache clear, guarded reset), result-card upgrade (save sentence, confidence badge, interactive WordChip with meaning+save+flag), speaking-practice.tsx (SpeechRecognition word-match comparison, honest no-accent-scoring disclaimer), save-word-button (merge-duplicate toasts), empty-state (5 examples + word-of-day card).
- page.tsx: section routing, stale-guard flow, autoplay setting, progressive glossary (abortable, after audio), recordListen stats.
- Tests: src/__tests__/pronunciation.test.ts + core.test.ts (65 tests) — fixed 3 real bugs they caught: phrase-match chips showed lowercase German (now original spelling per spec), glossary key punctuation forking, Bangla search fold. Engine harness still 83/83. Fixed onPlay prop ReferenceError caught by agent-browser E2E.
- E2E (agent-browser): German direct play ✓ (Guten Morgen → গুটেন মর্গেন + শুভ সকাল), English → "Guten Morgen, mein Freund" ✓, Bangla → "Ich lerne Deutsch" ✓, chips play/save/override (ইক + তোমার সংশোধন badge live) ✓, vocab 2 entries saved+listed ✓, review session start→reveal→good/easy→"2টি কার্ড রিভিউ · 100%" ✓, progress stats ✓, settings honest no-voice message ✓, 320px scrollWidth=320 (no overflow) ✓, dark theme ✓, zero console errors ✓. Test data cleared for clean first-run.

Stage Summary:
- Full god-tier platform delivered on the verified core: 6 sections, SM-2 review, IDB vocabulary, two-layer cache, glossary enrichment, personal pronunciation overrides, speaking practice, honest stats.
- Quality gates: 65 bun tests + 83 G2P assertions + lint clean + browser-verified golden paths.
- No secrets required; DEEPL_API_KEY optional (.env.example). README rewritten for the expanded scope.

---
Task ID: 3
Agent: main (Z.ai)
Task: UI overhaul per user feedback — Noto Sans Bengali font, floating glass tab bar, fixed vocabulary download buttons, iOS liquid-glass theme, super-smooth animations, fix all UI mistakes using frontend-design + apple-design-skill (dickwu/apple-design-skill, HIG-based).

Work Log:
- Cloned dickwu/apple-design-skill to .design-rules/; read SKILL.md + liquid-glass.md + tab-bars.md + typography.md + layout.md. Key rules applied: glass only on floating functional layer, floating tab bar, 44pt targets, badge for review-due, no ALL-CAPS eyebrows, min 11pt text, reduce-transparency fallback.
- Font: installed @fontsource-variable/noto-sans-bengali, imported in layout.tsx; .font-bangla + body fallback now "Noto Sans Bengali Variable" (verified document.fonts.check=true, weight 100-900).
- globals.css: added @custom-variant glass; .glass token set (teal #0e8f84 primary, translucent white cards rgba(255,255,255,.66)); aurora body gradient (teal/sky/violet/peach + fixed linear); HIG layer discipline — backdrop blur ONLY on header/aside/fixed nav/popover/dialog/select/dropdown content, cards get translucent fill + inset highlight, no blur; prefers-reduced-transparency opaque fallback; df-page-in keyframes (rise+settle+deblur) + df-page-enter; global 380ms cubic-bezier theme-morph transition on bg/border/color/shadow (reduced-motion guarded); smooth scroll.
- app-shell.tsx rewritten: floating glass tab bar (centered pill, rounded-[26px], bg-card/72 + blur-2xl + saturate, safe-area offset, spring layoutId="df-tab-pill" indicator, whileTap 0.88, 58x52 targets); review tab shows red due-count badge (HIG badge pattern); desktop sidebar animated layoutId="df-side-pill"; main pb-36 for bar clearance; footer desktop-only.
- page.tsx: sections wrapped in key={section} div.df-page-enter (orchestrated section transition).
- theme-provider: themes ['light','dark','glass'], removed disableTransitionOnChange (enables smooth morph). theme-toggle: 3-way cycle light→dark→glass with CSS-swapped Sun/Moon/Droplets icons (no hydration flash). settings: 4-option theme radio (added গ্লাস/Droplets).
- vocabulary-view: replaced 2 identical download icon buttons with Export DropdownMenu (labeled JSON ব্যাকআপ / CSV Excel items, FileJson/FileSpreadsheet icons, disabled when empty) + success toasts; import kept; stats line moved below title row (fixed wrap collision); card hover lift+shadow transition.
- Killed all 12 ALL-CAPS uppercase eyebrow labels (frontend-design tell) across hero/settings/listen/progress/result-card/empty-state/word-chip/voice-settings → sentence-case 13px/12px semibold labels; hero badge → Bangla "জার্মান শেখা · A1 লেভেল"; about copy deduped (removed redundant pronunciation.name); word-chip source badge 9px→10px no-caps.
- Verification: lint EXIT 0; browser E2E — font loaded, glass aurora + teal, floating bar + pill + badge ("1 রিভিউ"), export dropdown + toast, review session start OK, dark+glass+light themes, 320px scrollWidth=320, zero console errors; 16 audit screenshots in download/ui-audit/.

Stage Summary:
- Three themes (light/dark/glass), floating iOS-style glass tab bar, Noto Sans Bengali everywhere, HIG-compliant liquid glass, animated nav pills + section transitions, fixed export UX. All previous features intact (G2P engine untouched, 83/83).
