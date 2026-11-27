---
id: SPEC-0027
title: Studio accessibility baseline and screen-reader operability
status: draft
owner: "@gbergengruen"
approvers: []
issues: ["#1247", "#1252"]
prs: []
adr: ""
created: 2026-11-27
updated: 2026-11-27
---

## Problem (with evidence)

Issue #1247 began as a light-theme primary-button contrast defect: white text on
the former `--primary` / `--brand-600` color was about 3.66:1. A local trial correction
raised that pair to 4.98:1, but a wider Studio audit shows that this is not an isolated
token problem.

On 2026-11-27, axe-core was run against 13 locally reachable Studio routes in light
and dark themes (26 runs): library/home, onboarding, new/import book entry, and the
Settings overview plus About, Language, Models, Notifications, Providers, Publishing,
Prompts, and Theme. The API returned `200` for the empty local library. No book exists
in that preview, so book-specific pipeline/editor routes were not assessed.

The audit was then extended with isolated copies of two schema-14 books that passed
`pnpm pipeline doctor`: the 12-page English **Hyena and Raven** book and the 4-page
Spanish **Fascículo de Lengua Española** activity fixture. axe-core ran in both themes
over nine representative book routes: book overview, Extract, Sectioning, Storyboard,
Quizzes, Validation, Preview, and Export for Raven, plus the Spanish Quizzes workflow.
This is automated evidence only: every result must be classified during implementation
as actionable, inactive/decorative, or a false positive before it becomes a release
claim.

Confirmed defects include:

| Area | Evidence | User effect |
|---|---|---|
| Light secondary text | `--muted-foreground` on `--muted` is 4.34:1 in `apps/studio/src/styles/globals.css`; axe reported 4.33–4.34:1 for Settings labels and the home keyboard-shortcut keycap. | Secondary instructions can be hard to read. |
| Dark core tokens | `--primary-foreground` / `--primary` is 3.67:1; `--destructive-foreground` / `--destructive` is 3.48:1; `--sidebar-primary-foreground` / `--sidebar-primary` is 2.05:1. | Button, destructive-action, and sidebar content can be unreadable. |
| Dark links | The home-screen “Connect provider” link was measured at 2.53:1. | Keyboard and screen-reader users who also use magnification or low-vision settings cannot reliably perceive the action. |
| Shared status chip | `ComingSoon` uses `text-amber-600` on white at 3.19:1 (`apps/studio/src/components/app/screens/settings/ui.tsx`). | The same failure is repeated across Settings. |
| Form semantics | axe reported an unnamed numeric input in the shared `StepperInput` (`apps/studio/src/components/ui/stepper-input.tsx`) and an unnamed Notifications position combobox. | A screen reader cannot identify the field or its purpose reliably. |
| SPA orientation | The checked routes have no skip link. The home/library screen has no `<h1>`. Settings routes retain the generic document title `ADT Studio · ADT Studio` despite page-specific headings. | A screen-reader user must traverse repeated navigation and may not learn that a route changed. |
| Book workflow controls | The fixture run reported unnamed stage-settings links, unnamed Sectioning previous/next buttons, an untitled Storyboard iframe, and unnamed Raven quiz-editor textareas. It also reported an unnamed Spanish quiz-frequency input in the activity fixture. | A screen-reader user can reach these workflows but cannot reliably identify or operate important controls. |
| Book workflow perception | The fixture run repeatedly reported low contrast in the stage rail/group labels and in Preview/Export surfaces, in both themes; Export also reported a non-focusable scrollable main region. | The navigation and long-form review screens create compounding barriers for low-vision and keyboard users. |

The Studio already has useful foundations: Radix primitives, visible focus styles in
many controls, `LiveRegionAnnouncer`, `usePageTitle`, and focused wizard transitions.
They are not applied consistently enough to establish an end-to-end authoring workflow.

There is also a reported concern that a screen-reader user cannot use Studio correctly.
A colleague relayed the following second-hand observation; the underlying TalkBack
notes have not yet been supplied to this repository:

> The blind participant found accessibility issues with ADT Studio but was able to
> work the tool. They also found some usability issues with TalkBack on Android — I
> have documented it.

This report is credible given the defects above, but it has not yet been reproduced
with a named assistive technology, browser, book, or task. It establishes neither total
task failure nor conformance. This spec treats it as a research and co-design
requirement, not as a claim that automated tooling has proved.

## Goals

- Define and implement a coherent accessibility baseline for the Studio authoring UI,
  using WCAG 2.1 AA as the minimum already promised by the project.
- Make the main Studio workflows understandable and operable without a mouse: orient
  after navigation, bypass repeated navigation, find every input by name, operate
  controls by keyboard, and receive concise status/error updates.
- Establish representative automated regression coverage and a repeatable manual
  assistive-technology validation protocol.
- Resolve the reported screen-reader concern with direct evidence and involvement from
  affected users where they consent to participate.

## Non-goals

- This does not certify legal conformance, guarantee support for every screen reader,
  or replace expert/user testing with axe-core.
- This does not change the generated reader/output accessibility contract. Generated
  book assessment and packaging remain separate work; this spec concerns the Studio
  authoring application.
- This does not redesign the Studio visual language, replace Radix primitives, add a
  general UI framework, or change book data, pipeline behavior, APIs, or storage.
- This does not make every low-opacity decorative graphic meet text contrast rules.
  The implementation must first classify each flagged element as informative,
  interactive, disabled/inactive, or decorative and retain that rationale in tests or
  component documentation.

## Proposed design

### Options considered

1. **Patch each axe finding independently** — roughly 5–20 lines per finding, but no
   shared token contract, no route-orientation rule, and no answer to the reported
   screen-reader workflow failure. Rejected.
2. **Add an axe gate only** — roughly 100–250 lines plus fixtures. Useful enforcement,
   but cannot verify route announcements, meaningful names, keyboard task completion,
   or assistive-technology behavior. This overlaps the intended scope of SPEC-0007.
   Rejected as the sole solution.
3. **Baseline plus representative workflow validation** — shared semantic tokens,
   app-shell orientation, component contracts, automated checks, and a small manual
   screen-reader protocol. Estimated 400–900 lines across 15–25 files, delivered in
   independently reviewable slices. Chosen.

### Design decisions proposed for review

1. **Semantic token contract.** Every shared foreground/background token pair used for
   normal text or essential icons must meet 4.5:1; large text and non-text UI components
   must meet their applicable WCAG 2.1 AA threshold. Token tests cover both themes.
   A component-specific color may not silently compensate for a failing semantic token.
2. **One route-orientation pattern.** The root app shell provides a keyboard-visible
   skip link to the main content target. Each top-level authoring route has one
   programmatic page name and one `<h1>`. On client-side navigation, Studio updates the
   document title and announces the new page name once, without stealing focus from an
   in-progress editor. Flows that intentionally move focus (for example, wizard steps)
   use that focus movement instead of duplicating announcements.
3. **Native-first naming.** A visible `<label>` is associated with every editable form
   control. Icon-only controls have translated accessible names. Composite controls
   expose a name, current value/state, and instructions through their native/Radix
   semantics before custom ARIA is considered.
4. **Task-based validation.** Automated axe checks are necessary but insufficient.
   The acceptance set includes keyboard-only and screen-reader task scripts on a
   representative empty-library path, add/import flow, provider setup, and at least one
   fixture-backed book workflow. Findings are recorded as pass, defect, or explicitly
   deferred with a reason; no claim of screen-reader usability is made without this run.
5. **Reuse, do not duplicate.** `LiveRegionAnnouncer`, `usePageTitle`, Radix primitives,
   and the future enforcement work in SPEC-0007 are extended or integrated rather than
   replaced by a second accessibility subsystem.

## Impact map

- Expected Studio files: `src/styles/globals.css`, the root/app shell, route and screen
  components, shared form controls, and focused tests. Exact files are selected per
  implementation slice after this proposal is approved.
- Expected verification: token/unit tests, component accessibility tests, browser-level
  axe checks, keyboard task scripts, and a manual NVDA/Firefox and VoiceOver/Safari (or
  documented platform-equivalent) pass.
- No entity schema, storage layout, pipeline graph, API contract, prompt contract, or
  data migration is expected. No registered invariant changes are proposed.
- Dependencies/concurrent work: SPEC-0007 owns the broader decision on an accessibility
  harness as a blocking CI gate. This spec defines Studio behavior and representative
  coverage; it must not pre-empt SPEC-0007's CI policy. Book-output accessibility
  assessment remains outside scope.

## Acceptance criteria

- [ ] AC-1: The approved implementation documents the Studio accessibility baseline and
  the supported test matrix, including the WCAG success criteria used for contrast,
  names, keyboard operation, focus, and status messages.
- [ ] AC-2: Light and dark semantic token pairs used by shared normal-text and essential
  control surfaces meet their applicable WCAG 2.1 AA contrast thresholds; regression
  tests cover primary, destructive, muted, sidebar, and brand/link usage.
- [ ] AC-3: The reachable Settings and book-entry screens contain no automated
  `color-contrast`, `label`, or `button-name` violations for informative or interactive
  elements. Any inactive/decorative exception is documented and testable.
- [ ] AC-4: Every top-level Studio route has one main landmark, a descriptive document
  title, and an `<h1>` or an equivalent named primary heading.
- [ ] AC-5: A keyboard-visible skip link moves focus to the main content target, and
  client-side route changes announce the new route exactly once without disrupting an
  active editor or dialog focus trap.
- [ ] AC-6: Shared text inputs, selects, steppers, switches, and icon-only buttons have
  accessible names and expose their current value/state through native or Radix
  semantics.
- [ ] AC-7: Keyboard-only users can complete the representative empty-library,
  add/import, provider-setup, and fixture-backed book tasks without a mouse; focus is
  visible and no task introduces an unintended keyboard trap.
- [ ] AC-8: A documented manual screen-reader pass covers the representative tasks with
  the agreed browser/assistive-technology matrix. Reported failures are fixed or carry
  an owner, rationale, and follow-up issue before the spec is marked implemented.
- [ ] AC-9: Existing internationalization rules remain satisfied for any newly visible
  text or accessible name, and the relevant test/lint/typecheck suite passes.

## Test plan

| AC | Level | Test location | Test title / evidence |
|----|-------|---------------|-----------------------|
| AC-1 | review | this spec + validation record | Baseline/matrix approved before implementation |
| AC-2 | unit | `apps/studio/src/styles/globals.test.ts` | `AC-2: keeps semantic text and control tokens at AA contrast in both themes` |
| AC-3 | browser | new Studio accessibility browser fixture | `AC-3: reports no actionable axe violations on reachable routes` |
| AC-4 | browser | same fixture | `AC-4: exposes a titled main region and primary heading for each route` |
| AC-5 | browser | root/app-shell accessibility tests | `AC-5: skips to main and announces one route change` |
| AC-6 | component | shared control and Settings tests | `AC-6: gives each control an accessible name and state` |
| AC-7 | browser | fixture-backed workflow tests | `AC-7: completes representative workflows using keyboard only` |
| AC-8 | manual | `docs/verification/` record | task transcript, AT/browser/version, results, and linked findings |
| AC-9 | CI | existing Studio commands | `pnpm lint`, `pnpm typecheck`, focused tests, and Lingui extraction when strings change |

## Rollout

1. **Contract and evidence slice:** add the token contrast tests, route/accessibility
   browser fixture, and manual validation protocol. This slice must not hide known
   violations merely to make a gate green.
2. **Foundation slice:** correct shared semantic tokens, add app-shell skip/orientation
   behavior, and repair shared control naming. Each correction gets a focused regression
   test.
3. **Representative workflow slice:** repair route/component failures found by the
   fixtures and validate the provider, import, and fixture-book tasks with keyboard.
4. **Assistive-technology validation slice:** run the agreed manual protocol, resolve
   findings or record authorized follow-ups, and attach the evidence record.
5. **CI follow-through:** coordinate with SPEC-0007 before making any accessibility
   check blocking. Each slice is independently revertible; reverting restores the prior
   UI behavior but does not require data migration.

## Open questions

| Question | Owner | Due | Default if unanswered |
|----------|-------|-----|-----------------------|
| Which screen-reader user(s) or accessibility specialist can review the task script, and what consent/privacy process applies to their participation? | @gbergengruen | 2026-12-04 | Do not claim task-level screen-reader usability; proceed only with automated and internal keyboard evidence. |
| Which desktop/browser matrix is release-representative: NVDA + Firefox, VoiceOver + Safari, and/or TalkBack + Chrome? Can the documented TalkBack notes be attached or summarized? | @gbergengruen | 2026-12-04 | Test NVDA + Firefox and VoiceOver + Safari where available; record the TalkBack report as unverified until its task evidence is available. |
| Should Studio adopt WCAG 2.2 AA as its authoring-UI target, or retain the existing WCAG 2.1 AA minimum for this scope? | @gbergengruen + product maintainer | 2026-12-04 | Retain WCAG 2.1 AA; do not state a new conformance target. |
| What is the boundary with SPEC-0007: which checks become blocking CI and when? | Maintainer responsible for SPEC-0007 | 2026-12-04 | Keep checks non-blocking but versioned and reproducible until SPEC-0007 is approved. |
