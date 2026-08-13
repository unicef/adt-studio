# ADT Studio team review and local AI handoff

Date: 2026-08-06
Updated: 2026-08-14

Review/implementation branch: `codex/local-gemma-audit`

## Executive summary

ADT Studio has a strong foundation and is moving in the right direction. The
typed monorepo, clear package boundaries, observable LLM pipeline, book-level
storage, versioning, caching, accessibility tooling, and documentation are all
good architectural choices.

The largest gaps are operational maturity and desktop security: request-scoped
credential isolation, Electron hardening, merge controls, dependency
automation, duplicated orchestration, and packaged cross-platform testing.

Release position:

- **Local macOS pilot:** GO, with mandatory author preview/editorial review.
- **General macOS/Windows desktop release:** CONDITIONAL GO after the P0/P1
  work below and clean-machine Windows validation.
- **Shared/internet-hosted use:** NO-GO until authentication, authorization,
  tenant isolation, limits, and credential isolation are implemented.

The local-AI direction is viable. Gemma and local speech now work without
Ollama or cloud APIs. Model weights download only when selected and are not
included in the Electron installer or final ADT. GPT remains available as an
optional regeneration/improvement provider.

## What the team is doing well

1. Clear separation between shared types, PDF processing, storage, LLM,
   pipeline, API, Studio, runtime, and Electron.
2. Strict TypeScript and Zod contracts around model-generated data.
3. Transparent prompt, response, retry, cache, token, timing, and progress
   records.
4. Book-level SQLite/files storage that remains inspectable and portable.
5. Entity versioning and invalidation work that protects author edits.
6. Accessibility checks and generated captions/audio in the normal workflow.
7. Detailed architecture and developer documentation.
8. Broad automated tests; the missing area is packaged end-to-end enforcement.

## Main findings and missing controls

### P0 — before multi-user or hosted use

1. **Request credentials must not mutate global process environment.** Two
   concurrent requests can otherwise overlap and use the wrong key. Pass
   immutable credentials into provider factories and add a delayed two-key
   concurrency test.
2. **Hosted mode needs an application security boundary.** Add authentication,
   authorization, tenant-scoped storage, CSRF/trusted-proxy handling, rate
   limits, and explicit upload/archive limits.

### P1 — before broad desktop release

1. **Harden Electron.** Add a sandboxing plan, restrictive CSP, navigation and
   external-protocol allowlists, default-deny permissions, IPC sender checks,
   production DevTools policy, and Electron fuse review.
2. **Protect the loopback API.** Generate a high-entropy capability token per
   app launch and expose it only through the preload boundary.
3. **Enforce merge quality.** Require CI, one approval, resolved conversations,
   and approval after the last material push. Add CODEOWNERS, SECURITY.md, a PR
   template, and protection for development and release branches.
4. **Unify pipeline orchestration.** The API/desktop stage runner and shared CLI
   DAG can drift. Move execution and invalidation rules into one package and
   keep API/CLI layers thin.
5. **Add packaged end-to-end tests.** On macOS and Windows, launch the packaged
   app, import a deterministic PDF, generate a small book, export it, and open
   every page.
6. **Formalize model trust.** Before a Hugging Face download, show owner,
   revision, hashes, size, license, languages, compatibility, and trust tier.

### P2 — planned improvement

- Split oversized orchestration/routes incrementally behind characterization
  tests; avoid rewrites.
- Add Renovate/Dependabot and address reachable dependency advisories.
- Correct documentation drift and avoid claiming full WCAG conformance from
  automated checks alone.
- Replace broad Hugging Face TTS search with an adapter/capability registry.
- Add editorial quality gates for TOC usefulness and bounded LLM-safe schemas.
- Move long local TTS batches to a worker so API progress/cancellation stays
  responsive.

## What was implemented for local AI

ADT Studio is Electron, not Tauri. The implementation adds:

- Embedded, pinned `llama.cpp` runtime supervised by the desktop API.
- On-demand, resumable Gemma downloads from immutable Hugging Face revisions
  with size and SHA-256 verification.
- Hardware-aware recommendations: E2B for the smallest machines, E4B as the
  default from 12 GB RAM, with 12B/26B optional on larger systems.
- One or two measured inference slots depending on available CPU/RAM.
- Local-model prompts/schemas, deterministic sectioning/cropping shortcuts,
  caption grounding using page image plus extracted text, caching,
  cancellation, and normal pipeline logs.
- Optional OpenAI regeneration through the same provider boundary.
- Diagnostics showing selected/loaded model, runtime version, backend/device,
  GPU layers, memory estimate, context, process, latency, and token speed.

Users do not need Ollama, Python, Homebrew, or a Hugging Face account for the
public recommended models. Ollama remains an optional developer provider.

## Local speech and exported ADTs

The local speech implementation supports:

- Kokoro models downloaded on demand from compatible Hugging Face repositories.
- Kokoro ONNX CPU execution for portability.
- An optional Apple Silicon MLX path.
- A zero-download macOS system-voice “Mac Fast” option.
- Replaceable cloud speech providers.

Speech is generated during authoring. The resulting WAV/MP3 files are copied
into the final ADT. The export contains static HTML, JavaScript, images, and
audio only; it does not contain Gemma, Kokoro, Electron, or an inference
runtime. It can therefore be used offline anywhere a browser can open it.

Current local speech is English-only. Multilingual providers require explicit
adapters plus native-speaker evaluation; arbitrary Hugging Face TTS models are
not automatically compatible.

## Momo benchmark results

Source: 20-page Momo PDF. Machine: Apple M2 Max, 32 GB unified memory.

| Configuration | End-to-end time | Relative to GPT | Marginal API cost |
|---|---:|---:|---:|
| GPT-5.4 + OpenAI speech | 91.7 s | 1.00× | ~$1.49 |
| Gemma E4B + Kokoro | 264.2 s | 2.88× | $0 after download |
| Gemma E4B + macOS system voice | 157.7 s | 1.72× | $0 |

The original Gemma 12B/Kokoro run took 895.3 seconds. E4B, deterministic work,
prompt/schema reductions, two bounded slots, and the optional fast speech path
reduced local generation to 157.7 seconds—inside the requested 2.5× GPT target.
More CPU/GPU overlap and two MLX workers were tested and rejected because full
book performance regressed under sustained memory contention.

Quality remains lower than GPT on Momo:

- Manual caption accuracy: GPT-5.4 **15/15**; Gemma E4B **11/15**.
- Two-pass multimodal GPT-5.6 Sol judge: GPT-5.4 **118/120** atomic criteria;
  Gemma E4B **82/120**.
- Judge position consistency: **13/15**; judge cost approximately **$1.23**.

Gemma is therefore suitable for private, zero-API-cost first drafts, but is not
yet a quality-equivalent replacement for GPT-5.4. Keep mandatory preview and
allow cloud regeneration by stage.

TTS ASR round-trip covered all generated files. Mac system speech measured
4.12% character error rate; OpenAI speech measured 5.11%. This indicates
intelligibility only, not naturalness or pronunciation quality. Native-speaker
MOS and blinded preference testing are still required.

## Evaluation framework added

The repository now includes a reusable framework for comparing complete ADT
systems—not only raw LLM responses:

- language, domain, content type, audience, layout, source quality, and risk
  strata;
- repeated randomized model runs and held-out datasets;
- deterministic technical/export/accessibility gates;
- atomic multimodal rubrics with `met`, `not_met`, and `uncertain` decisions;
- blind human review and calibrated multi-family LLM judges;
- position-bias and repetition-consistency audits;
- document-clustered confidence intervals, paired bootstrap comparisons,
  Holm correction, Bradley–Terry ranking, and worst-run reporting;
- separate quality, latency, cost, privacy, memory, and reliability scorecards;
- TTS decode/signal checks, WER/CER, and native-listener review requirements.

Momo remains a harness proof, not a general model ranking. A publishable claim
requires at least 30 documents, three independent generations per model,
adequate documents per reported language/domain/layout cell, held-out tests,
and at least two blinded native reviewers.

## Validation completed

- Full repository suite: **223 test files / 2,800 tests passed**.
- TypeScript strict check passed.
- Lint: 0 errors; existing unused-suppression warnings remain in upstream code.
- Packaged macOS API health check passed.
- Generated ADT browser smoke: 22/22 HTML pages, zero runtime errors.
- Real signing/notarization remains blocked by unavailable Developer ID
  credentials.
- Windows packaging support exists, but real Windows runtime validation remains
  required before release claims.

## Integration with current development

The branch now includes `develop` through commit `52974df6` (2026-08-14).
Conflict resolution kept the local providers as a small extension of the
existing provider boundary and retained upstream work for book outlines, Core
TTS, ElevenLabs, speech debug logs, onboarding, and export remediation.

Local Kokoro and macOS system speech now share routing, voice mapping, caching,
progress, failure handling, and export behavior with the cloud speech
providers. ElevenLabs retains its separate concurrency cap and retry policy;
local and other providers are not slowed by that cap.

The large unmerged provider-abstraction PR was not copied into this branch. It
overlaps the same routing surface and would create a second abstraction before
the first is merged. The lean integration is the existing AI SDK/provider
factory plus explicit embedded-local adapters.

The merged suite also fixes Node 26 test isolation for browser storage, caps
memory-heavy Vitest workers at four, and prevents local `.env` credentials from
changing credential-validation test outcomes. All locale catalogs contain zero
missing translations.

## Recommended 30/60/90-day plan

| Window | Priority |
|---|---|
| 0–30 days | Credential isolation, Electron/API security, required review/CI, dependency fixes, and a small multilingual evaluation corpus |
| 31–60 days | One orchestrator, packaged macOS/Windows smoke tests, model trust UI, TTS worker, and speech adapter registry |
| 61–90 days | Native/expert evaluation, second judge family, multilingual speech pilots, hard-PDF routing tests, signed macOS and real Windows release validation |

## Final recommendation

Keep the modular, local-first direction. Do not require Ollama, execute arbitrary
Hugging Face repositories, or bundle large model weights into every installer.
Prioritize security, one orchestration path, model provenance, reproducible
evaluation, human review, and packaged cross-platform testing before adding
more generation features.

## Supporting documents

- [`ADT_STUDIO_ENGINEERING_REVIEW_AND_MOMO_BENCHMARK_2026-08-03.md`](ADT_STUDIO_ENGINEERING_REVIEW_AND_MOMO_BENCHMARK_2026-08-03.md)
- [`ADT_STUDIO_TLDR_2026-08-05.md`](ADT_STUDIO_TLDR_2026-08-05.md)
- [`LOCAL_AI.md`](LOCAL_AI.md)
- [`EVALUATION_FRAMEWORK.md`](EVALUATION_FRAMEWORK.md)
- [`benchmarks/momo/README.md`](benchmarks/momo/README.md)
