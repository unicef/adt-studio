---
id: SPEC-0018
title: Gemini TTS failure recovery and transparent audio outcomes
status: in-review
owner: "@gbergengruen"
approvers: []
issues: ["#846"]
prs: []
adr: "[024: Preserve selected TTS output on failure](../DECISIONS.md#024-preserve-selected-tts-output-on-failure)"
created: 2026-10-12
updated: 2026-10-12
---

## Problem (with evidence)

`gemini-2.5-flash-preview-tts` sometimes returns a response with no audio.  The
reported book had ten effectively silent page-9 slices; three were exactly 44-byte WAV
headers, yet all were recorded as successful.  Its 15-entry page was sent as 60 entries
because repeated IDs duplicated the transcript; later empty slices overwrote good audio.

The upstream low-temperature failure is deterministic: at `temperature <= 0.4`, Gemini
returns no content with `finishReason: OTHER` after roughly 95–155 seconds (one observed
run: 128,275 ms).  ADT previously hid the provider reason, retried the same deterministic
answer up to five times, and could launch a 32-request opening wave before the first slow
failure was known.  A failed single-entry regeneration could also silently use another
configured provider and voice.

The reporter's cached inputs replayed through the aligner produce 11 empty or near-empty
ranges from 52.  Real audio whose words Whisper cannot hear is a different condition: it
must not be discarded as though it were empty, but it must not be represented as aligned.
Issue [#846](https://github.com/unicef/adt-studio/issues/846) has reproduction details and
measurements; draft PR [#849](https://github.com/unicef/adt-studio/pull/849) is the
experimental implementation that exposed them.

## Goals

- Make no-audio Gemini failures actionable, bounded, and visible without exposing keys.
- Preserve the user-selected provider, model, and voice when synthesis fails.
- Never save or report a zero-sample audio file as successful; preserve real but
  unalignable audio with truthful provenance.
- Persist and explain the batching and Gemini sampling choices that affect cost and
  failure exposure.

## Non-goals

- Adding Gemini 3.8 models or a regional voice catalogue; [#926](https://github.com/unicef/adt-studio/issues/926)
  owns that work.
- Fixing Gemini's preview-model voice-identity drift, or promising deterministic voice
  identity where the provider does not guarantee it.
- Adding a new TTS provider, cross-provider fallback, model fallback, or automatic
  mutation of a user's sampling settings.
- Replacing the speech pipeline, Whisper alignment, or defining the broader staleness
  contract in SPEC-0001.

## Proposed design

| Option | Rough cost | Why not / why chosen |
|---|---:|---|
| A. Improve the generic “no audio” error | ~80 lines, 3 files | Still spends a full concurrent wave, accepts silent WAVs, and permits substitution. |
| B. Retry/fallback to another model or provider | ~120 lines, 4 files | Replaces user-selected output without consent and conceals a reproducible provider condition. |
| C. Detect, preserve, and bound the known failure class | ~700–1,000 lines, 15–20 files plus tests | **Chosen.** It makes provider behavior inspectable while retaining valid user output and configurations. |

The implementation will:

1. Parse safe Gemini failure context (`promptFeedback.blockReason` and candidate
   `finishReason`) into the error/log path.  It must retain the selected provider/model/
   voice and exclude credentials and full request payloads.
2. Treat `temperature <= 0.4` for Gemini 2.5 TTS as a known-risk configuration.  Studio
   warns before saving/running but honours it.  A run performs one serial probe before
   concurrent work only for this configuration.  A qualifying no-audio failure stops the
   remaining work; a content-specific failure does not.
3. Make the selected TTS output authoritative.  Regeneration neither swaps Gemini models
   nor falls back to a different provider, model, or voice.  It leaves previously valid
   audio and its provenance untouched on failure.
4. Dedupe page-batched entries by stable entry ID before building a transcript, retaining
   first-seen order and surfacing the duplicate as an upstream/data error.  Never write a
   zero-sample or header-only slice.  Save real audio that lacks reliable word alignment,
   but label it `interpolated`/unaligned rather than `aligned` and report it to the Speech
   view.
5. Add the optional, validated `speech.batch_max_chars` book setting.  When page batching
   is enabled, it limits each batch; it persists even if that toggle is later disabled.
   Its trade-off is explicit: smaller requests can reduce blast radius but increase
   requests and cannot guarantee a consistent Gemini voice.

The reviewers are asked to ratify the low-temperature probe/abort boundary, the
no-substitution rule, and the distinction between absent audio and real unalignable audio.

## Impact map

- Expected implementation: `packages/types/src/speech.ts`; `packages/llm/src/speech.ts`;
  `packages/pipeline/src/speech.ts` and `speech-batch.ts`; API TTS and stage-runner routes;
  Studio `LanguageSettings`; `config.yaml`; all five Studio locale catalogs.
- Data/schema: additive optional book `speech.batch_max_chars`; existing books retain
  current behavior when it is absent.  No data migration is required.
- Invariants: entity-versioning/no-overwrite principles apply to existing speech assets.
  A failed generation must not replace valid audio with an empty artifact.  This does not
  establish new SPEC-0001 staleness semantics.
- Concurrent work: #849 is parked until this spec is approved, then must be split into
  reviewable implementation slices.  #926 is explicitly separate.  SPEC-0001/0002/0003
  may change regeneration and section inputs; implementation must retain stable entry IDs
  and preserve current audio on a failed attempt rather than relying on their future
  contracts.
- Standing decision: ADR 024 records that fallback is not consent to substitute selected
  TTS output.

## Acceptance criteria

- [ ] AC-1: A Gemini no-audio response reports safe provider block/finish context and
  selected output identity; no secret, API key, or complete request text is exposed.
- [ ] AC-2: With Gemini 2.5 TTS at `temperature <= 0.4`, Studio warns without changing
  the value. A run sends one serial probe; after a qualifying no-audio failure it sends no
  remaining work and reports the skipped entries.
- [ ] AC-3: A non-qualifying/content-specific no-audio failure fails only its entry even
  when the low-temperature warning applies.
- [ ] AC-4: A failed single-entry or batch regeneration makes no call to an unselected
  provider/model/voice and leaves existing valid audio and metadata unchanged.
- [ ] AC-5: Page batching deduplicates repeated stable entry IDs in first-seen order and
  reports duplicate input rather than overwriting output.
- [ ] AC-6: Zero-sample/header-only derived slices are not written or marked successful;
  real audio lacking reliable word timing is retained and visibly marked unaligned or
  interpolated, never aligned.
- [ ] AC-7: `speech.batch_max_chars` is validated, persisted as a book setting, and its
  scope/trade-offs are explained; an absent setting remains backward compatible.
- [ ] AC-8: Sampling controls appear only for Gemini-routed speech, and all changed
  user-visible strings are translated for `en`, `pt-BR`, `es`, `fr`, and `sq`.

## Test plan

| AC | Level | Test file | Test title |
|---|---|---|---|
| AC-1, AC-4 | API/unit | `apps/api/src/routes/tts.test.ts`, `packages/llm/src/__tests__/speech.test.ts` | `AC-1: reports Gemini no-audio context safely`; `AC-4: does not substitute TTS output` |
| AC-2, AC-3 | service | `apps/api/src/services/stage-runner.test.ts` | `AC-2: probes before concurrent low-temperature Gemini work`; `AC-3: continues after a content-specific failure` |
| AC-5, AC-6 | pipeline | `packages/pipeline/src/__tests__/speech-batch.test.ts` | `AC-5: deduplicates page entries`; `AC-6: preserves only real audio with truthful alignment` |
| AC-7 | types/API/Studio | speech schema and settings tests | `AC-7: persists validated batch_max_chars` |
| AC-8 | Studio/CI | `LanguageSettings` test plus Lingui catalogs | `AC-8: scopes Gemini controls`; `pnpm --filter @adt/studio extract` and i18n CI |

All tests added for this spec start with their `AC-n:` tag.  The delayed-rejection fixture
for AC-2 must outlast the launch ramp, so the test proves the probe instead of passing
because an immediate mock rejection accidentally serialized work.

## Rollout

1. Merge this spec after maintainer and product review; leave #849 draft until then.
2. Land independently revertable slices: (a) safe errors, transcript dedupe, and audio
   integrity; (b) selected-output preservation and probe policy; (c) book configuration,
   Studio warnings, and translations.  Each stays within the normal review budget and
   updates this spec's criteria/status.
3. Verify against a cloned reporter fixture with `temperature: 0` and an unset
   temperature.  Record call counts, preserved-audio outcome, and absence of header-only
   WAVs before marking the spec verified on a release build.
4. Revert any slice normally.  The additive config key may remain harmlessly ignored;
   reverting must never restore silent substitution or overwrite valid audio.

## Open questions

None at submission.  Gemini 3.8 voice/model selection is intentionally deferred to #926.
