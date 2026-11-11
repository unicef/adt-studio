---
id: SPEC-0024
title: Context-based UI translation with an on-screen fit check
status: in-review
owner: "@Eliezir"
approvers: []
issues: ["#937"]
prs: []
adr: ""
created: 2026-11-11
updated: 2026-11-11
---

## Problem (with evidence)

Studio's UI catalogs (`apps/studio/src/locales/*.po`, 4,303 entries per locale) are
translated **key by key**: each English string on its own, with no idea where it
appears or how much room it has. #900/#920 brought pt-BR up to a reviewed standard by
hand. Nothing keeps any locale at that standard, and the way strings get translated
works against it.

- **Every way strings get translated today is key-based.** In practice contributors
  translate locally, either by running `pnpm --filter @adt/studio translate:missing`
  (`apps/studio/scripts/translate-missing.ts`, 203 lines) or by asking their agent to
  fill the empty `msgstr` entries. The CI `i18n` job runs the same script as a fallback,
  but rarely gets there. In all three cases the input is the list of empty keys:
  - The script sends the model a JSON array of bare English strings: no glossary, no
    call site, no length limit.
  - An agent asked to "translate the missing strings" works from the `.po` file, which
    has no file references (`origins: false`), so it sees the same bare keys.
  - It is hard to keep track of the changes in all 4 translated languages, especially
    since developers don't speak most of them. Even when a translation breaks the UI,
    they can't tell which word is wrong or what a shorter replacement would be.

  A string translated alone can't tell a button from a heading, a verb from a noun
  ("Review details"), or "Light" the theme from "Light" the review depth. It also can't
  know whether the translation fits the space the English had.
- **Missing translations don't fail PRs.** `compile --strict` runs with
  `continue-on-error: ${{ github.event_name == 'pull_request' }}`. An empty `msgstr`
  triggers the CI fallback, which translates the same key-based way, then commits as
  `github-actions[bot]` and pushes to the PR branch (hence
  `permissions: contents: write`).
- **The script corrupts quotes.** `findMissingEntries` takes the msgid still escaped
  (`line.slice(7, -1)`), and `applyTranslations` escapes the model's answer again
  (`.replace(/"/g, '\\"')`). The result is a literal `\"` on screen.
- **The other catalogs carry the bugs #900 fixed in pt-BR.** Measured on `develop`
  at `4bef06d55` by parsing every entry and comparing each `msgstr` with its msgid:

  | Locale | Placeholder/tag mismatch | Literal `\"` on screen | Reviewed |
  |---|---|---|---|
  | pt-BR | 0 | 0 | yes (#920) |
  | es | **11** (e.g. `Cover of {title}` → `Portada de {0}`, shown as "Portada de ") | 5 | no |
  | fr | 0 | 6 | no |
  | sq | 0 | 1 | no |

  The 11 es strings include `Run {stageLabel}` and `Re-run {stageLabel}`, the stage
  run buttons. The theme option "Light" (no `msgctxt`) reads "Ligero" / "Léger" /
  "I lehtë", the review-depth meaning. The review-depth entry already has
  `msgctxt "translation review depth"`; the theme entry has nothing to separate it.
- **The #900 rules exist only outside the repo.** The pt-BR glossary
  (`GLOSSARY.md` plus the amendments in `VALIDATION.md`), the placeholder check
  (`phcheck.mjs`) and the 1280×720 truncation harness (`visual/harness/`, about 1,250
  lines, 134 screens) live in an archived local workspace.
- **Drift is measurable.** #803's import strings were written before #920 landed: 45 of
  131 had to be rewritten to match the glossary. "source" had become *fonte*, which
  means typeface in this app. One was a real mistranslation: the stepper's
  "Review details" (a verb) became "Detalhes da revisão" ("details of the review").
  Nothing flagged any of them.
- **Length can't be checked on the whole catalog.** Short labels (≤30 characters) that
  are already longer than 1.5× the English: pt-BR 432, es 537, fr 564, sq 429. Most of
  them fit on screen, so a length rule over the whole catalog would be noise. Only
  measuring where the string is shown tells whether it breaks the UI.

## Goals

1. Translation moves from **key-based to context-based**: strings are translated in the
   PR author's agent session from where they are used (the call site, the component it
   renders in, and a note for translators where the meaning is ambiguous), never from a
   list of empty keys.
2. Every locale has a glossary, so one concept gets one word.
3. A translated string is checked **on the screen where it appears**, against English:
   no unexpected line breaks, no cut-off or clipped words.
4. The check can produce an **HTML report** with the translations and screenshots of
   each changed screen in every locale.
5. Mechanical errors (placeholders, tags, escapes, forbidden terms) fail CI.
6. No key-based translation path remains: not the script, not the CI fallback.

## Non-goals

- **Full catalog reviews of es, fr and sq.** They apply this spec's guide and
  glossaries and come as follow-up fast-lane issues, one PR per locale like #920.
- **Committed test data for the screen check.** No fixture book and no faked API
  responses. The check runs against the app the author is already running (D5).
  A small sample project archive is a later follow-up for translation-only PRs
  (see Rollout).
- **A full-app walk, in CI or nightly.** `i18n:screens` is on demand and targeted.
- **Redesigning layouts that are too tight in every locale**, such as the segmented
  control, the export descriptions' `line-clamp-2` and the Notifications tiles from
  #920. They have their own issues.
- **A native-speaker approval gate.** The team has no native fr or sq speakers. Quality
  comes from the glossary, an independent second-agent review and the screen check.
  Native feedback is welcome but nothing waits for it.
- **Machine translation inside the app or of book content.** This spec covers only
  Studio's UI catalogs.
- **Changing the source locale or adding locales.** `docs/I18N_ADD_LANGUAGE.md` stays
  the procedure for that, updated to the new flow.

## Proposed design

### Options considered

| Option | Cost (rough) | Why not / why |
|---|---|---|
| **A. Keep `translate:missing`, feed it the glossary and call sites** | ~150 lines in `translate-missing.ts`, plus an origins map | Still batch-translates a list of keys: a file path isn't the rendered component, and it still can't see whether the result fits. The CI fallback would keep pushing unreviewed bot commits. Rejected. |
| **B. Translate in CI with a running app** | A CI job that boots API and Studio with a book, plus browser install, ~10+ min per PR | Needs committed test data and a full walk, both non-goals. Rejected. |
| **C. Translate from context in the author's session, check on the author's running app** | Removes ~250 lines (script + CI steps). Adds a lint (~250 lines), a screen check and report (~600 lines, ported from #900), a guide, a skill and 4 glossaries | **Chosen.** Contributors already translate locally with an agent; this changes what the agent starts from (call sites, not keys) and adds the check that it fits. |

### Decisions a reviewer must ratify

**D1. The key-based translator is removed everywhere; missing translations fail.**
Delete `apps/studio/scripts/translate-missing.ts` and the `translate:missing` script,
so neither contributors nor CI can translate a list of keys with it. Asking an agent to
fill empty keys is replaced by the `translate` skill (D7), which starts from call sites.
Remove the "Warn about missing translations", "Auto-translate missing strings" and
"Verify translations after auto-translate" steps. Drop `continue-on-error` from
`compile --strict`, and drop `permissions: contents: write` from the `i18n` job,
which no longer pushes. The `OPENAI_API_KEY` and `TRANSLATE_MODEL` secrets are no
longer used by this job.

**D2. Context comes from the call site and from translator notes, not from `.po` file
references.** `lingui.config.ts` keeps `formatter({ origins: false })`.

| | Origins on (`lineNumbers: false`) | Origins off + on-demand lookup (chosen) |
|---|---|---|
| Call site visible | in the `.po` itself | via `pnpm --filter @adt/studio i18n:origins "<msgid>"` |
| Catalog size | about +80% across all 5 files | unchanged |
| Moving or renaming a component | rewrites entries in all 5 catalogs | no catalog change |
| Merge conflicts between parallel PRs | more | unchanged |
| Says what the string *means* | no, only the file | via Lingui `comment` / `context` |

`i18n:origins` runs `lingui extract` with origins into a temporary directory and prints
the call sites for a msgid (exact match, plurals and multi-line entries included). It
never writes to `src/locales/`. The meaning that has to persist goes on the string
itself: a Lingui `comment` for a note ("theme option, not weight") or `context` when
the same English needs different translations (the theme "Light" gets
`context: "theme"`).

**D3. One glossary per locale, with mechanically checked forbidden terms.**
`apps/studio/i18n/glossary/<locale>.md` for pt-BR, es, fr and sq, and
`<locale>.rules.json` next to each. pt-BR is #900's `GLOSSARY.md` merged with the
amendments in its `VALIDATION.md`. The others cover the same concepts: Stage vs Step,
preview, table of contents, findings, source vs font, template vs model, activity
types, sentence case, voice and mood. Each term follows the locale's established UI
terminology and the catalog's majority usage, with the reason recorded. The rules
file lists only forbidden terms, as `{ "term": "...", "use": "...", "scope": "..." }`,
so a rule can be scoped to a concept instead of banning a word everywhere.

**D4. `pnpm --filter @adt/studio i18n:lint`.**
- **Errors** (whole catalog, every locale):
  - placeholder names or rich-text tags that differ from the msgid (#900's
    `phcheck.mjs`, plural branches included)
  - a literal `\"` that is not in the msgid
  - a term the locale's rules forbid
- **Warnings** (only entries changed since the merge base with `develop`): a label of
  ≤30 characters longer than 1.5× the English. Only changed strings, because the
  current catalogs already hold 429–564 such labels per locale and most fit.

It runs as a step in the CI `i18n` job and in `pnpm test` through a catalog test in
the studio Vitest project. It needs no network and no browser.

**D5. `pnpm --filter @adt/studio i18n:screens --url <url> [--url <url> …]`.**
Run against the author's own running Studio. It opens each URL at 1280×720 in en and
in every other locale, by setting the `adt:locale` storage key
(`apps/studio/src/i18n/locales.ts`) before load. It saves screenshots, and flags text
that is cut off, clipped, spills out of its box or wraps in a locale but not in
English. The detector is #900's `lib.mjs`, split into an in-page measurement and a pure
classification step that compares the locale's measurements with English on the same
screen and data, so a long book title doesn't flag.

- **Data:** whatever the author's app is showing. Screens that don't need a book
  (home, library, settings, wizard, onboarding) work on an empty library. Screens that
  do need one are reachable whenever the author tested their feature there. A screen
  the author can't reach is listed in the PR as not checked, with the reason.
- **Browser:** Playwright, already a workspace dependency (`packages/pipeline`), added
  to `@adt/studio` as a devDependency at the same version. Nothing new in the lockfile.
- **Exit code:** non-zero when a locale has a finding that English doesn't. The finding
  is either fixed or explained in the PR.

**D6. The HTML report.** `i18n:screens --report` writes a self-contained
`index.html`, plus its images in the same folder, to
`.context/<TASK-KEY>/i18n-report/` (not committed; see `~/.agents/SHARED.md` task
boards). One section per screen:

- English and every locale side by side, full screenshot plus a crop of each flagged
  element, outlined
- a table of the strings that changed on that screen: msgid, `comment`/`context`, and
  the translation in each locale, with findings marked
- a summary at the top: screens × locales checked, findings per locale, and screens
  listed as not checked

The report is optional. Generating it costs no LLM tokens (a script writes it). Tokens
are spent only when an agent looks at images, so the skill tells the agent to view only
flagged crops and to open a full screenshot only when it can't tell otherwise.

| | Typical PR (3 screens × 5 locales) | Large PR (10 screens × 5) |
|---|---|---|
| Captures | 15 | 50 |
| Time (#900 measured ~4.5 s per screen per locale) | ~1 min | ~4 min |
| Tokens if the agent views every full screenshot (~1.2k each at 1280×720) | ~18k | ~60k |
| Tokens if it views only flagged crops | ~1–3k | ~3–8k |

Translating from context also costs more than today's single batched call: the agent
reads each call site, roughly 1–3k tokens per changed string, so the low tens of
thousands of tokens for a typical PR of 5–20 strings, inside a session the author is
already running. Costs are stated in tokens because the price depends on the author's
model.

**D7. One guide, one skill, pointers everywhere else.**
- `docs/I18N_TRANSLATION_QUALITY.md` is the single source of truth. A translation is
  done when it is right in **meaning** (from the call site and glossary), right in
  **mechanics** (`i18n:lint` passes) and **fits** where the English fits
  (`i18n:screens`, or declared not checked).
- `.claude/skills/translate/SKILL.md` runs the procedure and links to the guide instead
  of copying it:
  1. List new or changed msgids against `develop`, with call sites (`i18n:origins`).
  2. Read each call site: button, heading, badge, aria-label, tooltip, toast?
  3. Translate every locale by meaning, using its glossary.
  4. Add a Lingui `comment` or `context` where the English is ambiguous.
  5. Run `extract`, `i18n:lint` and `i18n:screens` on the changed screens (with
     `--report` when asked).
  6. Write the PR's i18n section.
- `AGENTS.md` (Internationalization section) points to the guide, so agents that don't
  load skills follow the same rules.
- `.github/pull_request_template.md` replaces the i18n checkbox with a short section:
  locales translated, screens checked, findings, screens not checked and why.
- `README.md`, `docs/I18N_ADD_LANGUAGE.md` and any other doc that mentions
  `translate:missing` are updated.

**D8. Fix the existing mechanical bugs first.** The 11 es placeholders, the 12 strings
with a literal `\"` in es/fr/sq, and the theme "Light" (new `context`, translated in
all four locales). Each fixed string is translated from its call site, not just
patched.

## Impact map

- **Removed:** `apps/studio/scripts/translate-missing.ts`, the `translate:missing`
  script, 3 CI steps, the job's write permission.
- **Added:** `apps/studio/i18n/glossary/{pt-BR,es,fr,sq}.{md,rules.json}`,
  `apps/studio/scripts/i18n/` (lint, origins, screens, report),
  `docs/I18N_TRANSLATION_QUALITY.md`, `.claude/skills/translate/SKILL.md`, tests.
- **Changed:** `.github/workflows/ci.yml`, `apps/studio/package.json` (scripts and a
  Playwright devDependency), the 3 catalogs (D8), the theme "Light" call site,
  `AGENTS.md`, `.github/pull_request_template.md`, `README.md`,
  `docs/I18N_ADD_LANGUAGE.md`.
- **Invariants:** none. No entity, ID, staleness, layer or prompt-contract change. The
  scripts live in `apps/studio/scripts`, outside the app bundle, and import nothing
  from `packages/*`.
- **Schema / data migration:** none.
- **Concurrent work:** every open PR that adds strings meets the hard failure (D1) once
  it rebases. #803 and #823 add strings. They translate in their own session or the
  failure points them to the guide.

## Acceptance criteria

- [ ] AC-1: CI no longer translates. `translate-missing.ts` and `translate:missing` are
  gone, the `i18n` job has no step that commits or pushes and no `contents: write`.
- [ ] AC-2: A PR with an empty `msgstr` in any locale fails the `i18n` job.
- [ ] AC-3: `i18n:lint` reports an error for a placeholder or tag that differs from the
  msgid, including inside plural branches.
- [ ] AC-4: `i18n:lint` reports an error for a literal `\"` that the msgid doesn't have.
- [ ] AC-5: `i18n:lint` reports an error for a term forbidden by the locale's
  `rules.json`, honouring the rule's scope.
- [ ] AC-6: `i18n:lint` warns about a label longer than 1.5× the English only when the
  entry changed since the merge base, and never fails on it.
- [ ] AC-7: `i18n:lint` runs in the CI `i18n` job and in `pnpm test`, and passes on the
  catalogs after D8.
- [ ] AC-8: The 11 es placeholders, the 12 literal-`\"` strings and the theme "Light"
  are fixed. The theme option has its own `context` and translation in every locale.
- [ ] AC-9: Glossaries and rules exist for pt-BR, es, fr and sq. Each term records its
  reason, and pt-BR matches what #920 shipped.
- [ ] AC-10: `i18n:origins "<msgid>"` prints every call site of that msgid, plurals and
  multi-line entries included, and leaves `src/locales/` unchanged.
- [ ] AC-11: The detector flags a locale element that wraps, clips or is cut off when
  the English element on the same screen doesn't, and doesn't flag one that behaves the
  same as English.
- [ ] AC-12: `i18n:screens --url` captures en and every non-English locale at 1280×720
  and exits non-zero when a locale has a finding English doesn't.
- [ ] AC-13: `i18n:screens --report` writes a self-contained `index.html` (images in the
  same folder, no network requests) with, per screen, the side-by-side screenshots,
  outlined crops of flagged elements and the table of changed strings per locale.
- [ ] AC-14: `docs/I18N_TRANSLATION_QUALITY.md`, the `translate` skill, the `AGENTS.md`
  pointer and the PR template i18n section exist. No doc still mentions
  `translate:missing` or auto-translation.

## Test plan

Detector classification is pure, so it is unit-tested on recorded measurements; CI
has no browsers installed. The browser parts (AC-12, AC-13) are covered by one
integration test that runs a static HTML fixture through Playwright and is skipped,
with a message, when no Chromium is installed. The implementing PR runs it locally and
says so.

| AC | Level | Test file | Test title |
|----|-------|-----------|------------|
| AC-1 | CI config | `apps/studio/scripts/i18n/ci-config.test.ts` | `AC-1: the i18n job never translates or pushes` |
| AC-2 | CI config | `apps/studio/scripts/i18n/ci-config.test.ts` | `AC-2: compile --strict is not allowed to fail on PRs` |
| AC-3 | unit | `apps/studio/scripts/i18n/lint.test.ts` | `AC-3: placeholder and tag mismatches are errors` |
| AC-4 | unit | `apps/studio/scripts/i18n/lint.test.ts` | `AC-4: a stray escaped quote is an error` |
| AC-5 | unit | `apps/studio/scripts/i18n/lint.test.ts` | `AC-5: forbidden glossary terms are errors within their scope` |
| AC-6 | unit | `apps/studio/scripts/i18n/lint.test.ts` | `AC-6: length warns only on changed entries` |
| AC-7 | catalog | `apps/studio/src/locales/catalogs.test.ts` | `AC-7: every catalog passes i18n:lint` |
| AC-8 | catalog | `apps/studio/src/locales/catalogs.test.ts` | `AC-8: the theme option has its own context in every locale` |
| AC-9 | unit | `apps/studio/scripts/i18n/glossary.test.ts` | `AC-9: every locale has a glossary and valid rules` |
| AC-10 | unit | `apps/studio/scripts/i18n/origins.test.ts` | `AC-10: origins lists call sites without touching catalogs` |
| AC-11 | unit | `apps/studio/scripts/i18n/detector.test.ts` | `AC-11: flags only what differs from English` |
| AC-12 | integration (local) | `apps/studio/scripts/i18n/screens.test.ts` | `AC-12: captures every locale and fails on a locale-only finding` |
| AC-13 | integration (local) | `apps/studio/scripts/i18n/screens.test.ts` | `AC-13: the report is self-contained HTML` |
| AC-14 | docs | `apps/studio/scripts/i18n/docs.test.ts` | `AC-14: no doc mentions translate:missing` |

## Rollout

Each PR reverts on its own.

1. **Fix the catalogs (AC-8).** 3 `.po` files and the theme call site. Ships value
   alone: no blank buttons in es, no `\"` on screen.
2. **Lint and glossaries (AC-3–AC-7, AC-9).** Adds `i18n:lint`, the 4 glossaries and
   rules, the CI step and the catalog test. CI still auto-translates at this point,
   but the lint now catches what it breaks.
3. **Retire the auto-translator and add the workflow (AC-1, AC-2, AC-10–AC-14).**
   Removes the script and CI steps, makes missing translations fail, and adds
   `i18n:origins`, `i18n:screens` with its report, the guide, the skill and the
   AGENTS.md, PR-template and doc updates. Reverting it restores the CI translator.

Follow-ups, each its own fast-lane issue citing this spec:

- es, fr and sq catalog reviews against their glossaries, one PR per locale, with a
  second agent checking every change.
- A small sample project archive, imported through the existing project-archive import
  (`apps/api/src/services/import-service.ts`), so translation-only PRs can reach book
  screens. It needs a CI test that imports it, to catch format drift.

## Open questions

None blocking.

1. **Can the sample archive be imported across schema versions?** Not checked here;
   it decides whether the follow-up needs a regeneration script. Owner: @Eliezir, by
   the start of the first locale review. Default if unanswered: regenerate the archive
   whenever its import test fails.
