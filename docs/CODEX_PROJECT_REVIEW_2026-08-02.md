# ADT Studio technical review — 2026-08-02

## Executive verdict

ADT Studio has a strong product concept, strict TypeScript, a meaningful automated test suite, and unusually good pipeline observability. It is not production-ready for untrusted or multi-user hosting. The desktop/local workflow is the safest deployment model today.

This branch adds tested local-first Gemma 4 and Kokoro paths. The complete 20-page Momo book completed extraction, metadata, summary, sectioning, storyboard, quizzes, captions, glossary, TOC, speech, packaging, and reader smoke testing without cloud credentials. The final static ADT has 22 reader pages, 5 quizzes, 9 glossary terms, and 118 valid local WAV files.

## What is good

1. **Clear domain pipeline.** `packages/types/src/pipeline.ts` gives stages and dependencies a shared vocabulary.
2. **Strict TypeScript and schemas.** Zod boundaries and project references catch many integration errors early.
3. **Book-scoped persistence.** SQLite WAL, foreign keys, page/entity storage, and portable book folders are sound foundations.
4. **LLM transparency.** Prompt resolution, request logs, response caching, usage, and validation feedback are first-class.
5. **Cancellation and task progress.** Long operations expose progress and cancellation rather than hiding synchronous work behind HTTP.
6. **Accessibility is part of the product.** Output assessment and browser rechecks are present, not deferred to release day.
7. **Large test corpus.** The baseline contains about 2,200 passing tests. Most observed failures were environment or timeout coupling, not broad functional collapse.

## Findings

### Critical

1. **Hosted API lacks authentication.** `apps/api/src/app.ts` mounts all book, prompt, export, debug, and generation routes without an authorization boundary. Before this branch, `apps/api/src/server.ts` also accepted the server adapter's all-interface default. This branch binds to `127.0.0.1`, but Docker/hosted deployments still need authentication, CSRF protection, tenant isolation, and an explicit trusted-proxy policy.

   **Impact:** anyone who can reach the port can read, modify, export, or delete book data and spend configured AI credits.

2. **Generated content executes in privileged same-origin preview frames.** `StepperActivityPreview.tsx`, `StoryboardQuizDetail.tsx`, `BookPreviewFrame.tsx`, and `PreviewView.tsx` render generated HTML/JavaScript. Several parent features depend on same-origin DOM access, preventing a simple sandbox attribute from being a complete fix.

   **Recommendation:** serve previews on a separate opaque origin, use `sandbox="allow-scripts allow-forms"` without `allow-same-origin`, and replace DOM reach-through with a small validated `postMessage` protocol.

3. **Archive extraction is insufficiently bounded.** `apps/api/src/app.ts` and import/upload routes read and expand archives without robust entry-count, expanded-size, compression-ratio, or total upload limits. Resource extraction also needs canonical destination containment per entry.

   **Impact:** zip-slip, disk exhaustion, memory exhaustion, and denial of service.

### High

4. **Cloud credentials are mutated through process-global environment state.** Page editing, easy read, fonts, pages, and summary services temporarily assign provider keys to `process.env`. Concurrent requests can observe the wrong user's key.

   **Recommendation:** pass an immutable credentials object to every model/speech factory. Never mutate `process.env` per request.

5. **The documented versioning invariant is not true.** `packages/storage/src/book-storage.ts` deletes older versions in normal flows. This conflicts with README's “never overwrite” promise.

   **Recommendation:** either retain immutable versions with explicit retention/compaction, or rewrite the product promise and make destructive compaction visible and auditable.

6. **Version allocation races.** Storage uses `MAX(version) + 1` followed by insert. Concurrent writers can calculate the same version.

   **Recommendation:** allocate inside an immediate transaction with a unique constraint and bounded retry, or use a monotonic version table.

7. **Two pipeline orchestrators can drift.** CLI orchestration lives in `packages/pipeline/src/pipeline-dag.ts`; desktop/API orchestration lives in `apps/api/src/services/stage-runner.ts`.

   **Impact:** a CLI pass does not prove the Mac app path. Local-AI changes already required matching speech behavior in both files.

   **Recommendation:** one orchestration package with adapters for CLI progress, API tasks, and interactive page-error decisions.

8. **Packaged desktop tried to edit signed resources.** The packaged path resolver used `process.resourcesPath/config.yaml` and `prompts/` for write-capable routes.

   **Fixed here:** packaged config, prompts, templates, and config assets are seeded once into Electron `userData`; user edits survive upgrades.

9. **Electron hardening is incomplete.** `apps/desktop/src/main/windows/main.ts` disables the Chromium sandbox because the preload exposes Node-backed toolkit functionality. DevTools were always enabled and external protocols were not allowlisted.

   **Fixed here:** production DevTools are disabled, external navigation is limited to HTTP(S), and the minimum window is reduced. Remaining work is a narrow context-isolated preload that allows `sandbox: true`.

10. **Secrets are stored in browser localStorage.** Provider keys persist as plaintext renderer data.

    **Recommendation:** store them in macOS Keychain/Windows Credential Manager through a minimal main-process IPC API; keep only provider availability in renderer state.

11. **Unbounded local concurrency.** The global default of 32 LLM calls can thrash one local GPU and multiply memory use.

    **Fixed here:** Ollama inference is serialized. Follow-up benchmarking should expose a measured local concurrency value, normally 1.

12. **LLM cache identity was incomplete.** Cache keys omitted `maxTokens` and endpoint/provider identity, allowing stale or cross-endpoint hits; writes were non-atomic.

    **Fixed here:** cache format v2 includes both values and uses temp-file plus rename.

### Medium

13. **Large UI/service modules are expensive to change.** `LanguageView.tsx` and `StoryboardSectionDetail.tsx` exceed 3,000 lines; the Studio API client exceeds 2,000 lines.

    **Recommendation:** split by feature state machine, commands, query adapters, and presentational panels. Do this with characterization tests, not a rewrite.

14. **Accessibility gaps exist in the authoring UI.** Hidden onboarding tab panels remained focusable; API-key eye buttons lacked names and keyboard focus. The primary color measured about 3.66:1 in the audit, and several animations ignore reduced-motion.

    **Fixed here:** inactive onboarding panels are hidden from focus/assistive technology, key toggles are named and keyboard reachable, and new spinners honor reduced motion. Contrast and the wider motion system still need a dedicated pass.

15. **Desktop failure recovery is weak.** The API utility process is nulled on crash but not restarted or surfaced with a recovery action.

    **Recommendation:** supervised restart with capped exponential backoff, a visible fatal state, logs export, and “restart backend” control.

16. **Responsive authoring support is artificially restricted.** The desktop window previously required 1280×720.

    **Fixed here:** 960×640 minimum. Individual dense views still need responsive validation.

17. **Bundle size is high.** Audit output measured a roughly 3.28 MB minified main renderer bundle, plus large PDF/worker chunks.

    **Recommendation:** route-level splitting, lazy Monaco/PDF tooling, dependency visualizer budgets, and CI regression thresholds.

18. **Tests are not fully hermetic.** Ambient `OPENAI_API_KEY` changes credential tests; several slow tests cross the default timeout; Node 26 exposes jsdom/localStorage incompatibilities while CI uses Node 22.

    **Recommendation:** clear environment variables in test setup, use fake timers or explicit focused timeouts, pin Node 22 with `.nvmrc`/Volta, and run Electron smoke tests in CI.

19. **Documentation overstates guarantees.** README lists `test:coverage`, which is not a package script, and “WCAG-validated output” reads stronger than the documented automated/manual assessment boundary.

20. **Book isolation is breached by global styleguides.** Some page routes write styleguide state outside the book folder.

    **Recommendation:** snapshot chosen styleguide assets/config into each book and treat global assets as read-only templates.

## Local Gemma 4 implementation

- Provider IDs: `ollama:gemma4-e2b`, `e4b`, `12b`, `26b`, `31b`.
- Runtime: Ollama's loopback OpenAI-compatible API.
- Hardware-aware recommendation: E2B at 8 GB, E4B at 12 GB, 12B at 20 GB, 26B at 48 GB, 31B at 64 GB. The 26B model also ran on the tested 32 GB M2 Max, but remains an opt-in installed model rather than the conservative recommendation.
- Desktop onboarding: detects memory/runtime/models, recommends a model, streams download progress, and selects it as the default.
- Local structured output: uses JSON mode, disables reasoning output, serializes requests, and recovers schema-echo responses so domain validation can give Gemma corrective retry feedback.
- Local text and vision: both verified against a real `gemma4:26b` runtime.
- Full PDF proof: 20-page `momograde1.pdf`, no cloud keys, all creation, local speech, package, integrity, and reader smoke checks passed. See `docs/MOMO_LOCAL_GEMMA_KOKORO_BASELINE_2026-08-02.md`.
- Cloud improvement path: adding OpenAI credentials and selecting an OpenAI model lets the user rerun any stage; the local result remains versioned.

Known capability boundary: Gemma 4 is used for text and image understanding. English speech synthesis is now available through the separate optional Kokoro/native-CPU provider; image generation and word-level speech alignment still require separate local engines or optional cloud providers.

Official references: [Gemma 4](https://ai.google.dev/gemma/docs/core), [Ollama Gemma 4 models](https://ollama.com/library/gemma4), [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility), [structured outputs](https://docs.ollama.com/capabilities/structured-outputs).

## Dependency review

The initial audit reported 2 critical, 21 high, 31 moderate, and 9 low advisories across all runtime/build/dev dependency paths. This branch updated/overrode Electron Builder, Electron Updater, DOMPurify, LiquidJS, js-yaml, PostCSS, Rollup, Seroval, tar, ws, jsdom, tsx, and Vitest. The follow-up audit reports **0 critical, 8 high, 23 moderate, 8 low**.

The remaining high findings are in build/dev dependency chains (`@lingui/cli`, Electron packaging/Flatpak helpers), not evidence of nine independently exploitable shipped-app paths. They still require tracked upgrades, especially the desktop Lingui 5→6 migration and transitive minimatch/tmp cleanup.

Peer warnings remain: Tailwind's Vite plugin does not yet declare Vite 8 support, and desktop Lingui packages resolve mixed 5.9.x patch versions. Pin compatible sets instead of ignoring these indefinitely.

## PDF Inspector assessment

[`firecrawl/pdf-inspector`](https://github.com/firecrawl/pdf-inspector) is useful for locally classifying text, scanned, and mixed PDFs and extracting Markdown. On Momo it classified 20 pages as mixed in about 8 ms and returned 2,769 characters of Markdown. It is not a drop-in replacement for ADT Studio's MuPDF/WASM extraction because ADT needs coordinates, page images, figures, and deterministic cross-platform Electron packaging. Its Rust/N-API binding also conflicts with the project's stated “WASM over native bindings” principle.

Recommended integration: add it behind an optional `PdfClassifier` interface and use the result to choose extraction strategy. Keep MuPDF primary; use on-demand Docling for OCR/structure, MinerU for complex layouts/tables/formulas, or PaddleOCR for multilingual scans. Do not replace the current extractor until Windows/macOS packaging and coordinate fidelity pass.

## Prioritized roadmap

1. Add API authentication and separate-origin sandboxed previews before any shared hosting.
2. Remove request-time `process.env` credential mutation; move desktop secrets to OS credential storage.
3. Consolidate the two orchestrators and add packaged Electron end-to-end tests.
4. Make version allocation transactional and align retention behavior with documentation.
5. Add archive/upload limits and canonical extraction containment.
6. Benchmark Gemma 4 tiers versus OpenAI on quality, latency, memory, retries, and cost using a fixed multilingual PDF corpus.
7. Benchmark and extend the new English Kokoro/native-CPU speech provider; add multilingual local speech, OCR, and image-generation providers only behind capability interfaces.
8. Split the largest UI/service modules and enforce bundle budgets.

## Release recommendation

**Local desktop pilot: GO with monitoring. Shared/cloud hosting: NO-GO until critical security controls are complete.**
