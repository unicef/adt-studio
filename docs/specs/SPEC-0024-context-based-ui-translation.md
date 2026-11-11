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

<!--
Proposed in unicef/adt-studio#937 (lane: spec). Reviewing this file's PR IS the spec
review. `approvers:` stays empty until approval (SPEC_DRIVEN_DEVELOPMENT.md §5).
Catalog numbers were measured on `develop` at `4bef06d55` by parsing every `.po`
entry. The #900 material cited below is in the owner's archived workspace and moves
into the repo with this spec's implementation.
-->

## Problem (with evidence)

Studio's UI strings are translated **key by key**: each English string on its own, with
no idea where it appears, what it means there, or how much room it has. Four locales are
translated (`pt-BR`, `es`, `fr`, `sq`, 4,303 entries each in `apps/studio/src/locales/`),
and the people adding strings don't speak most of them, so nobody can tell when a
translation is wrong or no longer fits.

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
- **Broken mechanics.** The script escapes the msgid it sends (`line.slice(7, -1)` keeps
  the `\"`) and escapes the answer again (`.replace(/"/g, '\\"')`).

  | Locale | Placeholder renamed (shows blank) | Literal `\"` on screen | Reviewed |
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

- Strings are translated **from where they are used** (the call site, the component it
  renders in, a note for translators where the English is ambiguous), never from a list
  of empty keys.
- Each locale has a glossary, so one concept always gets the same word.
- A translated string is checked **on the screen where it appears**, against English,
  for unexpected line breaks and cut-off or clipped words.
- The author can get an HTML report of the changed strings and screenshots in every
  locale.
- Mechanical errors (placeholders, tags, escapes, forbidden terms) fail CI.
- No key-based translation path remains.

## Non-goals

- **Full catalog reviews of es, fr and sq.** They apply this spec's guide and
  glossaries, as follow-up fast-lane issues, one PR per locale like #920.
- **Committed test data for the screen check.** No fixture book and no faked API
  responses; the check runs against the app the author is already running. A sample
  project archive for translation-only PRs is a follow-up (Rollout).
- **A full-app walk, in CI or nightly.** The screen check is on demand and targeted.
- **Redesigning layouts that are too tight in every locale**: the segmented control,
  the export descriptions' `line-clamp-2` and the Notifications tiles from #920 have
  their own issues.
- **A native-speaker approval gate.** The team has no native fr or sq speakers. Quality
  comes from the glossary, an independent second-agent review and the screen check.
- **Machine translation inside the app or of book content.** Only Studio's UI catalogs.
- **Adding locales.** `docs/I18N_ADD_LANGUAGE.md` stays the procedure, updated to the
  new flow.

## Proposed design

### The workflow, end to end

A developer whose change adds or edits strings asks their agent to translate. The
`translate` skill runs this, following `docs/I18N_TRANSLATION_QUALITY.md`:

1. **List** the msgids added or changed since the merge base with `develop`, and find
   each one's call sites.
2. **Read** each call site: is it a button, heading, badge, aria-label, tooltip, toast?
   What is next to it, and how much room does it have?
3. **Translate** into every locale by meaning, using that locale's glossary.
4. **Annotate** ambiguous English with a Lingui `comment`, or a `context` when the same
   English needs different translations.
5. **Check** with `extract`, `i18n:lint` and `i18n:screens` on the changed screens,
   with `--report` when asked. Fix or explain each finding.
6. **Declare** in the PR's i18n section: locales translated, screens checked, findings,
   and screens not checked with the reason.

Worked example, the theme option "Light". The call site is `THEME_OPTIONS`
(`apps/studio/src/components/app/screens/settings/options.ts`), rendered as a theme
card in Settings → Appearance, so the agent knows it is the colour scheme, not a weight.
The other "Light" in the catalog already has `context: "translation review depth"`
(`LanguageSettings.tsx`), so the agent gives this one `context: "theme"` and translates
it as the opposite of "Dark" in each locale: pt-BR keeps "Claro", and es, fr and sq
change from "Ligero", "Léger" and "I lehtë". The screen check opens Settings →
Appearance in each locale and compares the theme cards with English. Nothing wraps, so
the PR lists the screen as checked with no findings.

### 1. Translation starts from the call site, not the key

The catalogs keep `origins: false`. A new `pnpm --filter @adt/studio i18n:origins
"<msgid>"` runs `lingui extract` with origins into a temporary directory and prints the
call sites, plurals and multi-line entries included. It never writes to
`src/locales/`. Meaning that has to last goes on the string itself, as a Lingui
`comment` or `context`, so the next translator gets it from the catalog.

`docs/I18N_TRANSLATION_QUALITY.md` is the single source of truth: a translation is done
when it is right in **meaning**, right in **mechanics** and **fits** where the English
fits. `.claude/skills/translate/SKILL.md` runs the workflow and links to the guide
instead of copying it. `AGENTS.md` points to the guide, so agents that don't load skills
follow the same rules, and `.github/pull_request_template.md` replaces its i18n checkbox
with the i18n section from step 6.

### 2. Each locale has a glossary

`apps/studio/i18n/glossary/<locale>.md` for pt-BR, es, fr and sq, each with a
`<locale>.rules.json`. pt-BR is #900's glossary with its validation amendments merged.
The others cover the same concepts: Stage vs Step, preview, table of contents, findings,
source vs font, template vs model, activity types, sentence case, voice and mood. Each
term follows the locale's established UI terminology and the catalog's majority usage,
with the reason recorded. The rules file lists forbidden terms as
`{ "term", "use", "scope" }`, so a rule can apply to one concept without banning the
word everywhere.

### 3. Mechanical errors fail CI

`pnpm --filter @adt/studio i18n:lint`, with no network and no browser:

- **Errors** (whole catalog, every locale): placeholder names or rich-text tags that
  differ from the msgid, plural branches included (#900's check); a literal `\"` the
  msgid doesn't have; a term the locale's rules forbid.
- **Warnings** (entries changed since the merge base only): a label of ≤30 characters
  longer than 1.5× the English. Whole-catalog warnings would be hundreds of strings that
  fit, so a warning only says "check this one on screen".

It runs in the CI `i18n` job and in `pnpm test` through a catalog test.

### 4. The fit is checked on the author's running app

`pnpm --filter @adt/studio i18n:screens --url <url> [--url <url> …]` opens each URL of
the author's running Studio at 1280×720 in English and in every other locale (by setting
the `adt:locale` storage key from `apps/studio/src/i18n/locales.ts` before load). It
saves screenshots and flags text that wraps, is cut off, is clipped or spills out of its
box in a locale **but not in English on the same screen**, so data such as a long book
title doesn't flag. The detector is #900's, split into an in-page measurement and a
pure classification step. It exits non-zero when a locale has a finding English
doesn't.

Data comes from whatever the author's app is showing. Home, library, settings, the
wizard and onboarding work on an empty library. Book screens are reachable whenever the
author tested their change there. A screen they can't reach is declared not checked.

Playwright is already a workspace dependency (`packages/pipeline`); `@adt/studio` adds
it as a devDependency at the same version, so nothing new enters the lockfile.

### 5. An optional HTML report

`i18n:screens --report` writes a self-contained `index.html`, with its images in the
same folder, to `.context/<TASK-KEY>/i18n-report/` (never committed). It has a summary
(screens × locales checked, findings per locale, screens not checked), then one section
per screen: English and every locale side by side, outlined crops of flagged elements,
and a table of the changed strings with their `comment`/`context` and each locale's
translation.

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
call sites is roughly 1–3k tokens per changed string, so the low tens of thousands for a
typical PR of 5–20 strings, in a session the author is already running. Costs are in
tokens because the price depends on the author's model.

### 6. The key-based translator is removed

Delete `translate-missing.ts` and the `translate:missing` script. In the CI `i18n` job,
remove the warn, auto-translate and re-verify steps, drop `continue-on-error` from
`compile --strict` and drop `contents: write`. An empty `msgstr` now fails the PR. Update
`README.md` and `docs/I18N_ADD_LANGUAGE.md`, which document the script.

### 7. Existing bugs are fixed first

The 11 es placeholders, the 12 literal-`\"` strings in es/fr/sq, and the theme "Light"
(its own `context`, translated in every locale). Each is translated from its call site,
not patched.

## Options

| Option | Cost (rough) | Why not / why |
|---|---|---|
| **A. Keep `translate:missing`, feed it the glossary and call sites** | ~150 lines in the script, plus an origins map | Still batch-translates a list of keys: a file path isn't the rendered component, and it still can't see whether the result fits. Rejected. |
| **B. Translate and check in CI with a running app** | A CI job that boots API and Studio with a book and a browser, ~10+ min per PR | Needs committed test data and a full walk, both non-goals. Rejected. |
| **C. Translate from context in the author's session, check on the author's running app** (chosen) | Removes ~250 lines; adds the lint (~250), screen check and report (~600, ported from #900), guide, skill, 4 glossaries | Contributors already translate locally with an agent; this changes what it starts from and adds the check that the result fits. |

Two sub-choices:

- **Call sites in the catalogs (`origins: true, lineNumbers: false`)** was rejected:
  catalogs grow about 80%, and moving or renaming a component rewrites all 5 files and
  causes conflicts between parallel PRs. A file path says where a string is, not what it
  means; `i18n:origins` gives the first on demand and `comment`/`context` keep the
  second.
- **Data for the screen check.** A committed sample book drifts with the book format
  (#900's copies needed `layout_type` patched), and faked API responses drift silently
  with the API. The author's running app needs neither; the cost is that unreachable
  screens are declared, not checked.

## Impact map

- **Removed:** `apps/studio/scripts/translate-missing.ts`, the `translate:missing`
  script, 3 CI steps and the job's write permission.
- **Added:** `apps/studio/i18n/glossary/{pt-BR,es,fr,sq}.{md,rules.json}`,
  `apps/studio/scripts/i18n/` (lint, origins, screens, report),
  `docs/I18N_TRANSLATION_QUALITY.md`, `.claude/skills/translate/SKILL.md`, tests.
- **Changed:** `.github/workflows/ci.yml`, `apps/studio/package.json`, 3 catalogs, the
  theme "Light" call site, `AGENTS.md`, `.github/pull_request_template.md`, `README.md`,
  `docs/I18N_ADD_LANGUAGE.md`.
- **Invariants:** none touched. No entity, ID, staleness, layering or prompt-contract
  change; the scripts sit outside the app bundle and import nothing from `packages/*`.
- **Migration:** none.
- **Collides with:** every open PR that adds strings meets the hard failure once it
  rebases, notably #803 and the strings #823 will add.

## Acceptance criteria

- [ ] AC-1: `translate-missing.ts` and `translate:missing` are gone, and the CI `i18n`
  job has no step that translates, commits or pushes, and no `contents: write`.
- [ ] AC-2: An empty `msgstr` in any locale fails the `i18n` job on a pull request.
- [ ] AC-3: `i18n:lint` errors on a placeholder or tag that differs from the msgid,
  including inside plural branches.
- [ ] AC-4: `i18n:lint` errors on a literal `\"` the msgid doesn't have.
- [ ] AC-5: `i18n:lint` errors on a term the locale's rules forbid, within the rule's
  scope only.
- [ ] AC-6: `i18n:lint` warns about a label longer than 1.5× the English only for
  entries changed since the merge base, and never fails on it.
- [ ] AC-7: `i18n:lint` runs in the CI `i18n` job and in `pnpm test`, and passes on the
  catalogs.
- [ ] AC-8: The 11 es placeholders, 12 literal-`\"` strings and the theme "Light" are
  fixed; the theme option has its own `context` and translation in every locale.
- [ ] AC-9: Glossaries and rules exist for pt-BR, es, fr and sq; each term records its
  reason, and pt-BR matches what #920 shipped.
- [ ] AC-10: `i18n:origins "<msgid>"` prints every call site of the msgid, plurals and
  multi-line entries included, and leaves `src/locales/` unchanged.
- [ ] AC-11: The detector flags a locale element that wraps, clips or is cut off when the
  same English element doesn't, and doesn't flag one that behaves like English.
- [ ] AC-12: `i18n:screens --url` captures English and every other locale at 1280×720 and
  exits non-zero on a finding English doesn't have.
- [ ] AC-13: `i18n:screens --report` writes a self-contained `index.html` (no network
  requests) with, per screen, side-by-side screenshots, outlined crops of findings and
  the changed strings per locale.
- [ ] AC-14: The guide, the `translate` skill, the `AGENTS.md` pointer and the PR template
  i18n section exist, and no doc still describes `translate:missing`.

## Test plan

Classification is pure, so the detector is unit-tested on recorded measurements; CI has
no browser installed. The browser parts are covered by one integration test over a
static HTML fixture that skips with a message when Chromium is missing, run locally by
the implementing PR, plus a manual run against Studio.

| AC | Level | Location | Test title |
|----|-------|----------|------------|
| AC-1, AC-2 | review + CI run | `.github/workflows/ci.yml`; a PR with an empty `msgstr` | — |
| AC-3 – AC-6 | unit | `apps/studio/scripts/i18n/lint.test.ts` | `AC-3: …` to `AC-6: …` |
| AC-7, AC-8 | catalog | `apps/studio/src/locales/catalogs.test.ts` | `AC-7: every catalog passes i18n:lint`, `AC-8: the theme option has its own context` |
| AC-9 | unit | `apps/studio/scripts/i18n/glossary.test.ts` | `AC-9: every locale has a glossary and valid rules` |
| AC-10 | unit | `apps/studio/scripts/i18n/origins.test.ts` | `AC-10: lists call sites without touching catalogs` |
| AC-11 | unit | `apps/studio/scripts/i18n/detector.test.ts` | `AC-11: flags only what differs from English` |
| AC-12, AC-13 | integration (local) + manual | `apps/studio/scripts/i18n/screens.test.ts`; running Studio | `AC-12: …`, `AC-13: …` |
| AC-14 | review | the docs listed in the Impact map | — |

## Rollout

Three PRs, each reverting on its own:

1. **Catalog fixes (AC-8).** 3 `.po` files and the theme call site. Ships value alone:
   no blank buttons in es and no `\"` on screen.
2. **Lint and glossaries (AC-3 – AC-7, AC-9).** The script still exists at this point,
   but the lint catches what it breaks.
3. **Context-based workflow (AC-1, AC-2, AC-10 – AC-14).** Removes the key-based
   translator, makes empty translations fail, and adds `i18n:origins`, `i18n:screens`
   with its report, the guide, the skill and the doc updates. Reverting it restores the
   old script.

Follow-ups, each a fast-lane issue citing this spec: the es, fr and sq catalog reviews
(one PR per locale, a second agent checking every change), and a small sample project
archive, imported through the existing import (`apps/api/src/services/import-service.ts`)
so translation-only PRs can reach book screens, with a CI test that imports it.

## Decisions to ratify

| # | Decision | Where |
|---|---|---|
| R-1 | Translation happens in the author's session, from call sites; no key-based path remains | Workflow, §1, §6 |
| R-2 | Catalogs keep `origins: false`; call sites on demand, meaning in `comment`/`context` | §1, Options |
| R-3 | One glossary and forbidden-terms file per locale, pt-BR from #900 | §2 |
| R-4 | Length is a warning on changed strings only; the screen check decides fit | §3, §4 |
| R-5 | The screen check runs on the author's app, with no committed test data | §4, Non-goals |
| R-6 | The HTML report is optional and lives in `.context/`, never committed | §5 |
| R-7 | No native-speaker gate; es/fr/sq reviews are follow-ups | Non-goals |

## Open questions

None blocking.

1. **Can a sample project archive be imported across schema versions?** Decides
   whether the follow-up needs a regeneration script. Owner: @Eliezir, before the first
   locale review. Default: regenerate the archive whenever its import test fails.
