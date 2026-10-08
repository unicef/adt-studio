---
id: SPEC-0016
title: AI-assisted setup recommender integration
status: in-review
owner: "@VictorBrasileiroo"
approvers: []
issues: ["#333"]
prs: []
adr: ""
created: 2026-10-06
updated: 2026-10-06
---

## Problem (with evidence)

The Add Book flow proposed in [#930] (still open, not yet on `develop`) provides an
AI-assisted setup path,
including loading, ambiguity handling, review, manual override and book creation.

Its `auto/recommendation/README.md` and `contract.ts` document the placeholder behind
`SetupClient` and the six-decision contract to move to `@adt/types`.

The standalone proof of concept, [adt-poc-llm PoC V1] at commit
`fd367428b5ca9bf1c2d7df1d980fe02788c02d17`, has established a stable `poc-v1`
configuration that recommends the six setup decisions expected by the new Add Book
flow:

- `preset`
- `renderStrategy`
- `pageGrouping`
- `sectioningMode`
- `activitiesGenerator`
- `figureExtraction`

The PoC is standalone and uses its own PDF and OpenAI integration. Shipping the
feature requires adapting that behavior to ADT Studio's existing PDF, LLM, API and
provider architecture without silently changing the selected recommender behavior.

## Goals

- Connect the real setup recommender to the AI-assisted Add Book flow.
- Preserve the selected `poc-v1` decision knowledge, ambiguity semantics and output
  contract.
- Use ADT Studio's existing `@adt/pdf`, `@adt/llm`, provider credentials and HTTP
  architecture instead of introducing a parallel standalone stack.
- Respect the page range selected before recommendation.
- Keep the recommendation human-in-the-loop: the user reviews and may change all
  settings before Create.
- Establish a small first integration that can be compared with the standalone PoC
  before provider flexibility or recommendation-quality improvements are attempted.

## Non-goals

This first integration deliberately does not:

- support arbitrary LLM providers for setup recommendation;
- select or benchmark a better model;
- change the stable `poc-v1` Decision Specs;
- promote experimental Preset Specs;
- change the sampling strategy beyond adapting it to a selected physical page range;
- add OCR or richer PDF analysis;
- add a new cross-decision compatibility engine;
- remove the existing frontend `fitStrategy` safety fallback;
- alter the existing `@adt/llm` OpenAI transport only to reproduce the PoC's Responses
  API transport;
- add retries, parse-repair or fallback to another provider/model;
- add a new recommender workspace package;
- persist/cache/audit the pre-Create recommendation in book storage in this first
  slice;
- tune the recommender against the existing evaluation books;
- treat historical 15/18 agreement as model accuracy or as a deterministic acceptance
  target.

The historical `15/18` figure is the selected PoC V1 configuration's agreement
with a frozen benchmark of 18 manually validated setup decisions across four
books (6 + 4 + 4 + 4). It is in-sample agreement with known-good manual
configurations, not model accuracy or evidence of generalization, because the
same books participated in prompt and Decision Spec iteration. See
[PoC V1 evaluation].

Pre-Create recommendation persistence and auditability are a known follow-up topic.
They should be revisited before the feature is considered mature for production use.

## Proposed design

### Chosen architecture

Use the existing Add Book `SetupClient` as the frontend boundary and implement the
recommender as an API service:

```text
Add Book
  ↓
SetupClient
  ↓
POST /api/setup/recommendation
  ↓
lightweight @adt/pdf evidence
  ↓
BookProfile + representative sampling
  ↓
poc-v1 prompt + Decision Specs
  ↓
@adt/llm
  ↓
structured output + semantic validation
  ↓
SetupResult
  ↓
Decide / Review
```

The recommender core lives under
apps/api/src/services/setup-recommendation/.
Shared schemas and types live in @adt/types.
Low-level PDF inspection and sampled page rendering belong in @adt/pdf.
No new @adt/recommender package is introduced because the API is currently the only
runtime consumer.

### Behavioral reference

The integration uses the standalone PoC's stable poc-v1 behavior:

- prompt version: adt-config-recommender-poc-v1;
- V2 ambiguity-aware behavior;
- POC_V1_DECISION_SPECS;
- one multimodal request for all six decisions;
- at most three representative page pairs;
- at most 300 normalized extracted characters per sampled page;
- primary choice is always required;
- alternative represents a specifically supported competitor, not generic
  uncertainty;
- high confidence cannot have an alternative;
- evidence page numbers must refer only to sampled physical pages and remain sorted
  and unique.

Experimental decision-spec variants are not part of this integration.

### PDF evidence

The ADT implementation uses MuPDF through @adt/pdf, not the standalone PoC's
PDF.js + native canvas stack.
A lightweight evidence API should provide only what recommendation needs rather than
running normal full page extraction.
The logical BookProfile fields and the PoC heuristic thresholds in its
`src/analyzer/types.ts` and `metrics.ts` remain unchanged; the profile inspects every
page in scope, while rendering is limited to sampled pages.
The change from PDF.js to MuPDF is expected to produce some extraction-level
differences. These differences are measured during integration validation rather than
hidden or compensated with benchmark-specific rules.
No new PDF dependency is expected. If the ADT-native approach proves insufficient,
record the evidence and amend the spec before expanding dependency scope.

### Page range

When the user selected a physical PDF range:

- BookProfile describes that selected range;
- representative evidence is sampled only from that range;
- evidencePages keeps original physical PDF page numbers.

The range is not treated as a new PDF whose first and last pages become an artificial
cover/back cover.
Eligibility is defined relative to the original PDF first and then intersected with
the selected range. If that intersection is non-empty, sample from it normally.
If it is empty, fall back to the requested range itself, so explicit ranges containing
only physical page 1 or N still generate evidence. For example, N=52 with range
52..52 may use page 52. Normal eligibility excludes physical pages 1 and N for
N ≥ 7; range boundaries are not automatically excluded as artificial document edges.
When no range is selected, the stable PoC full-document sampling behavior applies.

### LLM execution

The integration uses @adt/llm and existing provider credential resolution.
For this initial version:

- provider: OpenAI;
- model: gpt-5.4-mini (`openai:gpt-5.4-mini` for `createLLMModel`);
- one structured multimodal generation call;
- maxRetries: 0;
- no provider fallback;
- no parse-repair path.

The first implementation uses the existing @adt/llm structured-text transport.
The standalone PoC uses OpenAI Responses directly. That transport difference is
recorded and evaluated during parity testing. The shared LLM infrastructure is changed
only if evidence shows that the existing transport makes the recommender materially
worse or unable to satisfy the required contract.

Use `readProviderCredentials` and the existing server credential merge, including
`OPENAI_API_KEY`; availability must cover that same OpenAI path. Preserve provider
error details and HTTP status through the route/client so `classifySetupError` can
distinguish auth, quota and offline failures (the current shared `request()` helper
drops status, and the generic API error handler hides unhandled provider errors).
Pass cancellation through the HTTP adapter and into the LLM `signal`; verify server
disconnect handling in the actual runtime. User/online-triggered fresh runs remain
distinct from automatic retries within one recommendation attempt.

The first version supports only `openai:gpt-5.4-mini`. Later versions must make
setup recommendation provider- and model-agnostic, following the same provider
abstraction used by the rest of ADT's LLM features. Implementing that flexibility
remains outside this spec.

### Shared contract

Move the setup recommendation protocol from the frontend-local contract to
@adt/types.
The shared contract must retain:

- exactly six decisions;
- valid option IDs;
- choice;
- confidence;
- reason;
- alternative;
- ambiguityReason;
- evidencePages;
- semantic relationship between confidence and alternative;
- alternative different from choice;
- unique and sorted page citations.

The model-facing schema additionally restricts evidencePages to the pages actually
sampled for the current request.
Preserve the `SetupResult` envelope required by #930: `provider`, `model`,
`promptVersion`, `userLanguage`, `recommendation` and `usage`. Optional `timing` and
extra fields such as `bookProfile` remain supported. Metadata is supplied by the
application, not generated by the model. Shared schemas use Zod and inferred types;
the browser `File` wrapper stays in Studio and maps to the HTTP upload.

### Compatibility

No compatibility engine is added in this slice.
The existing frontend behavior remains the safety net for unsupported
preset × renderStrategy combinations:

```text
recommended choice if allowed
→ recommended alternative if allowed
→ preset default
```

The raw recommendation remains available to the flow so an applied fallback is not
mistaken for the model's original choice.

### Pre-Create persistence

Setup recommendation runs before the book exists.
For this first integration, the call is treated as transient preflight state and does
not introduce a temporary-book/session persistence subsystem merely to obtain normal
per-book cache and audit storage.
Persisting recommendation evidence, LLM logs and cache across Create is deferred and
must be discussed separately before treating this flow as fully mature production
infrastructure.

### Options considered

A — API service using existing ADT packages — chosen

Rough cost: about 10–15 production files plus tests, catalogs and documentation.
Expected scope:

- shared contract in @adt/types;
- lightweight evidence support in @adt/pdf;
- recommender service and route in apps/api;
- real SetupClient adapter in Studio.

This follows current package responsibilities and avoids another workspace boundary.

B — new recommender package

Would add roughly four package scaffolding files (manifest, TypeScript config,
entry point and interface) plus workspace/build wiring on top of option A, without
a second runtime consumer.
Rejected for this first integration.

### LLM transport option

Changing @adt/llm specifically to use the same OpenAI Responses transport as the
standalone PoC would increase shared-infrastructure scope before a behavioral problem
has been demonstrated.
The existing ADT transport is therefore used first and compared empirically.

## Impact map

Expected areas:

- packages/types/src/setup-recommendation.ts
- packages/types/src/index.ts
- packages/pdf/src/evidence.ts
- packages/pdf/src/index.ts
- apps/api/src/services/setup-recommendation/
- apps/api/src/routes/setup-recommendation.ts
- apps/api/src/app.ts
- apps/studio/src/api/client.ts
- apps/studio/src/components/wizard/auto/recommendation/
- apps/studio/src/components/wizard/start/choose/ChooseScreen.tsx (OpenAI availability)
- relevant tests, documentation and Studio locale catalogs if UI text changes

The Studio paths above belong to #930, not the current `develop` tree.
Any changed Studio text follows Lingui and is fully translated in `en`, `pt-BR`,
`es`, `fr` and `sq` after `pnpm --filter @adt/studio extract`.

No pipeline DAG stage is added.
No book schema or migration is required.
No new dependency is expected.
The implementation depends on #930 (`eliezir/333-auto-mode-prototype`), currently
stacked on #929 (`eliezir/reduce-effects`). #884 (sectioning modes) and #887 (prompt
persistence) touch adjacent contracts; this slice preserves the existing option IDs
and defers persistent prompts/logs.
The main contracts touched are:

- shared API/output schema;
- prompt/output contract;
- Studio → API layer boundary.

The stable PoC prompt and output semantics are protected by focused regression
tests (AC-2/3/8, invariant 6). The HTTP adapter/typecheck protect the Studio → API
boundary (invariant 1); credential handling must preserve invariant 7 (no keys in
logs). Entity versioning, stable IDs and staleness remain unaffected. Existing
per-book cache/audit behavior is unchanged; transient preflight deferral remains the
limitation described above.

## Acceptance criteria

- [ ] AC-1: Add Book can send a PDF, UI language and optional page range to a real setup recommendation API and receive a valid result containing exactly the six required decisions.
- [ ] AC-2: The shared schema rejects invalid decision IDs, an alternative equal to the primary choice, high confidence with an alternative, mismatched alternative/ambiguityReason, and unsorted or duplicated evidence pages.
- [ ] AC-3: Model-facing validation rejects evidence page numbers that were not part of the current sampled evidence.
- [ ] AC-4: Recommendation evidence is generated through ADT's PDF stack without adding the standalone PoC's backend PDF.js or native canvas dependencies, while preserving the stable BookProfile fields and heuristic thresholds.
- [ ] AC-5: Full-document sampling preserves the stable PoC limits: at most three pairs, at most six pages and at most 300 normalized text characters per sampled page.
- [ ] AC-6: A selected page range limits BookProfile and representative evidence to that physical range while keeping original PDF page numbers and without treating the range boundaries as artificial cover/back-cover pages. Sampling uses the intersection with normal physical-document eligibility when non-empty; otherwise it falls back to the requested range, including ranges containing only page 1 or N (N=52, range 52..52 may use page 52).
- [ ] AC-7: The recommender executes through @adt/llm using OpenAI gpt-5.4-mini, one multimodal structured request for all six decisions and zero application retries.
- [ ] AC-8: The integrated prompt uses adt-config-recommender-poc-v1, the selected POC_V1_DECISION_SPECS and the application UI language without promoting experimental variants.
- [ ] AC-9: A recommendation whose Render Strategy has an alternative continues through the existing Decide flow; a recommendation without one proceeds to Review, and users can override settings before Create.
- [ ] AC-10: Existing preset/render compatibility fallback remains active and does not silently rewrite the raw recommendation returned by the backend.
- [ ] AC-11: Cancel/Start over aborts the frontend request and propagates cancellation toward the recommender; authentication, quota, offline and unknown failures remain recoverable through the existing manual-setup fallback.
- [ ] AC-12: The AI setup option is not advertised as available merely because an arbitrary structured-text provider exists; the initial integration requires the configured OpenAI path needed by this version.
- [ ] AC-13: Before the integration is considered complete, deterministic evidence preparation and request construction are compared against the standalone PoC on known PDFs, and real recommendation runs are recorded descriptively for behavioral parity. Differences are investigated rather than tuned to make the historical benchmark green.
- [ ] AC-14: The first slice does not introduce a temporary book/session persistence subsystem for recommendation cache/log/evidence before Create; this limitation is documented for follow-up.

## Test plan

Paths below are planned implementation tests; the Studio recommendation files
already exist in #930. Use known PoC PDFs plus short/edge-only PDFs and interior
ranges. Mock the LLM for deterministic checks; AC-13 also requires separately
recorded live runs with the same PDFs, model and UI language, attached to the
implementation PR. A live agreement score is descriptive, not a pass threshold.

| AC | Level | Test file | Test title |
|----|-------|-----------|------------|
| AC-1 | API | `apps/api/src/routes/setup-recommendation.test.ts` | `AC-1: returns the six-decision setup recommendation contract` |
| AC-2 | unit | `packages/types/src/__tests__/setup-recommendation.test.ts` | `AC-2: rejects invalid ambiguity and evidence relationships` |
| AC-3 | unit | `packages/types/src/__tests__/setup-recommendation.test.ts` | `AC-3: restricts citations to sampled physical pages` |
| AC-4 | unit/integration | `packages/pdf/src/__tests__/evidence.test.ts` | `AC-4: builds recommendation evidence with the ADT PDF stack` |
| AC-5 | unit | `apps/api/src/services/setup-recommendation/sampling.test.ts` | `AC-5: preserves poc-v1 sampling and text limits` |
| AC-6 | unit | `apps/api/src/services/setup-recommendation/sampling.test.ts` | `AC-6: samples within the eligible range intersection or falls back to the requested range when empty` |
| AC-7 | unit | `apps/api/src/services/setup-recommendation/recommend.test.ts` | `AC-7: performs one OpenAI mini multimodal call with zero retries` |
| AC-8 | unit | `apps/api/src/services/setup-recommendation/prompt.test.ts` | `AC-8: preserves the stable poc-v1 prompt and Decision Specs` |
| AC-9 | frontend | `apps/studio/src/components/wizard/auto/recommendation/recommendation.test.ts` | `AC-9: routes render ambiguity to Decide and otherwise to Review` |
| AC-10 | frontend | `apps/studio/src/components/wizard/auto/recommendation/recommendation.test.ts` | `AC-10: fits incompatible render strategies without mutating the backend result` |
| AC-11 | API/frontend | `apps/api/src/routes/setup-recommendation.test.ts`; `apps/studio/src/components/wizard/auto/recommendation/useSetupRun.test.tsx` | `AC-11: propagates cancel and classifies recoverable setup failures` |
| AC-12 | frontend/API | `apps/studio/src/components/wizard/start/choose/ChooseScreen.test.tsx`; `apps/api/src/routes/setup-recommendation.test.ts` | `AC-12: exposes the initial recommender only through its supported OpenAI path` |
| AC-13 | integration/acceptance | `apps/api/src/services/setup-recommendation/parity.test.ts` + live comparison record in the implementation PR | `AC-13: compares integrated evidence and recommendations with poc-v1` |
| AC-14 | API | `apps/api/src/routes/setup-recommendation.test.ts` | `AC-14: recommendation does not create persistent book state before Create` |

Run the focused tests above, `pnpm typecheck`, `pnpm lint` and the existing i18n
checks for implementation. `pnpm lint:invariants` is still planned and is not an
available check in this tree.

## Rollout

The implementation depends on #930.

While #930 remains unmerged, the integration branch is stacked on
`eliezir/333-auto-mode-prototype` so that review isolates the setup recommender
changes from the parent Add Book work.

After the parent stack lands, the implementation PR may be retargeted or rebased onto
`develop` as appropriate.

The implementation should land in small reviewable slices where practical:

1. shared contract and pure recommender behavior;
2. lightweight PDF evidence and LLM service;
3. API route and real Studio client;
4. parity validation and integration fixes.

The first vertical slice targets OpenAI `gpt-5.4-mini` only.

Provider flexibility, improved sampling, compatibility resolution and pre-Create
persistence are follow-up work and should not be added opportunistically to this spec.

If MuPDF evidence or the existing `@adt/llm` transport causes material recommendation
regression, stop and document the evidence before changing either shared subsystem.

Rollback consists of restoring the placeholder SetupClient/default path; no book data
migration is involved.

## Open questions

None blocking.

[#930]: https://github.com/unicef/adt-studio/pull/930
[adt-poc-llm PoC V1]: https://github.com/VictorBrasileiroo/adt-poc-llm/blob/fd367428b5ca9bf1c2d7df1d980fe02788c02d17/docs/POC_V1.md
[PoC V1 evaluation]: https://github.com/VictorBrasileiroo/adt-poc-llm/blob/fd367428b5ca9bf1c2d7df1d980fe02788c02d17/docs/POC_V1.md#9-evaluation-and-selection
