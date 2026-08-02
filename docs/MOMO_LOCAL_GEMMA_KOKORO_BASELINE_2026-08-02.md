# Momo local Gemma + Kokoro baseline — 2026-08-02

## Verdict

**PASS for an offline macOS authoring baseline.** The packaged Electron app converted the complete Momo PDF into a working static ADT using Gemma 4 and Kokoro without cloud AI credentials. Model weights were downloaded on demand and are not inside the app or exported ADT.

This is a technical and first-pass content baseline, not a claim that AI output can ship without human editorial and accessibility review.

## Test setup

| Item | Value |
|---|---|
| Source | `/Users/amoghbanta/Downloads/UNICEF/momograde1.pdf` |
| SHA-256 | `3d4e589013715ee89ee0e9ac1e7419daf4e4afd8bbdc9a85eaa4b34dd82c6468` |
| PDF | 20 A4 pages, 1,925,807 bytes, mixed text/image content |
| Computer | MacBook Pro, Apple M2 Max, 32 GB unified memory |
| Desktop | Electron macOS arm64 unpacked build |
| LLM | Ollama `gemma4:26b`, about 17 GB, local loopback only |
| Speech | `onnx-community/Kokoro-82M-v1.0-ONNX`, q8, `af_heart`, native CPU |
| Kokoro revision | `1939ad2a8e416c0acfeecc08a694d14ef25f2231` |
| Output language | English |

## End-to-end result

1. PDF extraction: passed all 20 source pages.
2. Metadata, summary, sectioning, storyboard, captions, quizzes, glossary, TOC: passed using local Gemma.
3. Speech: passed using local Kokoro; no OpenAI Voice API call.
4. Packaging: passed through the desktop `/package-adt` workflow.
5. Reader smoke test: cover, story page, final quiz, navigation, and read-aloud controls rendered and operated.
6. Package integrity: 118 referenced WAV files, 118 unique references, zero missing or invalid files.

### Final artifact

| Metric | Result |
|---|---:|
| Reader pages | 22 |
| Story quizzes | 5 |
| Glossary terms | 9 |
| Image captions | 15 meaningful images completed |
| Audio files | 118 WAV |
| Audio format | PCM16, mono, 24 kHz |
| Audio duration | 403.45 seconds / 6.72 minutes |
| ADT size | 41 MB |
| Files in ADT | 216 |
| Build content version | `8fdb2d080a208dff` |
| Missing/invalid audio | 0 |

Artifact: `/Users/amoghbanta/Library/Application Support/@adt/desktop/books/momo-local-gemma-kokoro-baseline/adt`

## Quality observations

### Gemma 4

- Story structure and final quiz content were coherent and grounded in the book.
- The final quiz asks what happened to the leopards and supplies plausible distractors rather than institutional end-matter.
- The final difficult image caption correctly reads: “A yellow leopard hangs upside down from a tree branch under a starry night sky with a crescent moon.”
- Warm caption calls were roughly 3–4 seconds on this machine. Exact whole-pipeline timing was not instrumented, so this run must not be used for latency comparison with OpenAI.
- A general prompt that supplied both a full page and crop confused Gemma on the leopard image. A Gemma-specific single-image caption prompt fixed it. This proves prompt/model variants are necessary; cloud-optimized prompts should not be assumed portable.
- Gemma emitted byte escape fragments in one glossary response and initially generated a quiz from the publisher's VISION/MISSION page. Both failure classes now have deterministic cleanup/exclusion.

### Kokoro

- Actual packaged-Electron synthesis and playback passed; this was not a standalone script-only test.
- The original WebAssembly backend failed on fresh inference inside Electron's utility process. The shipped desktop path now uses `onnxruntime-node` CPU inference and succeeded for every cache miss.
- One tested caption synthesized in about four seconds; the full 118-item stage completed without failures.
- Technical integrity and spot playback are verified. A full 6.72-minute human listening rubric for pronunciation, prosody, and child suitability remains for the OpenAI comparison round.
- Kokoro is currently English-only in this adapter. Other languages require separate replaceable adapters/models and explicit license, phonemizer, voice, quality, and platform checks.

## Model delivery and privacy

- Gemma weights live in Ollama's model store (`~/.ollama/models`).
- Kokoro files live under Electron user data (`models/tts`) and occupy about 89 MB on disk.
- Both are downloaded only after the user chooses them.
- The final 429 MB macOS app contains no `.onnx`, `.gguf`, or `.safetensors` model weights.
- The exported ADT contains generated WAV files, not Kokoro. It is a normal offline HTML/JS reader and does not need a model runtime.
- An optional OpenAI model/provider can regenerate individual stages later without deleting the versioned local result.

## PDF Inspector experiment

`@firecrawl/pdf-inspector` 1.11.2 was run against Momo from a temporary install.

| Result | Value |
|---|---|
| Classification | `Mixed` |
| Confidence | about 0.70 |
| Pages | 20 |
| Time | about 8 ms |
| Markdown | 2,769 characters |
| Signals | page 1 scanned; no tables, columns, complex layout, or encoding problem reported |

It improves the workflow as a very fast local preflight classifier and readable-text preview. It does **not** improve or replace ADT's core extraction because it does not reconstruct the images, layout, bounding boxes, and coordinate fidelity needed for the reader.

Recommended integration: optional `PdfClassifier` before extraction, used to choose the normal MuPDF path or an on-demand OCR/layout sidecar. Keep its native binary outside the universal Electron bundle until macOS Intel and Windows ARM coverage exists.

## Additional local tools researched

1. **Docling:** best first OCR/document-structure fallback; broad document support and a documented CLI/model-download path.
2. **MinerU:** stronger candidate for complex layouts, tables, formulas, and coordinate-rich intermediate output; heavier operational footprint.
3. **PaddleOCR:** strongest candidate for multilingual scanned pages and document parsing; language/model packaging needs corpus benchmarks.

Use all three behind replaceable capability interfaces and download models on demand. Do not bundle every engine into Electron. PDF Inspector classifies; MuPDF remains the deterministic primary extractor; a selected sidecar handles pages that need OCR or richer structure.

## Issues found and fixed during this run

1. Correct image MIME types now reach multimodal prompts.
2. Gemma captions use one target image instead of conflicting full-page/crop inputs.
3. Local structured output is schema-validated after recovery and cached canonically.
4. Caption validation rejects obvious corruption descriptions and invalid decorative classification.
5. Glossary output decodes model byte escapes.
6. Quiz generation excludes copyright and institutional end-matter.
7. Speech stages fail visibly if any non-Gemini item fails; incomplete audio cannot report success.
8. Kokoro uses native ONNX CPU inference in packaged Electron and retries a poisoned session once.
9. Packaged upgrades merge newly shipped prompts/config assets without overwriting user edits.
10. Desktop/server bundles copy only the current platform's native ONNX binding; model weights remain external.

## Remaining gates

- Complete a blinded human content and full-audio review.
- Run the same PDF with fixed OpenAI model, prompt, and TTS settings.
- Record per-stage latency, peak RAM, model retries, editorial corrections, accessibility findings, and cloud cost.
- Test Intel macOS and Windows x64 builds. Windows ARM needs an explicit support decision.
- Sign, notarize, and test a release build with a valid Apple Developer ID.
- Automated scan reported zero Axe violations, but contrast checking was not active; do not call this WCAG-certified.
