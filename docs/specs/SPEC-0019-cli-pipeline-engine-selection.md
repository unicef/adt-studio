---
id: SPEC-0019
title: Explicit pipeline engine selection for Codex and Claude Code
status: draft
owner: "@lucas7maciel"
approvers: []
issues: ["#903"]
prs: []
adr: ""
created: 2026-10-12
updated: 2026-10-12
---

## Problem and evidence

In [#903](https://github.com/unicef/adt-studio/issues/903), choosing Codex CLI under
Settings → Providers → OpenAI and signing in leaves a book using
`openai:gpt-5.4`. Storyboard remains disabled with an instruction to add an API key.
Selecting `codex:gpt-5.6-sol` separately in Settings → Models makes the pipeline run.
The Anthropic / Claude Code configuration has the same separation.

The authentication selector in
[`ProviderEditor.tsx`](../../apps/studio/src/components/app/screens/settings/providers/ProviderEditor.tsx)
uses component state to choose the setup panel; it does not persist a pipeline model.
[`StoryboardLandingPage.tsx`](../../apps/studio/src/components/pipeline/stages/storyboard/StoryboardLandingPage.tsx)
checks the book's effective text model before enabling Run. Connection and selection
are therefore separate operations, but the existing setup flow does not explain them.

The [local experiment](../experiments/cli-pipeline-engine-selection.md) implements
the issue's suggested options **2 + 3 + 4**. This draft records that proposed contract;
it does not retroactively approve the experiment or claim release verification.
This is spec-lane work because it adds a user-facing selection/recovery surface and
the implementation spans more than ten files.

## Goals

- Distinguish a connected engine from the engine selected as the global default.
- Offer explicit model selection beside connection setup and after CLI connection.
- Explain a blocked book's model and offer a scoped recovery action.
- Preserve book and step overrides unless the user explicitly changes the book default.
- Explain which features still require another provider.

## Non-goals

- Changing qualified model IDs, aliasing providers or routing `openai:*` through Codex.
- Adding image generation, speech or agent support to CLI providers. Existing input
  capabilities, including any image-input support, remain unchanged.
- Silently modifying existing book files, step models or specialized model settings.
- Persisting the setup-panel toggle as engine selection or changing an engine at login.
- Adding providers, dependencies, schemas, migrations, pipeline stages or prompt contracts.
- Redesigning authentication, globally diagnosing network failures, or implementing
  automatic model fallback when a request fails.
- Resolving missing credentials for explicit step overrides through a bulk rewrite.
  Such overrides remain authoritative and may still block their own calls.

## Proposed design

### Options and scope

| Option | Cost and tradeoff |
|--------|-------------------|
| 1. Setup toggle selects the engine | Fewer UI surfaces, but needs persistence, target-model selection and override tests; introduces an implicit configuration change while configuring authentication. |
| 2. Connected / in-use labels and explicit action | Provider panel, existing global-model route and component tests; makes the saved selection inspectable. |
| 3. Invitation after connection | Small addition to option 2 using the observed connection transition; never saves automatically. |
| 4. Book-aware blocker | Shared recovery component, book configuration mutation and integration into text-stage landing pages. |

Choose **2 + 3 + 4**. The experiment touches approximately 21 implementation,
test and catalog files; localized catalogs account for 225 added lines. These are
observed scope measurements, not a promise that a single implementation PR fits
the review budget. No backend changes are required by the proposed design.

### Provider selection

For registered providers supporting `structured-text`, show connection health
and a selection badge. **In use as the global default** means the saved global
`default_model` belongs to that provider; show the actual saved qualified ID,
including when it differs from the provider's suggested model. It does not mean
every book or step uses that provider, nor that the connection is healthy.

A connected provider not selected globally offers **Use for the pipeline** when
its manifest supplies a structured-text default. Display the target qualified ID
from `manifest.id` and `manifest.defaultModels["structured-text"]`; do not hardcode
CLI model IDs. Omit the action if no default is declared or the provider is not
connected. API-key panels also require saved/configured credentials, not merely
an unsaved credential draft whose probe succeeded.

Before saving, disclose that the action changes the global default and preserves
saved book models and step overrides. Require an explicit **Confirm**, with
**Cancel** available. Saving uses the existing global-model endpoint; books that
inherit the global default subsequently resolve to the new default. No book file
is rewritten by this action. The current setup toggle remains a panel selector.

### Invitation after CLI connection

When the displayed CLI panel observes a transition to connected, and that engine
is not already selected globally, show an inline invitation: “Connected. Use it
to run the pipeline?” It leads to the same confirmed global selection action.
Detecting a connection is sufficient; this also accommodates a login completed
outside Studio. Do not launch a model mutation from a health or login effect.

### Book recovery

On text-stage landing pages, when missing structured-text credentials disable
Run, display a visible blocker using the merged book `default_model`, not merely
the global default. Show the model ID, explain that its credentials need setup,
and link **Add key** to Settings → Providers.

Offer Codex and Claude Code alternatives only when registered, a structured-text
default is declared, and a health probe reports a connection. Show each target
model before the action. The confirmation states that it changes **this book's
default** and preserves step overrides. Fetch the latest book configuration at
confirmation, change only `default_model`, and retain all other configuration.
Use the existing book-config endpoint; do not change global settings or another book.
This uses the existing configuration write semantics, without adding cross-client
locking or stronger concurrent-write guarantees.

Apply the shared blocker to Extract, Sectioning, Storyboard, Quizzes, Captions,
Glossary, TOC, Languages and Easy Read landing pages. It must remain hidden when
the book's text model is available, even if another prerequisite disables Run.
Speech and packaging keep their existing modality-specific behavior. A saved
step override can still require a different provider; this action is not a promise
that every call in the book can now run.

### Feedback and capabilities

Both CLI setup and book recovery explain: Codex and Claude Code are text-only
pipeline engines; image generation, speech and agent features need another provider.
Do not reset specialized defaults or agent settings when choosing a text engine.

Disable confirmation while saving. A failed save leaves the displayed selection
unchanged and presents a retryable error. On success, refresh global defaults,
provider defaults and effective book configuration so badges and Run availability
update without a reload. Keep all text in Lingui and fully translate `en`, `pt-BR`,
`es`, `fr` and `sq`.

## Impact map

| Area | Expected implementation |
|------|-------------------------|
| Provider UI | `ProviderEditor.tsx`, new `PipelineEngine.tsx`, provider component tests |
| Model mutation | `use-pipeline-engine.ts`; existing API client and configuration routes |
| Book recovery | `ProviderBlocker.tsx`, `LandingPageShell.tsx`, the nine text landing pages |
| Localization | Five `.po` catalogs; no new locale |
| Data / packages | No schema, migration, storage-layout or provider-interface change |

Preserve [invariants](../INVARIANTS.md) 1 and 7: UI mutations go through the HTTP
client and credentials do not enter model IDs, URLs or logs. No change to entity
versioning, stable IDs, staleness, the pipeline DAG or prompt contracts is proposed.
Existing type, lint and test checks remain applicable; `pnpm lint:invariants` is
still planned. No new registered invariant or finalized standing decision is
introduced by this draft, so no ADR is proposed.

On 2026-10-12, the GitHub API search found the original issue #903 and no separate
open PR for this selection UX. Numbering was checked against INDEX and all PR titles
containing SPEC; SPEC-0018 was the highest reserved number. Adjacent work:
[SPEC-0017 / #950](https://github.com/unicef/adt-studio/pull/950) covers network
connectivity and recovery, while [#959](https://github.com/unicef/adt-studio/issues/959)
covers onboarding without an API key. Coordinate shared blocker copy and connection
health behavior without absorbing those scopes.

## Acceptance criteria

All boxes remain open until reviewed implementation and its evidence land.

- [ ] AC-1: Provider panels distinguish connection from global selection and show the actual saved global model for the selected provider.
- [ ] AC-2: Global engine selection shows the manifest-derived target and scope, requires confirmation, persists only the global default, and refreshes the selection without a reload. Cancel performs no write.
- [ ] AC-3: Detecting CLI connection offers an inline invitation without changing models automatically; the setup toggle alone performs no model write.
- [ ] AC-4: Disconnected or unregistered engines, engines lacking a text default, and unsaved API credentials do not expose an actionable engine switch.
- [ ] AC-5: Text-stage blockers use the merged book model and provide credential setup; recovery is hidden when that model is available. Non-text stages are unaffected.
- [ ] AC-6: Confirming a CLI alternative changes only the selected book's default, preserves step overrides and unrelated settings, and refreshes book availability. Other books and the global default are unchanged.
- [ ] AC-7: Codex and Claude Code use their manifest-declared qualified models. Both recovery and CLI setup explain the text-only limitation; specialized models and agent settings remain unchanged.
- [ ] AC-8: Saving disables duplicate confirmation. Failed saves show a retryable error without presenting an unsaved engine as selected.
- [ ] AC-9: All added interface text uses Lingui and all five catalogs extract and compile with zero missing translations.
- [ ] AC-10: With no OpenAI key and a connected CLI, a book inheriting the selected global default can execute a text stage. A book with an explicit OpenAI override remains unchanged until its own confirmed recovery action; independent step overrides retain their credential requirements.

## Test plan and current evidence

Existing component evidence lives in
[`PipelineEngine.test.tsx`](../../apps/studio/src/components/app/screens/settings/providers/PipelineEngine.test.tsx).

Manual validation was confirmed by the author on 2026-10-12, following the local
validation instructions for CLI sign-in and pipeline execution. This records
author-reported local validation; the specification remains draft and does not
claim independent review or release-build verification.

| AC | Existing evidence |
|----|-------------------|
| AC-1 | `shows the actual global model as in use` |
| AC-2 | `requires explicit confirmation and changes only the global model`; `cancels a model change without saving` |
| AC-3 | `offers the engine after connection without switching automatically` |
| AC-4 | `does not offer disconnected engines`; `does not offer a disconnected CLI in book recovery` |
| AC-5 | `shows a book's effective model and preserves step and unrelated overrides`; `hides recovery when the book's model is available` |
| AC-6 | `shows a book's effective model and preserves step and unrelated overrides` |
| AC-7 | `uses Claude Code's declared model and displays the text-only limitation`; Codex target asserted by AC-2/6 tests |
| AC-8 | `keeps the selected model on failure and offers a retry` |
| AC-9 | Lingui extraction/compilation and Studio lint |

## Rollout and review

1. Review this spec as its own proposal linked to #903. Keep the experiment local
   until a non-author maintainer and product reviewer approve the behavior.
2. Ship provider selection and the connection invitation as a focused implementation
   PR with tests and translations. Link this spec and its acceptance criteria.
3. Ship shared book recovery and text landing-page integration as a second focused
   implementation PR with tests and translations. Keep each within the approximately
   400-changed-line review budget; split further if catalogs or tests exceed it.
4. Require green CI plus a non-author human approval for each PR.
   Only mark implemented when every criterion
   has passing evidence; the release owner records release verification separately.

There is no migration or automatic configuration rewrite. Reverting either UI
slice removes its selection actions but does not undo intentional saved settings;
users can restore the previous global/book model through existing model settings.

## Review decisions and open questions

The proposed default is inline invitations and inline confirmation controls, as
tested in the experiment. Confirm this UX during product review. Bulk changes to
step overrides remain out of scope.

| Decision | Owner | Due | Proposed default |
|----------|-------|-----|------------------|
| Ratify inline invitation/confirmation and global-versus-book scope disclosure | @lucas7maciel to obtain non-author product/maintainer review | 2026-10-15 | Keep the explicit inline flow; this proposal remains draft until reviewed. |

No blocking ambiguity is left to implementation: change this draft during review
if another flow is chosen, and resolve the decision before approval.
