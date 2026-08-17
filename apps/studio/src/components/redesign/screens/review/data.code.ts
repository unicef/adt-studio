/* eslint-disable lingui/no-unlocalized-strings -- Internal, English-only review report for the team;
 * this data is rendered by the dev-only /redesign-review route and is never localised. */
import type { Review } from "./types"

export const CODE_REVIEW: Review = {
  id: "code",
  label: "Code",
  title: "Code review",
  lead: "providers-v2, Appearance, Notifications, About, AppSidebar, HomeScreen + HomeHeroAnchor.",
  method:
    "Static read of the scope plus its dependencies, screenshots used only to confirm UX bugs. tsc --noEmit and lint were run against the workspace; see Command output.",
  findings: [
    {
      id: "k-1",
      severity: "blocker",
      category: "Correctness — data loss",
      where: "providers-v2/data.ts:270-274 + providers-v2/useProvidersV2.ts:40-64",
      problem:
        "Mock seed credentials are written into the PRODUCTION API-key storage keys, so opening AI providers fabricates an OpenAI key for users who have none.",
      evidence:
        "Verified: SEED_CREDENTIALS.openai.apiKey = 'sk-proto-demo-openai-key-000' is persisted to storageKey 'adt-studio-openai-key' (data.ts:69) — byte-identical to hooks/use-api-key.ts:3. readStorage() setItems it on first getSnapshot(), and the redesign is the default UI (use-ui-version DEFAULT_VERSION='new'; routes/index.tsx:146 redirects / to /redesign). Result: useApiKey().hasApiKey === true, no 'add a key' prompt, and every pipeline call ships the fake key as X-OpenAI-Key → hard 401s that look like an ADT bug. draft.remove() (shared.tsx:205) deletes the user's real keys the same way.",
      fix: "Namespace the mock seeds (adt-mock-*) or gate them behind import.meta.env.DEV + an explicit opt-in flag, and move seeding out of getSnapshot — it is a localStorage write during render.",
    },
    {
      id: "k-2",
      severity: "major",
      category: "Correctness",
      where: "AppearanceSection.tsx:24-35,123",
      problem:
        "The chosen theme is never re-applied at startup: applyTheme writes adt.theme and toggles .dark, but nothing reads that key at boot.",
      evidence:
        "Repo-wide grep for adt.theme / classList.toggle(\"dark\") hits only this file; main.tsx and index.html do nothing. Pick Dark → reload → the app is light while the card still shows Dark selected (storedTheme reads localStorage). 'System' also never subscribes to matchMedia, so an OS appearance change is ignored until the user revisits the screen.",
      fix: "Apply the stored theme in main.tsx before createRoot, add a prefers-color-scheme listener for system, and back the card with a useSyncExternalStore store (like use-ui-version) instead of local useState.",
    },
    {
      id: "k-3",
      severity: "major",
      category: "a11y",
      where: "providers-v2/VariantT3List.tsx:70-81",
      problem:
        "Collapsed provider panels stay keyboard-reachable: grid-template-rows:0fr + overflow-hidden + opacity-0 clips visually but is neither display:none nor visibility:hidden, so all 8 editors' inputs, reveal toggles, Save/Remove and links remain in the tab order while aria-expanded=\"false\".",
      evidence: "Tabbing past the first row drops focus into invisible password fields.",
      fix: "Add inert + aria-hidden on the wrapper when !open (React 19 forwards inert), keeping the grid-rows transition. Also role=\"region\" (:72) has no accessible name — aria-labelledby the row title or drop the role.",
    },
    {
      id: "k-4",
      severity: "major",
      category: "Correctness",
      where: "AppSidebar.tsx:175-190",
      problem: "The Help menu's primary, brand-highlighted item does nothing — its only handler is setHelpOpen(false).",
      evidence:
        "DOCS_LABEL (:37-42) computes a per-view label that leads nowhere; there is no per-view URL map, and DOCS_URL is used only by the secondary 'Browse documentation' row.",
      fix: "Add Record<RedesignView, string> doc paths and window.open(...) alongside the close.",
    },
    {
      id: "k-5",
      severity: "major",
      category: "Correctness",
      where: "HomeScreen.tsx:35 (+ LibraryScreen.tsx:28, HandoffsScreen.tsx:27)",
      problem:
        "Window controls and the drag region are dead: <TopBar className=\"absolute top-0 drag-region\" /> has no z-index while the sibling content wrapper (:39) is relative and later in DOM, so it paints and hit-tests above the 48px caption strip.",
      evidence:
        "On Windows/Linux the minimize/maximize/close buttons from TitleBarControls are unclickable and -webkit-app-region: drag never receives the pointer. SettingsLayout.tsx:17 gets this right with absolute inset-x-0 top-0 z-[3].",
      fix: "Mirror the settings classes, and verify the full-width drag strip doesn't swallow clicks on the greeting.",
    },
    {
      id: "k-6",
      severity: "major",
      category: "providers-v2 logic",
      where: "providers-v2/shared.tsx:458-477,494-518",
      problem: "The collapsed row and the expanded editor report opposite states out of the box.",
      evidence:
        "useCardHealth short-circuits on fallbackConfigured and never probes API-key providers, whereas ApiKeyPanel does. With the shipped seeds, ElevenLabs' row reads green 'Authenticated · API key' while expanding it shows red 'The provider rejected these credentials' (SIM_ENV.elevenlabs.rejectsKey). Second case: type a key into Google and hit Refresh without saving — the editor says 'Connected — 48 models', the row still says 'Not configured' (row reads stored creds, panel reads draft.values).",
      fix: "Enable the probe for configured API-key providers and derive the dot, the row line and the editor's HealthLine from that one probe; drop fallbackConfigured.",
      shots: ["settings-providers__light.png"],
    },
    {
      id: "k-7",
      severity: "major",
      category: "providers-v2 logic",
      where: "providers-v2/VariantT3List.tsx:93-96,103-110",
      problem: "'Refresh all' cannot refresh anything.",
      evidence:
        "refreshToken reaches useProviderHealthMock only via useCardHealth, whose enabled is true solely for local/CLI backends — both CLI backends are gated off by AVAILABLE_PROVIDERS, and the one local backend (Ollama) renders the amber coming-soon dot instead of HealthDotMark. The expanded editors call useProviderHealthMock WITHOUT refreshToken (ProviderEditor.tsx:66,81). The button's only observable effect is flipping the label to 'Checked just now' (which never decays).",
      fix: "Thread refreshToken through ProviderCard → ApiKeyPanel/CliPanel, and probe configured providers.",
    },
    {
      id: "k-8",
      severity: "major",
      category: "providers-v2 logic",
      where: "providers-v2/shared.tsx:466-468,550,557-561",
      problem: "Ollama is simultaneously 'coming soon' and live-probed.",
      evidence:
        "isCardAvailable('ollama') is false, yet useCardHealth sets enabled = true for any localProviderId, so every mount starts a 520ms timer and two state updates whose result is discarded. Flip the availability flag later and the row will claim 'Authenticated · 11 models' from SIM_ENV. ProviderCard also routes Ollama into ApiKeyPanel even though authKind(ollama) === 'local', which has no panel at all.",
      fix: "enabled = isCardAvailable(cardKey) && …, and give 'local' its own panel or fold it explicitly into the API-key one.",
    },
    {
      id: "k-9",
      severity: "major",
      category: "Dead code",
      where: "settings/searchIndex.ts:155-164 + settings/providers.ts (whole file) + settings/nav.ts:88",
      problem: "Provider search results navigate to anchors that no longer exist.",
      evidence:
        "PROVIDER_ENTRIES is still built from the abandoned v1 metadata with providerAnchor() ids (settings-provider-openai…); nothing in providers-v2 renders those ids (rows use prov-panel-<cardKey>). Selecting 'OpenAI' in settings search or ⌘K burns 30 rAF frames in useSettingsAnchor and silently gives up — no scroll, no flash. Copy is stale too: 'Google AI', Custom described as 'Ollama, vLLM, Together AI' though Ollama is now its own card; elevenlabs/gemini/ollama missing entirely.",
      fix: "Derive the entries from PROVIDER_CARDS/ROLE_GROUPS, add id={providerAnchor(cardKey)} to Row, delete providers.ts and ProviderId/PROVIDER_META.",
    },
    {
      id: "k-10",
      severity: "major",
      category: "providers-v2 logic",
      where: "providers-v2/shared.tsx:444,461,496",
      problem: "'Authenticated · API key' is shown for a config that has no API key.",
      evidence:
        "requiredFieldsFilled only checks required fields, so a Custom provider with just a Base URL (its key is optional) reports 'Authenticated · API key', and defaultCardMode treats it as key-configured. The same shape will hit Ollama when it ships.",
      fix: "Distinguish 'configured' from 'api-key authenticated' — use the \"configured\" health code that AuthLineFromHealth already handles ('Credentials set') but nothing ever produces.",
    },
    {
      id: "k-11",
      severity: "minor",
      category: "a11y",
      where: "AppSidebar.tsx:123-131",
      problem: "Home is announced as the current page on every redesign screen.",
      evidence:
        "TanStack Link applies aria-current=\"page\" on prefix match (activeOptions.exact defaults to false), so to=\"/redesign\" is 'current' on /redesign/library and /redesign/settings/*, while the visual highlight comes from activeRedesignView, which deliberately excludes home. Screen readers and the visual state disagree.",
      fix: "activeOptions={{ exact: item.view === \"home\" }}.",
    },
    {
      id: "k-12",
      severity: "minor",
      category: "React correctness",
      where: "providers-v2/useProvidersV2.ts:167-176",
      problem: "Two overlapping effects, and probe state isn't reset when providerId changes.",
      evidence:
        "On first enable both effects fire in the same commit (ranRef is set by the first before the second reads it), so run() runs twice — harmless today only because of the clearTimeout, but it double-sets isFetching. Neither data nor ranRef resets when providerId changes, so once probeId actually flips (post-cutover) the row shows the previous provider's health until the new probe lands.",
      fix: "Collapse into one effect keyed on [enabled, providerId, refreshToken] and setData(null) when providerId changes.",
    },
    {
      id: "k-13",
      severity: "minor",
      category: "Perf",
      where: "providers-v2/shared.tsx:180-183 + useProvidersV2.ts:103-107",
      problem: "Dead memoization: useProvidersV2 returns a fresh object literal every render, so useDraft's useMemo never hits.",
      evidence:
        "The credentialValue useCallback is pointless, and useDraft returns a new object with new closures each render — re-rendering CredentialFields/SaveRow for all 8 mounted cards on any keystroke in any card.",
      fix: "Memoize the store object (useMemo) and depend on store.credentials rather than store.",
    },
    {
      id: "k-14",
      severity: "minor",
      category: "React correctness",
      where: "providers-v2/shared.tsx:322-336",
      problem: "setTimeout in CopyCommand has no cleanup — switching the CLI/API toggle within 1.4s of copying unmounts the component mid-timer.",
      fix: "Store the id in a ref and clear it on unmount.",
    },
    {
      id: "k-15",
      severity: "minor",
      category: "Types",
      where: "providers-v2/shared.tsx:404,463 · useProvidersV2.ts:113 · ProviderEditor.tsx:112,117-119,141",
      problem:
        "Non-null assertions on Record lookups: noUncheckedIndexedAccess is off, so PROVIDER_CARDS[cardKey].uiId and descriptorById(id)! type-check but throw a blank-screen TypeError if a card key is added to ROLE_GROUPS without a matching PROVIDER_CARDS/PROVIDER_DESCRIPTORS entry.",
      fix: "A single cardByKey() guard that returns undefined and renders nothing, or enable the flag for this folder.",
    },
    {
      id: "k-16",
      severity: "minor",
      category: "Dead code",
      where: "useProvidersV2.ts:16,95 · data.ts:234,259,260,262 · contract.ts:9,12,17,57,79 · providerLogos.ts:25,27 · ProviderEditor.tsx:114 · shared.tsx:581 · EASE ×3",
      problem: "Leftovers from the refactor.",
      evidence:
        "mask() never called; ProvidersV2.descriptors never read; DEFAULT_MODELS unused; AI_MODALITIES/CREDENTIAL_FIELD_KINDS/PROVIDER_HEALTH_CODES/CredentialFieldOption/ProviderCredentialValues unused (defensible as a contract mirror — say so or drop); providerLogos codex/claude-agent unreachable (ProviderTile is only called with card.uiId); SIM_ENV.codex / custom.reachable / claude-agent unreachable in the shipped variant; ProviderEditor mode state unread for single-backend cards; shared.tsx:581 re-exports an import; AppearanceSection:14 / NotificationsSection:15 / AboutSection:15 redeclare the EASE that shared.tsx:30 already exports.",
      fix: "Delete, or document the intentional mirrors.",
    },
    {
      id: "k-17",
      severity: "minor",
      category: "i18n",
      where: "AboutSection.tsx:155",
      problem: "<Trans>~/ADT/Books</Trans> marks a filesystem path as translatable — it will land in all five catalogs and can be 'translated'. It is also a hardcoded placeholder, not the real books dir.",
      fix: "Render it as a plain string in a font-mono span (with an eslint-disable line comment) and wire it to the real path when the setting ships.",
    },
    {
      id: "k-18",
      severity: "minor",
      category: "i18n",
      where: "providers-v2/shared.tsx:73,500,502 · HomeHeroAnchor.tsx:22,92",
      problem:
        "Member expressions and calls inside <Trans> ({health.modelCount}, {data.detail}, {formatRelative(...)}, {resume.modified}) extract as positional {0}, which translators cannot interpret.",
      evidence: "Related: AuthLineFromHealth splices the untranslated mock detail ('Claude Team account') into a localized sentence.",
      fix: "Hoist each to a named local so the placeholder is named.",
    },
    {
      id: "k-19",
      severity: "minor",
      category: "i18n",
      where: "providers-v2/data.ts:45-54 (rendered raw at VariantT3List.tsx:32)",
      problem: "PROVIDER_CARDS[].displayName bypasses i18n, hidden by the file-level eslint-disable. Brand names are fine, but 'Custom (OpenAI-compatible)' contains translatable copy.",
      fix: "Use a MessageDescriptor for the one non-brand label.",
    },
    {
      id: "k-20",
      severity: "minor",
      category: "a11y",
      where: "providers-v2/shared.tsx:524-543 · AppearanceSection.tsx:107-118 · AboutSection.tsx:20-27 · VariantT3List.tsx:112",
      problem:
        "All three Soon badges are mouse-only, each in a different way: SoonPin's TooltipTrigger wraps a non-focusable <span>; Appearance's uses only a title attribute; About's has no explanation at all.",
      evidence: "VariantT3List.tsx:112 pairs a disabled (unfocusable) 'Add provider' button with a SoonPin, so keyboard/AT users get a dead control with no reason given.",
      fix: "One shared SoonBadge whose trigger is focusable (span tabIndex={0} or a button), plus aria-describedby on the control it annotates.",
    },
    {
      id: "k-21",
      severity: "minor",
      category: "a11y",
      where: "HomeHeroAnchor.tsx:61,94,115 · providers-v2/GroupHeading.tsx:8 · AboutSection.tsx:48 · NotificationsSection.tsx:116,148",
      problem:
        "Heading structure is inverted and sparse: h2 (greeting) → h1 (book title) → h2 (Recent), so the page's only h1 is a book title that appears after an h2. In settings, SettingsHeading is the h1 but every group/tile title is a div, so there are no h2/h3 landmarks at all.",
      fix: "Greeting → h1, book title → h2; make GroupHeading and tile titles real h2/h3.",
    },
    {
      id: "k-22",
      severity: "minor",
      category: "a11y",
      where: "providers-v2/VariantT3List.tsx:62-67",
      problem:
        "The status 'light' actively contradicts its own row: an ON blue toggle sits beside 'Not configured', and its aria-label says 'Provider available'. A disabled Radix Switch still exposes role=\"switch\" aria-checked=\"true\".",
      fix: "Drop the Switch — the dot and the auth line already carry the state.",
      shots: ["settings-providers__light.png", "settings-providers__dark.png"],
    },
    {
      id: "k-23",
      severity: "minor",
      category: "a11y",
      where: "NotificationsSection.tsx:176-201",
      problem:
        "The selected notification slot stays focusable: pointer-events-none does not remove it from the tab order, so keyboard users tab onto an invisible button — and it is the only one of the six carrying aria-pressed=\"true\", so the current position is only discoverable by landing on something invisible.",
      fix: "Render the selected slot as a non-interactive marker (or disabled + aria-hidden) and keep the <b>{posLabel}</b> line as the accessible statement of record.",
      shots: ["settings-notifications__dark.png"],
    },
    {
      id: "k-24",
      severity: "nit",
      category: "Correctness",
      where: "NotificationsSection.tsx:87-92",
      problem:
        "The auto-dismiss progress bar only animates on mount (starting:scale-x-100) and PreviewToast's key is position, so changing 4s → 10s re-renders without remounting and the preview never replays at the new duration.",
      fix: "key={`${position}-${autoDelay}-${autoDismiss}`}.",
    },
    {
      id: "k-25",
      severity: "nit",
      category: "Dead code",
      where: "HomeHeroAnchor.tsx:36,39,55",
      problem: "pinnedLabels is never supplied (HomeScreen.tsx:40-46 omits it), so pins is always empty and both the pinned-first shelf ordering and ShelfCard's pin marker are dead.",
      fix: "Wire pinning through, or delete the prop from HomeVariantProps.",
    },
    {
      id: "k-26",
      severity: "nit",
      category: "Correctness",
      where: "AppSidebar.tsx:236",
      problem: "navigate({ to: \"/redesign/settings/about\",  }) uses a raw path plus a stray trailing comma where SETTINGS_PATHS.about exists; the file also mixes semicolon and no-semicolon style in one JSX block (:196-197 vs :206-207).",
      fix: "Use the constant and normalise the style.",
    },
    {
      id: "k-27",
      severity: "nit",
      category: "a11y",
      where: "AppSidebar.tsx:135-144",
      problem: "The Library / Split & merge badges render a naked number, announced as 'Library 6'.",
      fix: "Add a visually hidden unit or aria-label={t`Library, ${count} books`} on the link.",
    },
  ],
  cleared: [
    {
      what: "ProviderTile dangerouslySetInnerHTML (shared.tsx:144-158) — safe",
      why: "The only source is PROVIDER_BRAND[*].logoSvg, from seven static @/assets/providers/*.svg?raw imports resolved by Vite at build time (providerLogos.ts:2-8). id is card.uiId from the hardcoded PROVIDER_CARDS with a static fallback — no user input, config, API response or localStorage value can reach the sink.",
    },
    {
      what: "useSyncExternalStore identity (useProvidersV2.ts:66-74,102)",
      why: "subscribe/getSnapshot are module-level and stable; getSnapshot returns a cached object replaced only inside writeCredential. No infinite-render risk (the localStorage write it performs is finding 1).",
    },
    {
      what: "getServerSnapshot",
      why: "Passing getSnapshot as getServerSnapshot is fine — Vite SPA, no SSR/hydration, and the localStorage access is inside try/catch.",
    },
    { what: "Timer cleanup (useProvidersV2.ts:178-180)", why: "The unmount effect clears the pending probe timer and run() clears the previous one before scheduling. No leak." },
    { what: "draftRef read during render (:153-154)", why: "Written during render but only read inside the setTimeout callback, never for render output — safe under concurrent rendering." },
    { what: "HomeScreen.tsx:29 early return", why: "All hooks run before the conditional return — no conditional-hook violation." },
    { what: "Chevron duplicate (VariantT3List.tsx:52-60)", why: "aria-hidden + tabIndex={-1} on a decorative twin of the real toggle is the correct pattern — not reachable, not double-announced." },
    {
      what: "<Trans>Pick a corner — toasts appear <b>{posLabel}</b></Trans> (NotificationsSection.tsx:152-154)",
      why: "Lingui v5 extracts nested elements as <0>…</0> placeholders correctly, and posLabel is already localized via i18n._.",
    },
    { what: "AboutSection.tsx:141 Restart tour", why: "/onboarding has no beforeLoad guard, so it replays even with adt-studio-onboarding-completed=1. Works." },
    {
      what: "Credential storage keys",
      why: "Every storageKey in data.ts matches hooks/use-api-key.ts exactly (including azure-region and custom-base-url), so saving from the new screen is genuinely wired to the shipping app. AVAILABLE_PROVIDERS accurately reflects that hook's provider set.",
    },
    { what: "useSettingsAnchor cleanup", why: "Cancels the rAF, clears the flash timeout and removes the classes on unmount." },
    { what: "ProviderTile / HealthDotMark re-render churn", why: "New object identities per render exist, but these are leaf components over ≤10 rows — not worth changing." },
  ],
  toolOutput: [
    {
      command: "pnpm --filter @adt/studio exec tsc --noEmit",
      result: "Clean — no output, exit 0.\n\n(The agent's first run was red, but all 10 errors came from the\nthen-incomplete /redesign-review scratch files, not from the reviewed\nscope. Re-run after completing them: clean.)",
    },
    {
      command: "pnpm --filter @adt/studio lint",
      result:
        "✖ 9 problems (0 errors, 9 warnings)\n\nAll 9 are pre-existing 'Unused eslint-disable directive' warnings, none in\nthe reviewed scope:\n  components/import/ImportProject.tsx:34\n  pipeline/stages/storyboard/components/BookPreviewFrame.tsx:405,448,608,716\n  .../style-editor/class-maps/layout.ts:1\n  .../style-editor/controls/BoxInput.tsx:34\n  ui/file-drop-overlay.tsx:82\n  wizard/BookCreationWizard.tsx:261\n\neslint-suppressions.json has NO entries for any redesign/ file, so nothing in\nscope passes lint on a suppression. The inline disables in providers-v2/data.ts:1,\nuseProvidersV2.ts:118, shared.tsx:342, VariantT3List.tsx:36,\nNotificationsSection.tsx:26, AppearanceSection.tsx:27 and AboutSection.tsx:17\nare the only exemptions — each justified except AboutSection.tsx:155 (finding 17).",
    },
  ],
  verdict: [
    "Fix the seed-credential collision first (finding 1) — it is the only item here that can corrupt a real user's app state, and it ships by default because the redesign is the default UI.",
    "Make one probe the source of truth for provider health (findings 6, 7, 8, 10) — today the row, the editor and the Refresh button each believe something different.",
    "Then the two reachability bugs: inert the collapsed panels (3) and z-index the TopBar (5).",
  ],
}
