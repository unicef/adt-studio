---
id: SPEC-0025
title: Context-based UI translation with an on-screen fit check
status: in-review
owner: "@Eliezir"
approvers: []
issues: ["#937"]
prs: []
adr: "docs/DECISIONS.md#029-ui-strings-are-translated-from-context-in-the-authors-session-not-by-ci"
created: 2026-11-11
updated: 2026-11-12
---

<!--
Proposed in unicef/adt-studio#937 (lane: spec). Reviewing this file's PR IS the spec
review. `approvers:` stays empty until approval (SPEC_DRIVEN_DEVELOPMENT.md §5).
Catalog numbers were measured on `develop` at `4bef06d55` by parsing every active `.po`
entry. The #900 material cited below is in the owner's archived workspace and moves
into the repo with this spec's implementation.
-->

## Problem (with evidence)

Studio's UI strings are translated **key by key**: each English string on its own, with
no idea where it appears, what it means there, or how much room it has. Four locales are
translated (`pt-BR`, `es`, `fr`, `sq`, 4,303 active entries each in
`apps/studio/src/locales/`), and the people adding strings don't speak most of them, so
nobody can tell when a translation is wrong or no longer fits.

### How strings get translated today

Every path starts from a list of empty `msgstr` entries: the
`pnpm --filter @adt/studio translate:missing` script (a JSON array of bare English
strings, with no glossary, call site or length limit), an agent asked to "translate the
missing strings" (the catalogs carry no file references, `origins: false`), or, rarely,
the CI `i18n` job, which runs the same script and pushes the result to the PR branch.

A string translated alone can't tell a button from a heading, a verb from a noun, or
"Light" the theme from "Light" the review depth. After translating, it is hard to keep
track of the changes in all four languages, especially since developers don't speak
most of them. Even when a translation breaks the UI, they can't tell which word is wrong
or what a shorter replacement would be.

### What it costs (measured)

- **Wrong meaning.** The theme option "Light" has no `msgctxt` and reads "Ligero" /
  "Léger" / "I lehtë" in es/fr/sq, the review-depth meaning (the review-depth entry
  already has `msgctxt "translation review depth"`). In #803's import strings, 45 of 131
  had to be rewritten to match the pt-BR glossary: "source" had become *fonte*, which
  means typeface in this app, and the stepper's "Review details" (a verb) became
  "Detalhes da revisão" ("details of the review"). Nothing flagged any of them.
- **Broken mechanics.** The script sends the msgid still escaped (`line.slice(7, -1)`)
  and escapes the answer again (`.replace(/"/g, '\\"')`), so the decoded string carries
  a stray backslash that shows on screen.

  | Locale | Placeholder renamed (shows blank) | Stray `\` before a quote | Reviewed |
  |---|---|---|---|
  | pt-BR | 0 | 0 | yes (#920) |
  | es | **11**, incl. `Run {stageLabel}` → `Ejecutar {0}` | 5 | no |
  | fr | 0 | 6 | no |
  | sq | 0 | 1 | no |

- **Fit can only be judged on screen.** Short labels (≤30 characters) already longer
  than 1.5× the English: pt-BR 432, es 537, fr 564, sq 429. Most of them fit. #900's
  1280×720 walk of 134 screens in pt-BR found 12 that didn't, each in a specific layout
  (`line-clamp-2`, a fixed-width span, a 4-column grid).
- **The rules that fixed pt-BR aren't in the repo.** #900's glossary, placeholder check
  and truncation harness live in an archived local workspace.

## Goals

- Strings are translated **from where they are used** (where the text renders, a note
  for translators where the English is ambiguous), never from a list of empty keys.
- One shared glossary says what each product term means, so one concept always gets the
  same word in every locale.
- A translated string is checked **on the screen where it appears**, against English,
  for unexpected line breaks and cut-off or clipped words.
- The author can get an HTML report of the changed strings and screenshots in every
  locale.
- Mechanical errors (placeholders, tags, stray escapes, invalid ICU, forbidden terms)
  are caught on the author's machine, before the PR.
- The PR shows how its translations were made, in a section the skill writes.
- No key-based translation path remains for the Studio catalogs.
- The es, fr and sq catalogs are reviewed with the new workflow, as pt-BR was in #920.

## Non-goals

- **Other catalogs.** The desktop shell's (`apps/desktop/src/renderer/src/locales/`,
  12 strings, no `sq`) and the reader's (`apps/adt-runtime`). An issue for the desktop
  catalogs is filed with this spec's PR.
- **Checking translations in CI.** CI keeps today's checks: strings are extracted, the
  catalogs compile, nothing is left untranslated. Everything else runs on the author's
  machine, and no test reads the real catalogs.
- **Committed test data.** No fixture book and no committed mocks (§4).
- **A full-app walk.** The screen check is on demand and targeted.
- **Electron-only layouts, dark mode and RTL.** The screen check drives the web dev
  server, so `isElectron()` layouts (the 4-column Notifications grid) and the dark theme
  are checked by hand in `pnpm dev:desktop` when changed. No locale is right-to-left.
- **Redesigning layouts that are too tight in every locale**: the segmented control,
  the export descriptions' `line-clamp-2` and the Notifications tiles from #920. Issues
  for them are filed with this spec's PR.
- **A native-speaker approval gate.** The team has no native fr or sq speakers. Quality
  comes from the render sites, the glossary and the screen check.
- **Machine translation inside the app or of book content.** Only Studio's UI catalogs.

## Proposed design

### The workflow, end to end

A developer whose change adds or edits strings asks their agent to translate. The
`translate` skill runs this, following `docs/I18N_TRANSLATION_QUALITY.md`:

1. **List** the entries changed since the PR's base branch, and find each one's call
   sites.
2. **Follow each string to where it renders.** A `t` or `<Trans>` call site is the
   render site. A `msg` or `defineMessage` descriptor (844 uses in 70 files) is defined
   in one place, often a constant like `THEME_OPTIONS`, and rendered elsewhere; the agent
   follows it to the component that shows it. When one msgid renders in several places
   ("Off" has 8 call sites), the translation must work in every one, or the places that
   need different words get their own `context`. At the render site: is it a button,
   heading, badge, aria-label, tooltip, toast? What is next to it, and how much room
   does it have?
3. **Translate** into every locale by meaning, using the glossary.
4. **Annotate** ambiguous English with a Lingui `comment`, or a `context` when the same
   English needs different translations.
5. **Check** with `extract`, `i18n:lint` and `i18n:screens` on the changed screens,
   mocking what the author's data doesn't reach (§4), with `--report` when asked. Fix or
   explain each finding.
6. **Declare** the work in the PR's Translations section (§9).

Worked example, the theme option "Light". The call site is `THEME_OPTIONS`
(`apps/studio/src/components/app/screens/settings/options.ts`), a `msg` descriptor
rendered as a theme card in Settings → Appearance, so the agent knows it is the colour
scheme, not a weight. The other "Light" in the catalog already has
`context: "translation review depth"` (`LanguageSettings.tsx`), so the agent gives this
one `context: "theme"` and translates it as the opposite of "Dark" in each locale:
pt-BR keeps "Claro", and es, fr and sq change from "Ligero", "Léger" and "I lehtë". The
screen check opens Settings → Appearance in each locale and compares the theme cards
with English. Nothing wraps, so the PR lists the screen as checked with no findings.

### 1. Translation starts from where the string renders

The catalogs keep `origins: false`. `pnpm --filter @adt/studio i18n:origins
"<msgid>" [--context <ctx>]` prints a string's call sites by running `lingui extract` with
a generated config; it never writes to `src/locales/`. Meaning that has to last goes on
the string as a Lingui `comment` or `context`, so the next translator gets it from the
catalog.

`docs/I18N_TRANSLATION_QUALITY.md` is the single source of truth: a translation is done
when it is right in **meaning**, right in **mechanics** and **fits** where the English
fits. It also defines the glossary, rules, steps and mock file formats.
`.claude/skills/translate/SKILL.md` runs the workflow and links to the guide (`.gitignore`
ignores all of `.claude/` today, so it becomes `.claude/*` with `!.claude/skills/`).
`AGENTS.md` points to the guide for agents that don't load skills.

**Adding a locale** uses the same workflow in batches by screen area, glossary first.
`docs/I18N_ADD_LANGUAGE.md` describes it in place of the script.

### 2. One shared glossary

The hard part of a glossary is the same in every language: what the English means in
this product (Stage vs Step, source vs font, template vs model, activity types, tone).
So there is one file, `apps/studio/i18n/glossary.md`: one row per product term, with its
English meaning, what it must not be confused with, and one column per locale for the
chosen word. pt-BR's column starts from #900's glossary; the others follow each locale's
established UI terminology. Adding a locale adds a column.

`apps/studio/i18n/glossary.rules.json` holds the rules the lint enforces: names kept in
English, and forbidden terms per locale, scoped by `msgctxt` or an English pattern. A
forbidden term is added only after it was seen going wrong, not in advance; today that is
pt-BR *fonte* where the English says "source".

### 3. Mechanical errors are caught before the PR

`pnpm --filter @adt/studio i18n:lint` runs offline on active entries. It parses with
`@lingui/format-po` and with the ICU parser Lingui itself uses (`@messageformat/parser`,
declared at the version already in the lockfile), so "valid" means what `lingui compile`
means. It **errors** across every catalog on what breaks at runtime or on screen, and
**warns** only on entries changed since `--base` (default `origin/develop`) on what
deserves a look on screen. AC-3 to AC-7 list the rules. The skill runs it; CI doesn't.

### 4. The fit is checked on the author's running app

`pnpm --filter @adt/studio i18n:screens --url <url> [--url <url> …]` drives the web dev
server (`pnpm dev`) with Playwright (already in the workspace; Studio adds it at the same
version) in a fresh profile at 1280×720. It loads each URL once per locale with
`?lang=<locale>`, which outranks the stored locale (`apps/studio/src/main.tsx`).

- **Detection.** It flags text that wraps, is cut off, clipped or spills out in a locale
  **but not in English on the same screen**, so long data doesn't flag. It is #900's
  detector, split into an in-page measurement and a pure classification. Elements are
  matched to English by structural path or test id; unmatched ones are reported, not
  flagged.
- **Wrong page.** A capture whose path differs from the requested one fails and says
  where it landed, instead of checking the wrong screen.
- **State behind an action.** `--steps <file>` (click, hover, press, wait) opens dialogs,
  menus and tooltips before each capture.
- **Data.** The author's API by default. Where it doesn't reach (a book screen with no
  book, an error, a slow load, a stage mid-run), `--mock <file>` answers those requests
  in the browser. Book content is never translated, so any well-formed data renders the
  UI that is. The agent writes the mocks for the session and can check a body against an
  `@adt/types` schema; nothing is committed, so nothing goes stale. Mocked captures are
  marked.
- **Browser-only state** (a local toggle) may be forced with a temporary, marked edit to
  a component file, only on a clean working tree. The skill reverts it, and `i18n:lint`
  fails on a leftover marker.
- **Not checked.** What none of these reach is declared not checked. The exit code is
  non-zero when a locale has a finding English doesn't.

### 5. An optional HTML report

`--report` writes a self-contained HTML page to `apps/studio/.i18n-screens/report/`
(gitignored) or `--out <dir>`: per screen, English and every locale side by side, crops
of the findings, and the changed strings with each locale's translation.

A script writes it, so the report costs no tokens. Tokens go to the agent's own work:
reading render sites (~1–3k per changed string), writing mocks (~2–5k per mocked screen)
and viewing images (~1.2k per full screenshot, so ~18k to look at all of 3 screens × 5
locales, ~1–3k for flagged crops only). Capturing 3 screens takes about a minute (#900
measured ~4.5 s per screen per locale).

### 6. The key-based translator is removed

Delete `translate-missing.ts`, its package script, the `ai` and `@ai-sdk/openai`
devDependencies and `LOCALE_NAMES` (only the script uses them). In the CI `i18n` job,
remove the warn, auto-translate and re-verify steps, `continue-on-error` and
`contents: write`, so an empty `msgstr` fails the PR; its other checks stay as they are.
`TRANSLATE_MODEL` becomes unused (`ci.yml:85` only) and can be deleted; `OPENAI_API_KEY`
stays for `release.yml`. Docs that describe the script are updated, and "Lingui v5"
becomes v6.

### 7. Existing bugs are fixed

The 11 es placeholders, the 12 stray backslashes and the theme "Light", each translated
from where it renders.

### 8. The tools are tested

The studio Vitest project and `pnpm typecheck` don't cover `apps/studio/scripts/` today;
both are extended. Tests use fixture catalogs and a static HTML page, never the real
catalogs, and the browser test skips without Chromium.

### 9. The PR shows what the skill did

The PR template gets a **Translations** section. The skill's last step writes it,
opening with "Translated with the `translate` skill.", then: the strings and locales;
for each string that is ambiguous or has a `context` or `comment`, the meaning chosen, in
English ("Light: colour theme, not weight"), so a reviewer who doesn't speak the locale
can check it; the lint result, the screens checked with findings and fixes,
mocked captures, what wasn't checked and why, and the report if one was made. Nothing
enforces it; a PR that changes strings without it is a reason to ask.

## Impact map

- **Removed:** `apps/studio/scripts/translate-missing.ts`, the `translate:missing`
  script, the `ai` and `@ai-sdk/openai` devDependencies, `LOCALE_NAMES`, 3 CI steps and
  the job's write permission.
- **Added:** `apps/studio/i18n/glossary.md`, `apps/studio/i18n/glossary.rules.json`,
  `apps/studio/scripts/i18n/` (lint, origins, screens, mocks, report, and their tests on
  fixture data), `apps/studio/scripts/tsconfig.json`, `docs/I18N_TRANSLATION_QUALITY.md`,
  `.claude/skills/translate/SKILL.md`. ADR 029 lands as `proposed` with this spec's PR.
- **Changed:**
  - `.github/workflows/ci.yml` (translate steps and write permission removed)
  - `vitest.config.ts` and the root `tsconfig.json` (cover `apps/studio/scripts/`)
  - `.gitignore` (track `.claude/skills/`, ignore `apps/studio/.i18n-screens/`)
  - `apps/studio/package.json`: scripts; `playwright` and `@messageformat/parser` at
    the versions already in `pnpm-lock.yaml`; `ai` and `@ai-sdk/openai` removed
  - all 5 catalogs (§7) and the `THEME_OPTIONS` call site
  - `apps/studio/src/i18n/locales.ts`
  - `AGENTS.md`, `.github/pull_request_template.md`, `README.md`,
    `docs/I18N_ADD_LANGUAGE.md`
- **Invariants:** none touched. No entity, ID, staleness, layering or prompt-contract
  change; the scripts sit outside the app bundle and import nothing from `packages/*`.
- **Migration:** none.
- **Collides with:** every open PR that adds strings meets the hard failure once it
  rebases, notably #803 and the strings #823 will add.

## Acceptance criteria

- [ ] AC-1: `translate-missing.ts`, `translate:missing`, the `ai` and `@ai-sdk/openai`
  devDependencies and `LOCALE_NAMES` are gone, and the CI `i18n` job has no step that
  translates, commits or pushes, and no `contents: write`.
- [ ] AC-2: In the CI `i18n` job, `compile --strict` has no `continue-on-error`, so an
  empty `msgstr` fails the job on a pull request.
- [ ] AC-3: `i18n:lint` errors on a placeholder or tag that differs from the msgid,
  including inside plural and select branches, and on a `msgstr` that isn't valid ICU.
- [ ] AC-4: `i18n:lint` errors on a backslash in the decoded `msgstr` that the msgid
  doesn't have, and accepts a correctly escaped quote.
- [ ] AC-5: `i18n:lint` errors on a forbidden term only within the rule's `msgctxt` and
  `msgid` scope, matching on word boundaries.
- [ ] AC-6: `i18n:lint` warns, only for changed entries and never failing, on a label of
  ≤30 characters longer than 1.5× the English or a `msgstr` identical to a non-name msgid.
- [ ] AC-7: Without a resolvable base, `i18n:lint` reports that warnings were skipped and
  still runs every error check. Obsolete `#~` entries are ignored.
- [ ] AC-8: No workflow runs `i18n:lint`, `i18n:screens` or `i18n:origins`, and no test
  in `pnpm test` reads `apps/studio/src/locales/`.
- [ ] AC-9: The 11 es placeholders, 12 stray-backslash strings and the theme "Light" are
  fixed; the theme option has its own `context` and translation in every locale.
- [ ] AC-10: The glossary has a column for pt-BR, es, fr and sq, every term states its
  English meaning, the rules file validates against its schema, and
  `i18n:lint` passes on every catalog with them.
- [ ] AC-11: `i18n:origins "<msgid>"` prints every call site of the msgid, plurals and
  multi-line entries included, and leaves `src/locales/` unchanged.
- [ ] AC-12: The detector flags a locale element that wraps, clips or is cut off when the
  matched English element doesn't, doesn't flag one that behaves like English, and
  reports elements with no English match as unmatched.
- [ ] AC-13: `i18n:screens --url` captures English and every locale at 1280×720, even
  when the URL already has a `lang`; fails a capture that lands on another path; runs
  `--steps` before each capture; and exits non-zero on a finding English doesn't have.
- [ ] AC-14: `i18n:screens --report` writes a self-contained `index.html` (no network
  requests) with, per screen, side-by-side screenshots, outlined crops of findings,
  unmatched elements and the changed strings per locale.
- [ ] AC-15: `vitest.config.ts` collects `apps/studio/scripts/**/*.test.ts`, and the root
  typecheck includes `apps/studio/scripts/tsconfig.json`.
- [ ] AC-16: The guide and the `translate` skill exist, `AGENTS.md` links the guide, and
  no doc describes `translate:missing` or says Lingui v5 for Studio.
- [ ] AC-17: With `--mock`, a request matching an entry gets its status, body, event
  stream, image or delay; an unmatched request reaches the real API; and a body that
  fails its named `@adt/types` schema stops the run before any capture. The report marks
  captures that used mocks.
- [ ] AC-18: `i18n:lint` errors on an `i18n-screens: temporary` marker under `apps/`,
  and the skill refuses to force a state while `git status --porcelain` isn't clean.
- [ ] AC-19: The PR template has a Translations section, and the skill ends by writing
  it with every item in §9.

## Test plan

Tests cover the tools' code on fixture data; translations are checked on the author's
machine and shown in the PR (§9). The detector's classification is pure and unit-tested
on recorded measurements. The browser test skips without Chromium (as in CI), so PR 1
records a local run and a manual run against Studio. Tests live in
`apps/studio/scripts/i18n/`.

| AC | Level | Test file, or where it's shown |
|----|-------|------|
| AC-1, AC-2, AC-8, AC-15 | config | `ci-config.test.ts` (reads `ci.yml`, `package.json`, `vitest.config.ts`, `tsconfig.json`) |
| AC-3 – AC-7, AC-18 (marker) | unit | `lint.test.ts` |
| AC-9 | local | PR 1's Translations section (lint and Settings → Appearance) |
| AC-10 | unit + local | `glossary.test.ts`; PR 2's Translations section |
| AC-11 | unit | `origins.test.ts` |
| AC-12 | unit | `detector.test.ts` |
| AC-13, AC-14, AC-17 | unit + integration (local) | `screens.test.ts`, `mocks.test.ts` |
| AC-16, AC-19 (template) | unit | `docs.test.ts` |
| AC-18 (refusal), AC-19 (skill) | local | PR 1's and PR 2's Translations sections |

## Rollout

Two PRs. The first is above the ~1000-line review budget (SDD §9), about 2,000 changed
lines; the owner accepted that, because its parts only make sense together: removing
the translator without the workflow that replaces it leaves no way to translate.

1. **Tooling and the switch (AC-1 – AC-9, AC-11 – AC-19).** Removes the key-based
   translator and makes empty translations fail; adds the lint, origins, the screen
   check with steps, mocks and report, the guide, the skill and the PR template section;
   fixes §7's bugs, since the lint fails on them; marks ADR 029 accepted. Reverting it
   restores the old script and CI steps.
2. **Languages (AC-10).** The glossary and rules file, then a review of the es,
   fr and sq catalogs with the skill, as #920 did for pt-BR, with the HTML report
   attached since reviewers don't speak most of the locales. Catalogs don't count toward
   the budget (SDD §3); the rest is about 600 lines.

### Risks

- **Contributors without an agent** now translate four locales by hand, or ask a
  maintainer to. The project's contributors all work with agents today; the guide and
  glossary are written so a person can follow them too. ADR 029 records the decision.
- **Translations nobody checked.** CI only proves every string has a translation, so a
  contributor who skips the skill can still merge a bad one. The missing Translations
  section is what shows it, and the reviewer asks for it.
- **A forced state left in the code.** The skill only forces state on a clean tree and
  reverts it, and the lint fails on a leftover marker.
- **A mock that renders what the real app never would** can hide or invent a fit
  problem. Mocked captures are marked in the report and the PR.
- **Open PRs with empty translations** start failing after PR 1. The PR 1 description
  lists them, and the failure message points to the guide.
- **A missed screen.** The Translations section lists what wasn't checked, and the
  languages PR walks the app as #900 did.
