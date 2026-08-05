# ADT Studio review — TL;DR

Date: 2026-08-05  
Review branch: `codex/local-gemma-audit`

## Verdict

The project is moving in the right product and architectural direction. Its
typed monorepo, observable generation pipeline, local book storage,
accessibility tooling, provider abstractions, documentation, and test coverage
are strong.

The main concerns are engineering governance and desktop security—not the core
product idea.

- **Local macOS pilot:** GO, with mandatory preview/editorial review.
- **General macOS/Windows desktop release:** CONDITIONAL GO after security,
  release, and packaged end-to-end work.
- **Shared or internet-hosted deployment:** NO-GO until authentication,
  authorization, tenant isolation, upload limits, and credential isolation are
  implemented.

## What is good

- Clear package boundaries for types, PDF processing, storage, pipeline, API,
  Studio, runtime, and desktop.
- Strict TypeScript/Zod contracts around non-deterministic model output.
- Good logs for prompts, retries, timing, tokens, validation, and progress.
- Portable book state using SQLite plus files.
- Accessibility checks are part of development rather than an afterthought.
- Local and cloud AI are replaceable providers.
- The final ADT is a static HTML/JS/images/audio bundle that works without the
  desktop app, model runtime, API key, or internet.

## Highest-priority problems

1. Remove request-time mutation of global API-key environment variables;
   credentials must be immutable and request-scoped.
2. Harden Electron: sandboxing plan, restrictive CSP, navigation allowlists,
   permission denial, IPC sender validation, production DevTools policy, and a
   per-launch loopback capability token.
3. Require CI and at least one approval before merge; add CODEOWNERS, resolved
   review-thread enforcement, dependency automation, and protection for both
   development and release branches.
4. Consolidate the duplicated API and CLI pipeline orchestration paths.
5. Add packaged import → generate → export smoke tests on macOS and Windows.
6. Break up oversized orchestration/routes incrementally behind tests.
7. Make Hugging Face model compatibility, revision, size, license, language,
   and trust status explicit before installation.

## Offline generation

ADT Studio is an **Electron app**, not Tauri. Ollama is not required. The app
starts its own pinned `llama.cpp` runtime and downloads Gemma/Kokoro weights on
demand from verified Hugging Face revisions. Model files remain outside both
the installer and exported ADT.

Recommended product flow:

1. User chooses Local or Cloud generation.
2. Local mode recommends a Gemma size based on RAM/CPU and downloads it once.
3. Speech uses optional Kokoro, a fast macOS system voice, or a cloud provider.
4. Generated WAV/MP3 files are bundled into the exported ADT.
5. Cloud regeneration remains available per stage when the user supplies a key.

## Momo benchmark

Test machine: Apple M2 Max, 32 GB unified memory. Source: 20-page Momo PDF.

| Configuration | Full generation | Relative | API cost |
|---|---:|---:|---:|
| GPT-5.4 + OpenAI speech | 91.7 s | 1.00× | ~$1.49 |
| Gemma E4B + Kokoro | 264.2 s | 2.88× | $0 after download |
| Gemma E4B + macOS voice | 157.7 s | 1.72× | $0 |

GPT-5.4 produced stronger captions on Momo. Manual accuracy was 15/15 for GPT
and 11/15 for optimized Gemma E4B. A separate multimodal GPT-5.6 Sol judge run
scored GPT-5.4 at 118/120 atomic criteria and Gemma at 82/120. Therefore Gemma
is suitable for private, zero-cost first drafts, but not yet a quality-equivalent
replacement for GPT-5.4. Editorial preview remains mandatory.

TTS ASR round-trip results were 4.12% CER for the macOS system voice and 5.11%
for OpenAI speech. This measures intelligibility only—not naturalness. Kokoro
and multilingual voices still require blinded native-speaker evaluation.

## Evaluation confidence

The new framework supports language, domain, content type, audience, layout,
source quality, and risk strata; atomic multimodal judging; position-bias
audits; human calibration; repeated runs; document-level confidence intervals;
paired statistics; TTS WER/CER; and quality/latency/cost Pareto comparisons.

Current Momo conclusions are still provisional because they use one English
storybook on one machine. A publishable recommendation requires at least 30
documents, three independent generations per model, held-out tests, sufficient
documents per reported stratum, and at least two blinded native reviewers.

## Recommended next steps

- **Now:** credential isolation, Electron security, branch protection, and
  dependency fixes.
- **Next 30–60 days:** unify orchestration, add packaged macOS/Windows smoke
  tests, improve model trust/compatibility UI, and move local TTS to a worker.
- **Next 60–90 days:** build a multilingual/domain benchmark corpus, add native
  and expert reviewers, calibrate at least two independent judge families, and
  validate signed/notarized builds on clean machines.

## Detailed references

- [`ADT_STUDIO_ENGINEERING_REVIEW_AND_MOMO_BENCHMARK_2026-08-03.md`](ADT_STUDIO_ENGINEERING_REVIEW_AND_MOMO_BENCHMARK_2026-08-03.md)
- [`EVALUATION_FRAMEWORK.md`](EVALUATION_FRAMEWORK.md)
- [`benchmarks/momo/README.md`](benchmarks/momo/README.md)
