# Kids Mode

A child-focused reading experience for ADT books, built for the UNICEF/Ceibal accessibility program. Instead of navigating menus, the kid asks a **reading buddy** — a character that fronts every accessibility feature of the book. Grounded in Ceibal's UX Research Final Report (Dec 2025, classroom testing with blind/low-vision and intellectual-disability students).

Branch: `eliezir/kids-mode-ui`. The runtime experience ships inside every exported kids book with zero external dependencies (fully offline); authoring (enable, roster, voices) happens in Studio.

## Architecture

### Who decides what

**Kids mode is an author-time decision, never a reader toggle.** Studio writes `kids-mode.json` (`{ enabled, buddies }`) into the book dir; preview and export stamp it into the packaged config as `features.kidsMode` / `features.kidsBuddies`. The runtime's `kidsModeActiveAtom` reads only `features.kidsMode === true`. Per-reader state (onboarding done, chosen buddy, player name, last spot) stays persisted locally in the book's storage.

The `/books/:label/adt/*` preview route patches `assets/config.json` on the way out from the live `kids-mode.json` (and serves `content/kids-voice/*` from the book dir), so toggling kids mode in Studio reflects in the preview without re-packaging.

### Where it lives

```
packages/types/src/kids.ts       # SHARED SOURCE OF TRUTH (zod-free, "@adt/types/kids" subpath):
                                 #   buddy roster metadata + per-buddy TTS voice presets,
                                 #   speakable-line registry, pick phrases, manifest contract
packages/pipeline/src/kids-voice.ts  # voice pack generator (cached TTS, per buddy × language)
apps/api/src/routes/kids-voice.ts    # kids-mode config GET/PUT + voice generate/status routes
apps/studio/src/components/kids/     # Studio "Kids Mode" screen (enable, roster, voices)

apps/adt-runtime/src/features/kids/
  state/kids.atoms.ts        # kids state (Jotai; per-reader bits persisted)
  hooks/useKidsTranslation.ts  # fallback-aware i18n (tk)
  hooks/useBuddySpeech.ts    # single "buddy says X" entry point (bubble + clip)
  lib/kids-translate.ts      # pure translator core
  lib/characters.ts          # roster (ids/names from @adt/types/kids) + SVG art wiring
  lib/buddy-lines.ts         # re-exports the shared speakable-line registry
  lib/buddy-phrases.ts       # pick-phrase pools + random selection
  lib/buddy-voice.ts         # voice pack manifest loading + clip playback
  assets/buddy-images.ts     # PNG image sets (folder contract below)
  assets/images/<id>/        # transparent PNGs, one folder per character
  assets/buddies/*.ts        # legacy layered SVG art modules (kept as a fallback layer)
  components/
    KidsChrome.tsx           # root switch: onboarding vs reading chrome
    KidsOnboarding.tsx       # full-screen page-based onboarding
    KidsBuddy.tsx            # FAB + speech-bubble action panel + dialogs
    KidsBuddyImage.tsx       # PNG renderer (expression variants)
    KidsActionButton.tsx     # shared chunky action button
    KidsSpeechBubble.tsx     # floating bubble (greeting/confirmations)
    KidsPageArrows.tsx       # kid-sized fixed page navigation
    KidsBuddyArt.tsx         # legacy inline-SVG renderer (CSS-var palettes)
```

### Character system (PNG image sets)

Five buddies with **fixed names** (not user-renameable): dino Rex, robot Bolt, bunny Pip, cat Luna, alien Zibby. Art is GPT-Image-generated transparent PNGs following a strict folder contract — `images/<id>/<id>_<n>.png` where the number always means the same expression (1 standing, 2 signature, 3 happy, 4 excited, 5 thinking, 6 surprised, 7 encouraging). A future user-created character is therefore fully described by a folder of numbered files; the loader builds its image set mechanically. Built-ins use static imports (inlined as data URLs by both Vite and the esbuild book build — `new URL(import.meta.url)` is forbidden here, it crashes the IIFE book bundle). Expressions swap contextually (tour steps, FAB states, pick celebration) with a small pop.

The layered-SVG system (characters.ts art + KidsBuddyArt) remains as a dormant fallback layer; the Rive pivot decision from earlier planning is superseded for now by the PNG + voice direction.

### Mode switch (chrome swap, no forking)

Activation is **config-only**: `kidsModeActiveAtom` derives solely from the packed `features.kidsMode === true` (see "Who decides what" above) — there is no reader-facing toggle anywhere in the runtime, Settings included. Old books without the field, or with it `false`, get the normal adult chrome. When active, `NavRoot` swaps `BottomDock` → `KidsChrome` **inside the same `<Dock>`**, so the audio player and keyboard shortcuts keep working; `ChromeRoot` suppresses the adult tutorial overlay. Kids mode re-skins the same feature atoms the dock drives (`readAloudModeAtom`, `easyReadModeAtom`, `glossaryModeAtom`, `signLanguageModeAtom`, notepad/eli5 atoms, `audioSpeedAtom`) — it never reimplements feature logic. The onboarding picker shows only the packed `features.kidsBuddies` roster. Onboarding replay ("Meet my buddy again") lives as an action inside the buddy panel itself (`KidsBuddy.tsx`), not in Settings — it just flips `kidsOnboardingDoneAtom` back to `false` and closes the panel.

### Kids i18n (the `t()` trap)

The runtime's `t()` returns the **raw key** when missing, and books ship frozen catalogs — old bundles would render literal keys. Every kids string therefore goes through `tk(key, fallback, vars?)` (`useKidsTranslation` → pure `kidsTranslate`): catalog hit → translation; missing/empty → inline English fallback; `${var}` interpolation either way. Real translations are added to `assets/adt/interface_translations/*` in a consolidated pass before merge.

### Buddy voices (per-buddy, pre-baked, offline)

Everything the buddy can say lives in the shared registry (`@adt/types/kids`): greeting, action confirmations, pick phrases. Each buddy has an OpenAI TTS voice preset (voice id + style instructions). The Studio screen generates clips **per packed buddy × per book language** through `POST /books/:label/kids-voice/generate` (author's `X-OpenAI-Key`; `dryRun` plans and reports cache hits without spending). Clips cache **globally** (`KIDS_VOICE_CACHE_DIR`, default `<BOOKS_DIR>/.kids-voice-cache`, keyed by `hash(text, voice, model, instructions, provider)`) because lines, voices, and languages are book-independent — generating voices for one book makes them free for every other book. The legacy per-book `.cache` is a read-through fallback (hits get promoted into the global cache), so pre-existing packs migrate without re-paying the API. Each book still ships its own baked copy — books stay self-contained and offline.

Output ships in the book: `content/kids-voice/<lang>/manifest.json` + `<character>/<line-key>.mp3`. At runtime `useBuddySpeech.say(line)` shows the bubble text via `tk` and plays the clip when the manifest has it — no pack, no character, no key → silent text-only fallback, so old books and un-generated languages degrade gracefully.

Baking rules: `${name}` = the buddy's fixed default name (resolvable per character per language); `${language}` = the manifest's own language display name; lines interpolating the **player's** name can't be baked and alias a generic clip via `voiceKey`.

### Onboarding (page-based, not a modal)

Full-screen pages navigated with ← → (capture-phase handler intercepts the book's own arrow navigation; inputs guarded via `isTypingTarget`). Sequence: **welcome → your name → pick buddy (speech bubble with randomized per-character phrases; names shown, not species) → how-do-you-want-to-read (sets `readAloudModeAtom`; skipped without readAloud) → "Turn the pages" → "Ask me anytime" (L key) → "Here's what I can do" (feature-gated ability list) → start**. Gated by `kidsOnboardingDone`.

### Buddy interaction

FAB bottom-right (idle bob, reduce-motion aware; expression swaps standing/happy/excited). Tap → one unified speech-bubble panel: header line, vertical action list (read to me / speed turtle-normal-rabbit / signs / easy read / word helper / explain it / my notes / change language / story map — each gated by the book's `features.*`), X + Escape + tail pointing at the buddy. **Every state change updates the header with a confirmation phrase** ("Big letters are on!") and plays its voice clip when the book ships one. Resume chip ("take me back") appears when `kidsLastSpot` differs from the current page. Kids mode never auto-starts TTS narration.

### Design language ("sunny sky")

Sky-blue gradient world with drifting CSS clouds; white chunky cards with 3px borders and **hard offset shadows** (`0 4px 0 <edge>`) pressed down via transform+box-shadow only; sunny-yellow primary CTA (`#FFC800` face / `#DFA000` edge); selection = **full sky-500 fill + white checkmark**; Lucide icons; ≥44px targets; visible focus rings; `reduceMotionAtom` + OS `prefers-reduced-motion` respected throughout. Note the Tailwind v4 trap: custom classes in `@layer utilities` get **no variant support** — the kids animation classes are used unprefixed and gated in JS via `usePrefersReducedMotion`.

### Dev/preview affordances (remove before shipping)

Two `KidsChrome` conveniences fire only on the dev server (`NODE_ENV=development`) or in an iframed runtime (the Studio preview): a once-per-tab onboarding replay, and a "↻ Redo intro" button. A shipped standalone book never sees either. Note: the esbuild runtime build defines only `process.env.NODE_ENV` — `import.meta.env` is undefined and **reading it throws**.

## Feature ↔ research mapping

| Feature | Status | UX report basis |
|---|---|---|
| Buddy replaces menus (dock parity) | ✅ | Insights 1–2 (companion, hierarchy) |
| Buddy pick, fixed names, PNG expressions | ✅ | Insight 3 (personalization) |
| Kid's name used in greetings | ✅ | Insight 3 |
| Page-based onboarding + feature tour | ✅ | pp. 8, 25–26 |
| Reading-mode question | ✅ | p. 25 |
| Text confirmations for every action | ✅ | Insight 5 (system status) |
| Buddy voice (per-character, per-language) | ✅ pipeline done | Insight 4 |
| Studio authoring (enable/roster/voices) | ✅ | product direction |
| No unsolicited TTS | ✅ | buddy-asks model |
| Adaptive guidance (retire repeated hints) | ⬜ | Insight 6 |
| Dark mode / visual comfort | ⬜ | Insight 8 |
| Kid's own avatar | ⬜ | Insight 3 |
| Custom buddies (author-uploaded) | ⬜ next | product direction |
| Stars + buddy outfit shop | ⬜ (last) | Insight 9 |

## Next steps

1. **Custom buddies (Studio upload).** Name + 7 numbered PNGs into the book dir via the API; the numbered-folder contract and the generic phrase pool make the runtime side additive. Optional server-side background removal on upload.
2. **Voice polish.** Real-key end-to-end generation pass; per-buddy audition in Studio; spoken onboarding lines if desired.
3. **Before merge:** fill all interface-translation catalogs for kids keys; run `lingui extract` for the Studio strings; remove/gate the dev replay affordances; delete `.context` scratch assets; re-run i18n/suppressions CI locally.

## Working notes

- Verify in a real book: `pnpm --filter @adt/runtime dev` serves `books/<label>/adt/` (e.g. `/raven/index.html`). Kids mode now comes from book config — set it via the Studio screen (writes `books/<label>/kids-mode.json`) or create that file by hand; the old `localStorage.kidsMode` seed no longer does anything.
- The Studio preview serves the packaged copy through the API but patches `assets/config.json` live, so the kids toggle needs no re-package.
- Playwright + the repo's bundled Chromium is the screenshot harness; the FAB's infinite idle-bob makes default `click()` fail on "element is not stable" — use `{ force: true }`.
- `pnpm typecheck` (root) and `pnpm --filter @adt/runtime test` are the gates; the full cross-package `pnpm test` is load-sensitive next to dev servers.
