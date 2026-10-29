# Inclusive activities: adaptation matrix and implementation proposal

**Status:** proposal plus a local implementation authorized by the requesting
author. Formal spec approval, independent review and release acceptance are pending.

**Date:** 2026-10-28. **Code inspected:** `develop` at `b6302e35c`.

**Related work:** [#376: activity-adaptation matrix](https://github.com/unicef/adt-studio/issues/376).

The goal is for learners to understand and complete an activity using the input,
perception and language supports they need, while preserving its learning objective.
The author's clarification was **more inclusive and accessible**.

The [shared activity catalog](https://chatgpt.com/share/6ae1ec10-a954-83ed-806e-d936f7f98171)
provides useful visual variety: choice cards, blanks, matching, sorting, ordering,
flip cards, diagrams and other interactions. Its 34 formats are a design inventory.
ADT should reuse its existing interaction implementations and assess each new
presentation against the same accessibility requirements.

## What already exists, and what needs attention

These are the initial source-inspection findings at `b6302e35c`, before the local
changes recorded below. They are not results of a screen-reader audit.

| Area | Evidence in this checkout | Implication |
|---|---|---|
| Generation guidance | [Activity prompt](../../packages/agents/src/prompts/activity-generation.ts) includes UDL, keyboard alternatives, live feedback and guidance against color-only meaning. [GenerateActivityDialog](../../apps/studio/src/components/pipeline/stages/storyboard/components/GenerateActivityDialog.tsx) enables it by default but exposes an off switch. | Separate mandatory interaction accessibility from optional pedagogical supports. Turning off UDL framing does not remove every accessibility instruction: custom-activity rules also contain requirements. |
| Matching, sorting and ordering | [Matching](../../apps/adt-runtime/src/features/activity/runtime/activity-matching.ts) and [sorting](../../apps/adt-runtime/src/features/activity/runtime/activity-sorting.ts) implement selection and placement through clicks and keyboard events. [Ordering](../../apps/adt-runtime/src/features/activity/runtime/activity-ordering.ts) has move buttons and arrow-key handling. | Retain and verify these paths; they do not need replacement with a new drag engine. |
| Structural checks | [validate-activity-structure.ts](../../packages/pipeline/src/validate-activity-structure.ts) checks custom cards, targets, labels and feedback regions. However, `isFocusable` accepts any `tabindex` string, `hasRoleSemantics` accepts any role string, and the live-region check accepts any `aria-live` value. Matching and sorting have no entries in this structural rule registry. | Existing checks are useful but do not establish Tab reachability, valid semantics, working event handlers or actual announcements. A static pass must not be treated as proof of accessibility. Other audit layers may catch some issues. |
| Step navigation | [Activity stepper](../../apps/adt-runtime/src/features/activity/runtime/activity-stepper.tsx), `ProgressHeader`, uses color for answer status; button names contain the step number and total, but not the answer status. | Add visible status indicators and equivalent accessible names. Its small targets merit usability review; their size alone does not establish a WCAG failure because spacing exceptions exist. |
| Motion | [ActivityConfetti](../../apps/adt-runtime/src/features/activity/components/ActivityConfetti.tsx) respects the reader's reduce-motion setting. [Page navigation](../../apps/adt-runtime/src/features/navigation/lib/page-swap.ts) also checks the OS preference. | Verify consistent treatment of OS and reader preferences across celebrations and transitions. |
| Written responses | [Open-ended runtime](../../apps/adt-runtime/src/features/activity/runtime/activity-open-ended.ts) checks empty text, profanity and text validity. | These checks do not assess subject correctness. Review language and short-response behavior before promising equivalent acceptance across learners. |
| Structured presentations | [EditableActivity](../../packages/types/src/editable-activity.ts) has four kinds. [Extraction](../../packages/pipeline/src/extract-editable-activity.ts) maps true/false to multiple choice, covering five source section types. | Classic runtime coverage is broader than structured stepper coverage. Do not describe a type as unsupported merely because it has no stepper representation. |

The pre-existing [activity recreation finding](../experiments/activity-recreation.md)
describes a local experiment and is untracked in this checkout. Its Replicate /
Presets / AI suggestion / Custom prompt screen is not the current
[QuizzesIndex](../../apps/studio/src/components/pipeline/stages/quizzes/QuizzesIndex.tsx).
Use it as historical evidence and a statement of intent, not a description of
shipping behavior. Its reported test results were not rerun for this proposal.

## Adaptation matrix

These families describe author and learner choices. They do not rename persisted
section types or merge distinct answer-validation contracts.

| Family | Visual presentations / source exercises | Inclusive interaction and content | Current foundation |
|---|---|---|---|
| Choose | Single choice, multiple select, true/false; text or image cards | Visible radio/checkbox state, full option labels, keyboard selection, explicit single/multiple instructions; meaningful image alternatives | Existing classic types; single choice and true/false also have steppers |
| Complete | Missing words, numbers, sentence gaps, table cells | Named fields connected to their prompt; row/column context in tables; keyboard entry; optional word bank only when it preserves the task | Existing blanks and table rendering; blanks have a stepper |
| Write | Short answers, explanations, reflection, composition | Labeled input/textarea, persistent instructions, native text entry compatible with assistive input; distinguish submission from correctness | Existing open-ended type and stepper |
| Match | Word/definition, image/word, cause/effect | Select an item then a destination by tap, click or keyboard; announce both identities; allow removal and correction | Existing matching runtime |
| Categorize | Words, facts or pictures into groups | Named categories; select-and-place alternative to dragging; announce placement and removal | Existing sorting runtime |
| Sequence | Story panels, process steps, scrambled sentences, timelines | Move earlier/later buttons as well as optional dragging; announce new position; preserve focus | Existing ordering runtime |
| Mark text | Underline words, identify evidence or errors | Selectable tokens with visible and announced state; retain sentence context and normal reading order | Existing underline type and stepper |
| Reveal / recall | Flashcards, vocabulary, explanations | Native reveal button, explicit expanded state, one exposed face at a time, no required flip animation; recall is not automatically graded knowledge | Candidate first new reusable format; custom generation alone is not a verified implementation |
| Explore a diagram | Label a figure, choose a region, inspect a map | Named regions and an equivalent structured navigation/answer route; descriptions must preserve relationships without giving away answers | Needs a reviewed format and content-adaptation design |
| Work with quantities | Numeric answers, fractions, coordinates, number lines | Typed values alongside spatial controls, clear units and notation, visible validation guidance | Simple numbers can use existing blanks; tolerance, unit conversion and formula equivalence need explicit contracts |

Many catalog entries reuse these families: pattern questions can use choice or
completion; reflective writing can use written responses; evidence tasks can use
marking and writing. Assessment sessions and multi-step cases compose activities.
They should not force a separate answer engine for every subject or visual theme.
Crosswords, word searches, memory games, simulations, drawing, audio production and
code execution need their own interaction and evaluation design before promotion
to supported formats. This proposal does not promise all 34 formats.

## Proposed baseline

1. **Operate every supported task without dragging.** Provide keyboard operation
   and a click/tap path; verify them separately. Keyboard support alone does not
   satisfy the requirement for a single-pointer alternative to dragging.
   [W3C dragging guidance](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)
   and [keyboard guidance](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html).
2. **Make controls and state understandable.** Use native controls where possible,
   visible focus, meaningful names and visible selection/status indicators.
   A color change alone must not carry correctness. Announce results without
   unexpectedly moving focus.
   [W3C color guidance](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)
   and [status-message guidance](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).
3. **Make perception flexible.** Preserve readable text, zoom/reflow, image
   descriptions and the existing language/read-aloud paths. Allow visual variety
   without making sight, hearing or color perception the only route to an answer.
   Spatial learning tasks require a human-reviewed equivalent representation;
   a short alt text is not automatically sufficient.
4. **Keep practice manageable.** Clear instructions, retry, optional scaffolding,
   and no required timer or animation in the proposed practice formats. Retain
   whole-exercise context when presenting one question at a time. Honor reduced
   motion without requiring a learner to disclose a diagnosis.
5. **Keep the learning objective intact.** A learner may change how they interact
   without silently changing what is assessed. A word bank changes recall into
   recognition; a transcript can change a listening task. Such adaptations need
   author review. Describe support needs through available actions and materials,
   following [CAST's UDL guidelines](https://udlguidelines.cast.org/).
6. **Use generous controls.** Aim for 44 CSS pixel targets for principal actions;
   assess the actual hit area and spacing. WCAG 2.2 AA's target-size criterion is
   24 by 24 CSS pixels with specified exceptions, not a universal 44-pixel rule.
   [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Accessibility is a baseline for supported formats. Plain-language explanations,
word banks and other learning supports can remain author-controlled. Removing or
reframing the current Inclusive design toggle must be specified across the dialog,
API and prompt builder, including behavior for existing callers.

## Source fidelity and architecture

For a source-recreation workflow, retain the original exercise, language, numbers,
subquestions and learning objective. Place any approved simplification alongside
the original as support; do not silently rewrite it or invent missing diagram
content. Generated answer keys and image-dependent adaptations need author review.

Reuse the classic runtime and structured stepper where each already fits. Use the
existing validators and accessibility audit infrastructure before adding another
framework. Package new behavior in the existing reader so Studio preview and
exported books receive the same implementation. Keep optional interactions usable
offline; avoid new services and dependencies in the first phase.

Any authored adaptation must use existing versioned saves, stable identities,
book-local assets, inspectable LLM calls and ordered-input caching. A change to
prompt outputs, schemas, IDs, regeneration behavior or pipeline topology needs an
approved spec and its mechanical checks before merging under the repository process.

## Recommended delivery order

**First: review the matrix and strengthen existing activities.** Agree the baseline
and build an acceptance set before adding formats. Prioritize step status that is
understandable without color, consistent motion preferences, and complete
keyboard/click/feedback journeys for matching, sorting and ordering. Tighten static
checks with regression fixtures while preserving valid authored custom controls.
For example, `tabindex="-1"` can be legitimate in managed-focus widgets: a validator
must not reject it indiscriminately.

**Next: add reveal cards as one reviewed feature.** Use an explicit reveal control
and shared content/state rather than arbitrary generated flip scripts. Keep its
content model, grading semantics, authoring UI and backward compatibility within
that feature's spec. Do not change the existing custom activity's boolean grading
contract implicitly to accommodate an ungraded interaction.

**Then: choose diagram and numeric formats from real book evidence.** Review their
equivalent representations with educators and assistive-technology users. Broader
games and media formats remain separate proposals.

## Draft acceptance criteria for the first implementation spec

These are broader acceptance targets, not completed release criteria. The local
implementation below records its narrower verification and remaining gaps.

| Criterion | Observable result | Planned verification |
|---|---|---|
| AC-1 | Every first-phase fixture can be completed, corrected and retried with keyboard only and with click/tap only; focus remains predictable | Extend matching, sorting and ordering runtime tests; add actual browser journeys covering placement, replacement, removal and retry |
| AC-2 | Step navigation exposes current step and answer status through visible non-color indicators and accessible names | Focused stepper component test; browser check with colors removed; manual screen-reader check |
| AC-3 | The supported generation paths always receive the mandatory accessibility baseline, regardless of optional learning supports | Prompt-builder and API tests including existing caller options; inspect generated fixtures; review any changed output contract |
| AC-4 | Static checks reject demonstrably invalid names, roles and ineffective feedback markup without misclassifying legitimate managed-focus controls | Extend `validate-activity-structure.test.ts` with positive and negative fixtures; browser tests prove behavior the parser cannot establish |
| AC-5 | OS reduced-motion preference or the reader's reduce-motion setting suppresses activity celebrations and nonessential transitions | Runtime/component tests for both sources; browser emulation of OS preference and a setting change during use |
| AC-6 | Fields and controls retain their prompt/context at enlarged text and narrow widths; principal actions meet the chosen target-size policy | Browser checks at 200% zoom and a 320 CSS pixel viewport; measure actual targets; manual image/table review |
| AC-7 | Source exercise content, answers and saved history survive the adaptation; response acceptance is not presented as proof of subject correctness | Before/after source review, existing version-history tests and written-response cases in representative book languages |
| AC-8 | The accepted journeys work in both Studio preview and a packaged offline book; introduced strings are localized | Browser tests on both outputs; Studio catalog extraction for en, pt-BR, es, fr and sq; reader translation checks in its own locale system |

The acceptance set should contain text and image choices, a two-gap sentence,
a table, a written response, matching, sorting, ordering, marked text and a custom
activity. Include wrong answers, correction, missing labels, a long prompt and
at least one non-English book. Automated checks must be supplemented by a recorded
NVDA/Firefox or NVDA/Chrome walkthrough and a VoiceOver/Safari walkthrough with
the browser/AT versions stated. No compliance claim follows from an axe pass alone.

## Coordination, lane and review

Open issue/PR search on 2026-10-28 found existing work to coordinate with:

- [#376](https://github.com/unicef/adt-studio/issues/376) requests this kind of
  adaptation matrix and is labeled fast lane. This document can inform that issue;
  it does not close it or substitute for educator review.
- [#770](https://github.com/unicef/adt-studio/issues/770) proposes visible selectable
  controls and is explicitly draft/spec lane. Its acceptance criteria overlap the
  baseline here; resolve them together before changing generation contracts.
- [PR #1003](https://github.com/unicef/adt-studio/pull/1003) experiments with composed
  activity pages and scoped submission. It is marked DO NOT MERGE. Coordinate
  focus, instance isolation and feedback tests without depending on that experiment.
- [SPEC-0007's index entry](../specs/INDEX.md) concerns the accessibility harness;
  reuse that direction rather than introducing a separate project-wide gate here.

The document/matrix is triage work. The proposed implementation belongs in the
**spec lane** because it changes generation expectations and adds a feature
surface. Isolated, reproduced bugs that preserve contracts can be triaged
separately into the fast lane. Do not expand one issue into the entire roadmap.

Before an implementation PR is approved: select one human owner and acceptance books; settle the
mandatory baseline and caller compatibility; allocate a spec number using both
INDEX and all spec PR titles; obtain the required review. This proposal deliberately
has no allocated spec ID. Follow [SDD sections 3, 5a and 9](../SPEC_DRIVEN_DEVELOPMENT.md)
for spec approval, small independently revertible implementation PRs, non-author
human review and green CI. Reverting a presentation change must preserve saved
book data; any future format needs its own compatibility and rollback plan.

## Local implementation authorized by the author

The follow-up instruction was to implement activities, reusing quizzes where useful.
The local slice keeps the existing Quizzes stage and versioned activity-generation
endpoint. It does not allocate a spec number or imply independent approval.

- **Quizzes → Activities:** choose a rendered source page, generate an activity,
  preview its actual stable section ID and open that section in the existing
  editor. Generation task failures are visible; polling refreshes results even if
  a completion event is missed. Fixed-layout and unrendered pages direct authors
  to Storyboard. Pending quiz edits block tab switching until saved or discarded.
- **Generation dialog:** a top-level activity-style choice separates AI-guided
  source recreation or suggestions, standard templates with layout-only previews,
  and a custom prompt. Each path retains its own instructions while switching.
  The ten standard formats are single choice, multi-select, blanks, true/false, matching,
  sorting, ordering, table completion, marked words and written responses. It uses
  the shared focus-managed dialog. These presets request a format; they do not
  guarantee the model's pedagogical or accessibility correctness.
- **Mandatory baseline:** agent generation always includes the inclusive-design
  instructions, including for legacy callers that send `inclusiveDesign: false`.
  Source recreation must preserve wording and objectives. Multi-select and marked
  words now use the agent's existing templated-generation allowlist. The custom
  activity envelope uses the valid `group` role.
- **Quiz study cards:** deterministic standalone quizzes can reveal the saved
  correct answer and available explanation without grading. Choices and grading
  shortcuts are suspended during study, and existing quiz state resumes on return.
  This reuses saved quiz content; no new entity type or LLM call is introduced.
  Older/custom markup without the expected option group retains its quiz UI.
- **Reader controls:** step buttons show numbers and non-color answer-status
  symbols, with equivalent accessible names. Celebrations honor both OS and reader
  reduced-motion preferences without replaying an old celebration when preferences
  change. New study and step controls use targets of at least 44 CSS pixels.
- **Localization:** all new Studio text is translated in en, es, fr, pt-BR and sq.
  Reader strings are supplied for those languages and the existing `pt` alias;
  other reader locales retain English fallbacks.

No dependency, pipeline stage, book schema, identity factory or save/versioning
contract was added. Existing books receive reader behavior when previewed or
repackaged with the new runtime; already exported bundles are unchanged.

**Verification:** the related activity/quiz regression selection passes 268 tests
across 21 files; the added pending-edit tab guard passes separately (269 total).
`pnpm build`,
Studio's production build, runtime type checks and Studio lint pass. Lint reports
eight existing unused-suppression warnings. Catalog extraction reports no missing
translations in the five Studio locales. Vitest on the host's Node 25 requires
`NODE_OPTIONS=--no-experimental-webstorage`; jsdom's unimplemented audio methods
emit warnings in existing runtime tests.

A headless Chromium journey using `renderQuizHtml`, the packaged activities bundle
and preview-generated Tailwind CSS verifies Tab/Enter access to study mode and
answer reveal, suppression of numeric answer shortcuts while studying, and their
restoration on returning to the quiz. It also verifies OS reduced-motion behavior,
44-pixel study-control targets, and study-card bounds at 1100- and 320-pixel viewport
widths. Screenshots were visually inspected. This synthetic fixture does not
establish full export, enlarged-text or assistive-technology acceptance.

**Remaining acceptance:** no live LLM generation, representative-book answer-key
review, manual screen-reader walkthrough or full export/locale/accessibility audit
has been performed. Static validators were not expanded. Study cards currently
cover standalone quizzes, not every in-page activity or the structured stepper.
Diagram, numeric-equivalence and broader game formats remain future work. The
matrix and baseline require educator and independent human review before release.
