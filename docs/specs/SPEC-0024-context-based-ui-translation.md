---
id: SPEC-0024
title: Context-based UI translation with an on-screen fit check
status: in-review
owner: "@Eliezir"
approvers: []
issues: ["#937"]
prs: []
adr: "docs/DECISIONS.md#029-ui-strings-are-translated-from-context-in-the-authors-session-not-by-ci"
created: 2026-11-11
updated: 2026-11-11
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

Every path starts from a list of empty `msgstr` entries:

- **Locally, with the script.** `pnpm --filter @adt/studio translate:missing`
  (`apps/studio/scripts/translate-missing.ts`, 203 lines) sends the model a JSON array of
  bare English strings: no glossary, no call site, no length limit.
- **Locally, with an agent.** Asked to "translate the missing strings", an agent works
  from the `.po` file. The catalogs carry no file references (`origins: false` in
  `apps/studio/lingui.config.ts`), so it sees the same bare keys.
- **In CI, as a rarely used fallback.** `compile --strict` runs with
  `continue-on-error` on pull requests. An empty `msgstr` makes the `i18n` job run the
  same script, commit as `github-actions[bot]` and push to the PR branch (hence
  `permissions: contents: write`).

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
- Each locale has a glossary, so one concept always gets the same word.
- A translated string is checked **on the screen where it appears**, against English,
  for unexpected line breaks and cut-off or clipped words.
- The author can get an HTML report of the changed strings and screenshots in every
  locale.
- Mechanical errors (placeholders, tags, stray escapes, invalid ICU, forbidden terms)
  fail CI.
- No key-based translation path remains for the Studio catalogs.

## Non-goals

- **Other catalogs.** The desktop shell's own catalogs
  (`apps/desktop/src/renderer/src/locales/`, 12 strings, Lingui 5, no `sq`, not checked
  in CI) and the reader's strings (`apps/adt-runtime`) are out of scope. An issue for the
  desktop catalogs is filed with this spec's PR.
- **Full catalog reviews of es, fr and sq.** They apply this spec's guide and
  glossaries, as follow-up fast-lane issues, one PR per locale like #920.
- **Faked API responses.** The screen check runs against a real API: the author's, with
  the sample book (§4) imported when the author has none.
- **A full-app walk, in CI or nightly.** The screen check is on demand and targeted.
- **Electron-only layouts, dark mode and RTL.** The screen check drives the web dev
  server in a fresh browser profile: layouts that depend on `isElectron()` (such as the
  4-column Notifications grid) and the dark theme are not captured, and no supported
  locale is right-to-left. A change to those surfaces is checked by hand in
  `pnpm dev:desktop` and declared in the PR.
- **Redesigning layouts that are too tight in every locale**: the segmented control,
  the export descriptions' `line-clamp-2` and the Notifications tiles from #920. Issues
  for them are filed with this spec's PR.
- **A native-speaker approval gate.** The team has no native fr or sq speakers. Quality
  comes from the glossary, an independent second-agent review and the screen check.
- **Machine translation inside the app or of book content.** Only Studio's UI catalogs.

## Proposed design

### The workflow, end to end

A developer whose change adds or edits strings asks their agent to translate. The
`translate` skill runs this, following `docs/I18N_TRANSLATION_QUALITY.md`:

1. **List** the entries changed since the PR's base branch (see §3 for "changed"), and
   find each one's call sites.
2. **Follow each string to where it renders.** A `t` or `<Trans>` call site is the
   render site. A `msg` or `defineMessage` descriptor (844 uses in 70 files) is defined
   in one place, often a constant like `THEME_OPTIONS`, and rendered elsewhere; the agent
   follows it to the component that shows it. When one msgid renders in several places
   ("Off" has 8 call sites), the translation must work in every one, or the places that
   need different words get their own `context`. At the render site: is it a button,
   heading, badge, aria-label, tooltip, toast? What is next to it, and how much room
   does it have?
3. **Translate** into every locale by meaning, using that locale's glossary.
4. **Annotate** ambiguous English with a Lingui `comment`, or a `context` when the same
   English needs different translations.
5. **Check** with `extract`, `i18n:lint` and `i18n:screens` on the changed screens,
   with `--report` when asked. A state no click reaches is forced temporarily, and book
   screens use the sample book when the author has no book (§4). Fix or explain each
   finding.
6. **Declare** in the PR's i18n section: locales translated, screens checked, findings,
   and what was not checked with the reason.

Worked example, the theme option "Light". The call site is `THEME_OPTIONS`
(`apps/studio/src/components/app/screens/settings/options.ts`), a `msg` descriptor
rendered as a theme card in Settings → Appearance, so the agent knows it is the colour
scheme, not a weight. The other "Light" in the catalog already has
`context: "translation review depth"` (`LanguageSettings.tsx`), so the agent gives this
one `context: "theme"` and translates it as the opposite of "Dark" in each locale:
pt-BR keeps "Claro", and es, fr and sq change from "Ligero", "Léger" and "I lehtë". The
screen check opens Settings → Appearance in each locale and compares the theme cards
with English. Nothing wraps, so the PR lists the screen as checked with no findings.

### 1. Translation starts from where the string renders, not the key

The catalogs keep `origins: false`. A new `pnpm --filter @adt/studio i18n:origins
"<msgid>" [--context <ctx>]` runs `lingui extract` with a generated temporary config
(origins on, absolute `include` paths, catalogs written under a temp directory) and
prints the call sites, plurals and multi-line entries
included. It never writes to `src/locales/`. Meaning that has to last goes on the
string itself, as a Lingui `comment` or `context`, so the next translator gets it from
the catalog.

`docs/I18N_TRANSLATION_QUALITY.md` is the single source of truth: a translation is done
when it is right in **meaning**, right in **mechanics** and **fits** where the English
fits. `.claude/skills/translate/SKILL.md` runs the workflow and links to the guide
instead of copying it. `AGENTS.md` points to the guide, so agents that don't load skills
follow the same rules, and `.github/pull_request_template.md` replaces its i18n checkbox
with the i18n section from step 6.

**Adding a locale** (about 4,300 empty entries) uses the same workflow in batches by
screen area: the agent groups msgids by the file that renders them, translates one area
at a time with the glossary it writes first, and runs `i18n:lint` and `i18n:screens` on
that area. `docs/I18N_ADD_LANGUAGE.md` describes this in place of the script.

### 2. Each locale has a glossary

`apps/studio/i18n/glossary/<locale>.md` for pt-BR, es, fr and sq, each with a
`<locale>.rules.json`. pt-BR is #900's glossary with its validation amendments merged.
The others cover the same concepts: Stage vs Step, preview, table of contents, findings,
source vs font, template vs model, activity types, sentence case, voice and mood. Each
term follows the locale's established UI terminology and the catalog's majority usage,
with the reason recorded.

A rules file lists forbidden terms:
`{ "term": string, "use": string, "msgctxt"?: string[], "msgid"?: string }`. `term` is
matched case-insensitively on word boundaries in the decoded `msgstr`. With no scope
fields the rule applies to every entry; `msgctxt` limits it to those contexts and
`msgid` (a regular expression) to matching English. So "*fonte* is forbidden where the
English says source" is `{ "term": "fonte", "use": "origem", "msgid": "\\bsources?\\b" }`.

### 3. Mechanical errors fail CI

`pnpm --filter @adt/studio i18n:lint`, with no network and no browser. It reads active
entries only; obsolete `#~` entries (176 per locale today) are skipped.

- **Errors** (whole catalog, every locale), on decoded strings:
  - placeholder names or rich-text tags that differ from the msgid, plural and select
    branches included (#900's check)
  - a `msgstr` that doesn't parse as ICU MessageFormat (for example an apostrophe that
    quotes a `{`)
  - a backslash the msgid doesn't have
  - a term the locale's rules forbid
  - an `i18n-screens: temporary` marker left in `apps/studio/src/` (§4)
- **Warnings** (changed entries only):
  - a label of ≤30 characters longer than 1.5× the English
  - a `msgstr` identical to its msgid, unless the msgid is listed as a name in the
    locale's glossary (English left in)

  Whole-catalog warnings would be hundreds of strings that fit, so a warning only says
  "check this one on screen".

An entry is **changed** when its `(msgctxt, msgid)` pair is not in the base branch's
catalog for that locale, or its `msgstr` differs. The base is `--base <ref>`, defaulting
to `origin/develop`; in CI it is `origin/${{ github.base_ref }}`, so PRs to `main` work
too. The `i18n` job checks out with `fetch-depth: 0`. When the base can't be resolved
(a shallow clone, a fork without the ref) the lint prints that warnings were skipped and
still runs every error.

It runs in the CI `i18n` job and in `pnpm test` through a catalog test.

### 4. The fit is checked on the author's running app

`pnpm --filter @adt/studio i18n:screens --url <url> [--url <url> …]` targets the web dev
server (`pnpm dev`); the desktop renderer reaches its API through Electron and can't be
driven by URL. It launches Playwright with a fresh profile at 1280×720, seeds
`adt-studio-onboarding-completed` (otherwise `routes/_app.tsx` redirects every route to
`/onboarding`), and loads each URL once per locale with `?lang=<locale>`, replacing any
`lang` already in the URL, because `?lang` outranks the stored locale
(`apps/studio/src/main.tsx`).

- **Detection.** It flags text that wraps, is cut off, is clipped or spills out of its
  box in a locale **but not in English on the same screen**, so data such as a long book
  title doesn't flag. The detector is #900's, split into an in-page measurement and a
  pure classification step.
- **Matching.** An element in a locale is compared with the English element at the same
  structural path (the chain of tag names and sibling indexes from `body`), or with the
  same `data-testid` or `data-id` when present. Elements with no English counterpart,
  such as list rows reordered by translated name, are reported as unmatched, not as
  findings.
- **State behind an action.** Dialogs, menus, toasts, tooltips and hover states are
  captured when the author passes the steps that open them: `--steps <file>`, a short
  list of `click`, `hover`, `press` and `wait` actions by role and accessible name or by
  test id, run in every locale before capture.
- **State no action reaches.** An error, a loading or empty state, a stage mid-run: the
  skill may force it with a temporary source edit (an `open` set to `true`, a hook
  returning a fixed value), captured through the dev server's hot reload and then
  reverted. Before the first edit it stops and asks the author to commit or stash
  their pending changes, and refuses while the files it would touch are modified.
  Every forced line carries an `i18n-screens: temporary` comment; the skill restores the
  files with `git restore`, confirms `git status` matches what it was before, and
  `i18n:lint` errors on the marker anywhere under `apps/studio/src/`, so a forced state
  can't be committed.
- **Data.** The author's API, as it is. Home, library, settings, the wizard and
  onboarding work on an empty library, and book screens work on any book the author
  has. When a changed string renders on a screen that needs a book (a book page, a
  pipeline stage, the editor, export) and the author has none in a usable state,
  `i18n:screens --sample-book` imports the sample book through `POST /books/import`
  under a reserved label and opens its screens; `--remove-sample-book` deletes it
  afterwards. The sample book is a short project archive committed under
  `apps/studio/i18n/sample-book/`, made from redistributable content and run through
  every stage, so each stage's screens have data. A CI test imports it with the current
  code, so a change to the book format that breaks it fails the PR that makes the
  change, not the next translator. Only PRs whose strings render on book screens need
  it. A screen still out of reach is declared not checked.
- **Exit code.** Non-zero when a locale has a finding English doesn't.

Playwright is already used in the workspace (`packages/pipeline`); `@adt/studio` adds it
as a devDependency at the same version, so no new package version enters the lockfile.

### 5. An optional HTML report

`i18n:screens --report` writes a self-contained `index.html`, with its images in the
same folder, to `.context/<TASK-KEY>/i18n-report/` (never committed). It has a summary
(screens × locales checked, findings per locale, unmatched elements, what was not
checked), then one section per screen: English and every locale side by side, outlined
crops of flagged elements, and a table of the changed strings with their
`comment`/`context` and each locale's translation.

A script writes the report, so it costs no LLM tokens. Tokens are spent only when an
agent looks at images; the skill has it view flagged crops and open a full screenshot
only when it can't tell otherwise.

| | Typical PR (3 screens × 5 locales) | Large PR (10 screens × 5) |
|---|---|---|
| Captures | 15 | 50 |
| Time (#900 measured ~4.5 s per screen per locale) | ~1 min | ~4 min |
| Tokens viewing every full screenshot (~1.2k each at 1280×720) | ~18k | ~60k |
| Tokens viewing only flagged crops | ~1–3k | ~3–8k |

Translating from context also costs more than today's single batched call: reading the
render sites is roughly 1–3k tokens per changed string, so the low tens of thousands
for a typical PR of 5–20 strings, in a session the author is already running. Costs are
in tokens because the price depends on the author's model.

### 6. The key-based translator is removed

Delete `translate-missing.ts`, the `translate:missing` script, the `ai` and
`@ai-sdk/openai` devDependencies (only the script uses them) and `LOCALE_NAMES` with its
comment in `apps/studio/src/i18n/locales.ts` (same). In the CI `i18n` job, remove the
warn, auto-translate and re-verify steps, drop `continue-on-error` from
`compile --strict` and drop `contents: write`. An empty `msgstr` now fails the PR. The
`OPENAI_API_KEY` and `TRANSLATE_MODEL` secrets stay: `release.yml` and
`regenerate-release-assets.yml` still use them; only the `i18n` job stops reading them. `README.md`
and `docs/I18N_ADD_LANGUAGE.md`, which document the script, are updated, and they and
`AGENTS.md` are corrected from "Lingui v5" to v6 (`@lingui/*` is `^6.4.0`).

### 7. Existing bugs are fixed first

The 11 es placeholders, the 12 strings with a stray backslash in es/fr/sq, and the theme
"Light" (its own `context`, translated in every locale). Each is translated from where
it renders, not patched.

### 8. The new scripts are tested and typechecked

Today the studio Vitest project collects only `apps/studio/src/**/*.test.ts(x)`
(`vitest.config.ts`), and `apps/studio/tsconfig.json` includes only `src`, so tests
under `apps/studio/scripts/` would be skipped silently. The studio project adds
`apps/studio/scripts/**/*.test.ts`, and an `apps/studio/scripts/tsconfig.json` joins
`pnpm typecheck`.

## Options

| Option | Cost (rough) | Why not / why |
|---|---|---|
| **A. Keep `translate:missing`, feed it the glossary and call sites** | ~150 lines in the script, plus an origins map | Still batch-translates a list of keys: a file path isn't the rendered component, and it still can't see whether the result fits. Rejected. |
| **B. Translate from context in the author's session, check on the author's running app** (chosen) | Removes ~300 lines; adds the lint (~300), screen check and report (~650, ported from #900), the sample book, guide, skill, 4 glossaries | Contributors already translate locally with an agent; this changes what it starts from and adds the check that the result fits. |

Translating in CI is not an option under either: CI never writes to a PR. A missing
translation fails the `i18n` job, and the author translates it in their session.

Two sub-choices:

- **Call sites in the catalogs (`origins: true, lineNumbers: false`)** was rejected:
  catalogs grow about 80%, and moving or renaming a component rewrites all 5 files and
  causes conflicts between parallel PRs. A file path says where a string is defined,
  not what it means or where a `msg` descriptor renders; `i18n:origins` gives the first
  on demand and `comment`/`context` keep the second.
- **Data for the screen check.** Faked API responses drift silently with the API and
  were rejected. The author's running app is the default and needs no data of its own.
  A sample book covers book screens when the author has none; it can drift with the book
  format (#900's copies needed `layout_type` patched), so it is imported by the real
  import in a CI test, which turns drift into a failing test.

## Impact map

- **Removed:** `apps/studio/scripts/translate-missing.ts`, the `translate:missing`
  script, the `ai` and `@ai-sdk/openai` devDependencies, `LOCALE_NAMES`, 3 CI steps and
  the job's write permission.
- **Added:** `apps/studio/i18n/glossary/{pt-BR,es,fr,sq}.{md,rules.json}`,
  `apps/studio/scripts/i18n/` (lint, origins, screens, report) with tests,
  `apps/studio/scripts/tsconfig.json`, the sample book under
  `apps/studio/i18n/sample-book/`, `docs/I18N_TRANSLATION_QUALITY.md`,
  `.claude/skills/translate/SKILL.md`. ADR 029 (`docs/DECISIONS.md`) lands as `proposed` with
  this spec's PR.
- **Changed:**
  - `.github/workflows/ci.yml` (steps, permission, `fetch-depth: 0`)
  - `vitest.config.ts` (studio project includes `scripts/`) and the root typecheck
  - `apps/studio/package.json` (scripts, devDependencies)
  - all 5 catalogs (§7; adding `context: "theme"` creates a new entry in each and
    retires the old one as `#~`), the `THEME_OPTIONS` call site
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
- [ ] AC-6: `i18n:lint` warns about a label longer than 1.5× the English, or a `msgstr`
  identical to a non-name msgid, only for changed entries, and never fails on them.
- [ ] AC-7: Without a resolvable base, `i18n:lint` reports that warnings were skipped and
  still runs every error check. Obsolete `#~` entries are ignored.
- [ ] AC-8: `i18n:lint` runs in the CI `i18n` job and in `pnpm test`, and passes on all
  catalogs.
- [ ] AC-9: The 11 es placeholders, 12 stray-backslash strings and the theme "Light" are
  fixed; the theme option has its own `context` and translation in every locale.
- [ ] AC-10: Glossaries and rules files exist for pt-BR, es, fr and sq, every term in a
  glossary states its reason, every rules file validates against its schema, and each
  locale's rules pass on its current catalog.
- [ ] AC-11: `i18n:origins "<msgid>"` prints every call site of the msgid, plurals and
  multi-line entries included, and leaves `src/locales/` unchanged.
- [ ] AC-12: The detector flags a locale element that wraps, clips or is cut off when the
  matched English element doesn't, doesn't flag one that behaves like English, and
  reports elements with no English match as unmatched.
- [ ] AC-13: `i18n:screens --url` reaches the URL past onboarding in a fresh profile,
  captures English and every other locale at 1280×720 even when the URL already has a
  `lang`, runs `--steps` before each capture, and exits non-zero on a finding English
  doesn't have.
- [ ] AC-14: `i18n:screens --report` writes a self-contained `index.html` (no network
  requests) with, per screen, side-by-side screenshots, outlined crops of findings,
  unmatched elements and the changed strings per locale.
- [ ] AC-15: Tests under `apps/studio/scripts/` run in `pnpm test`, and the scripts are
  covered by `pnpm typecheck`.
- [ ] AC-16: The guide, the `translate` skill, the `AGENTS.md` pointer, the PR template
  i18n section exist, ADR 029 is `accepted`; no doc still describes `translate:missing`, and none
  says Lingui v5 for Studio.
- [ ] AC-17: The sample book imports with the current code and reaches every stage's
  screens, `--sample-book` imports it and `--remove-sample-book` deletes it.
- [ ] AC-18: `i18n:lint` errors on an `i18n-screens: temporary` marker under
  `apps/studio/src/`, and the skill refuses to force a state while the files it would
  edit have uncommitted changes.

## Test plan

Classification is pure, so the detector is unit-tested on recorded measurements; CI has
no browser installed. The browser parts are covered by one integration test over a
static HTML fixture that skips with a message when Chromium is missing, run locally by
the implementing PR, plus a manual run against Studio.

| AC | Level | Location | Test title |
|----|-------|----------|------------|
| AC-1, AC-2 | config | `apps/studio/scripts/i18n/ci-config.test.ts` (parses `ci.yml` and `package.json`) | `AC-1: …`, `AC-2: …` |
| AC-3 – AC-7 | unit | `apps/studio/scripts/i18n/lint.test.ts` | `AC-3: …` to `AC-7: …` |
| AC-8, AC-9 | catalog | `apps/studio/src/locales/catalogs.test.ts` | `AC-8: every catalog passes i18n:lint`, `AC-9: the theme option has its own context` |
| AC-10 | unit | `apps/studio/scripts/i18n/glossary.test.ts` | `AC-10: every locale has a glossary and valid rules` |
| AC-11 | unit | `apps/studio/scripts/i18n/origins.test.ts` | `AC-11: lists call sites without touching catalogs` |
| AC-12 | unit | `apps/studio/scripts/i18n/detector.test.ts` | `AC-12: flags only what differs from English` |
| AC-13, AC-14 | integration (local) + manual | `apps/studio/scripts/i18n/screens.test.ts`; running Studio | `AC-13: …`, `AC-14: …` |
| AC-15 | CI | a deliberately failing test under `scripts/` fails `pnpm test` (checked once in the PR) | — |
| AC-16 | review | the docs listed in the Impact map | — |
| AC-17 | integration | `apps/api/src/services/import-service.sample-book.test.ts` (import); `screens.test.ts` (flags) | `AC-17: …` |
| AC-18 | unit + review | `lint.test.ts` (marker); the skill's dirty-tree rule in review | `AC-18: …` |

## Rollout

Five PRs, each within the §9 review budget and reverting on its own:

1. **Catalog fixes (AC-9).** 5 `.po` files and the `THEME_OPTIONS` call site, ~80
   lines. Ships value alone: no blank buttons in es and no stray backslashes on screen.
2. **Lint, glossaries and test wiring (AC-3 – AC-8, AC-10, AC-15, AC-18's marker).** ~300 lines of lint,
   ~300 of tests, ~500 of glossary text. The script still exists at this point, but the
   lint catches what it breaks. If review finds it too large, the fr and sq glossaries
   move to their own PR.
3. **Tooling (AC-11 – AC-14).** `i18n:origins`, `i18n:screens` with steps and the
   report, and their tests, ~900 lines. Nothing changes for contributors yet.
4. **Sample book (AC-17).** The archive, the `--sample-book` flags and the import test.
   Whether one archive keeps importing as the schema moves (migrations run on open,
   `packages/storage/src/db.ts`) is answered here first; if it can't, the sample book is
   regenerated by the PR that changes the format, and the failing test says so.
5. **Switch to the context-based workflow (AC-1, AC-2, AC-16, AC-18's skill rule).** Removes the key-based
   translator, makes empty translations fail, and adds the guide, the skill and the doc
   updates, and marks ADR 029 accepted, ~400 lines added and ~300 removed. Reverting it restores the old
   script.

Follow-ups, each a fast-lane issue citing this spec: the es, fr and sq catalog reviews
(one PR per locale, a second agent checking every change).

### Risks

- **Contributors without an agent** now translate four locales by hand, or ask a
  maintainer to. The project's contributors all work with agents today; the guide and
  glossaries are written so a person can follow them too. ADR 029 records the decision.
- **A forced state left in the code.** The marker makes `i18n:lint` fail, and the skill
  only edits files with no pending changes, so a revert can't lose the author's work.
- **Open PRs with empty translations** start failing after PR 5. The PR 5 description
  lists them, and the failure message points to the guide.
- **A missed screen.** The screen check only covers what the author reaches. The PR's
  i18n section makes the gap visible, and the follow-up locale reviews walk the app as
  #900 did.
