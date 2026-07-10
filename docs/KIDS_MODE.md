# Kids Mode

A child-focused reading experience for ADT books, built for the UNICEF/Ceibal accessibility program. Instead of navigating menus, the kid asks a **reading buddy** — a customizable character that fronts every accessibility feature of the book. Grounded in Ceibal's UX Research Final Report (Dec 2025, classroom testing with blind/low-vision and intellectual-disability students).

Branch: `eliezir/kids-mode-ui`. All code lives in the book runtime; every exported book carries kids mode with zero external dependencies (fully offline).

## Architecture

### Where it lives

```
apps/adt-runtime/src/features/kids/
  state/kids.atoms.ts        # all kids state (Jotai; persisted via shared/state/persist)
  hooks/useKidsTranslation.ts  # fallback-aware i18n (tk)
  hooks/useBuddySpeech.ts    # single "buddy says X" entry point
  lib/kids-translate.ts      # pure translator core (usable outside React)
  lib/characters.ts          # character registry (5 buddies, palettes)
  assets/buddies/*.ts        # layered SVG art modules (BuddyArt)
  components/
    KidsChrome.tsx           # root switch: onboarding vs reading chrome
    KidsOnboarding.tsx       # full-screen page-based onboarding
    KidsBuddy.tsx            # FAB + speech-bubble action panel + dialogs
    KidsActionButton.tsx     # shared chunky action button
    KidsSpeechBubble.tsx     # floating bubble (greeting/confirmations)
    KidsPageArrows.tsx       # kid-sized fixed page navigation
    KidsBuddyArt.tsx         # inline-SVG renderer (CSS-var palettes)
```

### Mode switch (chrome swap, no forking)

`features.kidsMode` (book config, default on) × persisted `kidsMode` toggle (Settings → Kids) → `kidsModeActiveAtom`. When active, `NavRoot` swaps `BottomDock` → `KidsChrome` **inside the same `<Dock>`**, so the audio player and keyboard shortcuts keep working; `ChromeRoot` suppresses the adult tutorial overlay. Kids mode re-skins the same feature atoms the dock drives (`readAloudModeAtom`, `easyReadModeAtom`, `glossaryModeAtom`, `signLanguageModeAtom`, notepad/eli5 atoms, `audioSpeedAtom`) — it never reimplements feature logic.

### State & persistence

All state is local (`shared/state/persist.ts`: localStorage-first, cookie fallback; survives per-page reloads of multi-page books). Keys: `kidsMode`, `kidsBuddy` (`{character, palette, backgroundColor, name}`), `kidsPlayerName`, `kidsOnboardingDone`, `kidsLastSpot` (resume), plus per-tab sessionStorage guards (`kidsBuddyGreeted`, `kidsDevOnboardingReset`). Unknown persisted ids fall back safely (`getCharacter`/`getPalette`).

### Kids i18n (the `t()` trap)

The runtime's `t()` returns the **raw key** when missing, and books ship frozen catalogs — old bundles would render literal keys. Every kids string therefore goes through `tk(key, fallback, vars?)` (`useKidsTranslation` → pure `kidsTranslate`): catalog hit → translation; missing/empty → inline English fallback; `${var}` interpolation either way. Real translations are added to `assets/adt/interface_translations/*` in a consolidated pass before merge.

### Character system (layered SVG)

Five buddies — dino Rex, robot Bolt, bunny Pip, cat Luna, alien Zibby — authored as original layered SVGs against a binding anatomy contract (`.context/kids-mode/buddy-anatomy-spec.md`): viewBox 120, `data-part` layer tree (body/head/eyes/mouth…), **empty `data-anchor` groups (hat/eyes/neck) reserved for future outfit overlays**, colorable parts via `var(--buddy-primary/secondary/accent)` with classic fallbacks, shading only via low-opacity overlays, `transform-origin` on eyes/mouth for blink/talk animation. Rendered inline (`KidsBuddyArt`, dangerouslySetInnerHTML of our own build-time constants) so CSS vars cascade — `<img>`/data-URI cannot recolor per-part. Structural tests enforce the contract mechanically. Each buddy ships 4 palette presets; arbitrary hex values also work (free-color ready). DiceBear was rejected (no creature styles, ~68KB gz history, license audit); Twemoji was rejected (no per-part recolor).

### Onboarding (page-based, not a modal)

Modeled on the ADT demo (`unicef.github.io/adt-quiz-demo/html/onboarding_p0_s*.html`): full-screen pages navigated with ← → (capture-phase handler intercepts the book's own arrow navigation; inputs are guarded via `isTypingTarget`). Sequence: **welcome → your name → pick & name buddy → how-do-you-want-to-read (sets `readAloudModeAtom`; skipped when the book has no readAloud) → "Turn the pages" (← → keycaps) → "Ask me anytime" (L key) → "Here's what I can do" (feature-gated ability list) → start**. The kid is greeted and named *before* any buddy is shown. Gated by `kidsOnboardingDone`; replayable from Settings ("Meet your buddy again").

### Buddy interaction

FAB bottom-right (idle bob, reduce-motion aware). Tap → one unified speech-bubble panel: header line ("Hi ${name}! What would you like me to do?"), vertical action list (read to me / speed turtle-normal-rabbit / signs / easy read / word helper / explain it / my notes / change language / story map — each gated by the book's `features.*`), X + Escape + tail pointing at the buddy. **Every state change updates the header with a confirmation phrase** ("Big letters are on!") — UX-report Insight 5 at text level; audio confirmations arrive with the voice work. Resume chip ("take me back") appears when `kidsLastSpot` differs from the current page. Kids mode never auto-starts TTS narration — the buddy reads only when asked.

### Design language ("sunny sky")

Sky-blue gradient world with drifting CSS clouds; white chunky cards with 3px borders and **hard offset shadows** (`0 4px 0 <edge>`) pressed down via transform+box-shadow only (zero layout shift, reserved travel space); sunny-yellow primary CTA (`#FFC800` face / `#DFA000` edge); selection = **full sky-500 fill + white checkmark** (color+icon, not ring-subtlety); colored circle page-arrows with white casings; multicolor pastel ability chips; Lucide icons; ≥44px targets; visible focus rings; `reduceMotionAtom` respected throughout.

### Dev/preview affordances (remove before shipping)

Two `KidsChrome` conveniences fire only on the dev server (`NODE_ENV=development`) or in an iframed runtime (the Studio preview): a once-per-tab onboarding replay, and a "↻ Redo intro" button. A shipped standalone book never sees either. Note: the esbuild runtime build defines only `process.env.NODE_ENV` — `import.meta.env` is undefined and **reading it throws** (this once took down the whole kids chrome in preview).

## Feature ↔ research mapping

| Feature | Status | UX report basis |
|---|---|---|
| Buddy replaces menus (dock parity) | ✅ | Insights 1–2 (companion, hierarchy) |
| Buddy pick + name + palettes | ✅ | Insight 3 (personalization) |
| Kid's name used in greetings | ✅ | Insight 3 |
| Page-based onboarding + feature tour | ✅ | pp. 8, 25–26; teaches pagination & L shortcut |
| Reading-mode question | ✅ | p. 25 "How do you want to explore your books?" |
| Text confirmations for every action | ✅ | Insight 5 (system status) |
| No unsolicited TTS | ✅ | buddy-asks model |
| Buddy voice (per-character, per-language) | 📌 pinned | Insight 4 — see next steps |
| Adaptive guidance (retire repeated hints) | ⬜ step 11 | Insight 6 |
| Dark mode / visual comfort | ⬜ step 12 | Insight 8 |
| Kid's own avatar | ⬜ step 9 | Insight 3 / report avatar HUD |
| Stars + buddy outfit shop | ⬜ steps 13–14 (last) | Insight 9 (optional, narrative-framed, no streaks) |
| Voice input, ambient sounds, deaf co-design track | deferred | Insight 7 (low), Insight 4 opp., p. 29 |

## Next steps

1. **Rive character pivot (decided).** Replace the layered-SVG buddies with designer-authored Rive characters: rigged animation states (idle/listen/talk/celebrate) and **outfit swaps via state-machine inputs** — customization moves from recoloring to outfits, matching the product direction. Needs: a designer (or commissioned/community `.riv` files), the Rive WASM runtime (~few hundred KB, offline-bundleable), and a registry adapter so `KidsBuddyArt` swaps renderers per character. The SVG system stays as fallback until parity; its `data-anchor` outfit mechanism is superseded by Rive outfits.
2. **Buddy voice (pinned, design corrected).** Generate at **preview time in Studio using the user's own API key** (`X-OpenAI-Key` header pattern), per language, integrated with the existing Speech pipeline step — *not* a dev-run CLI baking offline packs (multi-language books make pre-baking infeasible). Playback lib in the runtime consumes packaged per-language clips; spoken confirmations (step 7) ride on this.
3. **Kid avatar (step 9).** Recommended: `@bigheads/core` (Bean Heads, MIT) — human avatar with native clothing/accessory options; shown in greetings and later beside the star counter.
4. **Steps 10–14.** Practice question; adaptive guidance (`kidsSkills` retire-hints); kids dark mode; stars ledger (hook activity correct-answer events; optional per report); outfit shop (spend stars; Rive outfit inputs).
5. **Before merge:** fill all interface-translation catalogs for kids keys; remove the dev replay + redo button (or gate behind an explicit authoring flag); delete the Twemoji-era `.context` scratch assets; re-run the i18n/suppressions CI locally.

## Working notes

- Verify changes in a real book: `pnpm --filter @adt/runtime dev` serves `books/<label>/adt/` (e.g. `/raven/index.html`); seed `localStorage.kidsMode = "true"`. The Studio preview serves a separately packaged copy through the API (`/books/<label>/adt-preview/v-*/`) — it rebuilds the bundle on demand and never caches Tailwind CSS.
- Playwright + the repo's bundled Chromium is the screenshot harness; the FAB's infinite idle-bob makes default `click()` fail on "element is not stable" — use `{ force: true }`.
- `pnpm typecheck` (root) and `pnpm --filter @adt/runtime test` are the gates; the full cross-package `pnpm test` is load-sensitive next to dev servers.
