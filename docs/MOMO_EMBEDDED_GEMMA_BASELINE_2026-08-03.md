# Momo embedded Gemma + Kokoro baseline — 2026-08-03

## Verdict

**PASS for an offline Apple Silicon desktop pilot.** The Electron macOS app converted all 20 Momo PDF pages into a working static ADT with embedded llama.cpp, on-demand Gemma 4 12B weights, and local Kokoro speech. Ollama, cloud credentials, and a Hugging Face account were not required.

This is a technical baseline, not approval to publish AI output without editorial, child-safety, language, and accessibility review.

## Test setup

| Item | Value |
|---|---|
| Source | `/Users/amoghbanta/Downloads/UNICEF/momograde1.pdf` |
| PDF SHA-256 | `3d4e589013715ee89ee0e9ac1e7419daf4e4afd8bbdc9a85eaa4b34dd82c6468` |
| Computer | Apple M2 Max, 32 GB unified memory |
| Desktop | Electron macOS arm64 unpacked app |
| LLM | Gemma 4 12B Q4, embedded llama.cpp b10236, Metal |
| Model SHA-256 | `3712b9bd32cae83a22f67ee7a4466d8d7a4f21646ac8a07d19bf9418e8767a70` |
| Projector SHA-256 | `59e62255435dda870e2d1de97cc031330b31a898bac12b38a182cecff9cd3738` |
| Hugging Face revision | `7e0fbb8205d1f4857f4606a38a65023aaeb5f544` |
| Speech | `onnx-community/Kokoro-82M-v1.0-ONNX`, q8, `af_heart`, CPU |

## End-to-end result

- All pipeline stages passed: extraction, sectioning, storyboard, quizzes, captions, glossary, TOC, speech, package, preview.
- Metadata identified the English book as *Momo and the Leopards*; a five-page sample avoided treating publisher front matter as the language/title source.
- Five quizzes were coherent and story-grounded. Institutional vision/copyright matter is deterministically excluded from quizzes and glossary input.
- Captions correctly described difficult illustrated pages, including a frightened monkey watched by a leopard and a mother leopard with her cub.
- Kokoro generated every requested WAV; exported playback was exercised in Chromium.
- All 22 exported HTML pages returned HTTP 200 with zero console, page, or request errors.

| Artifact metric | Result |
|---|---:|
| Reader HTML pages | 22 |
| Story quizzes | 5 |
| Glossary terms | 13 |
| Audio files/references | 129 / 129 |
| Missing, unreferenced, or invalid audio | 0 |
| Audio format | PCM16, mono, 24 kHz WAV |
| Audio duration | 386.45 seconds |
| ADT files | 227 |
| ADT size | 41 MB |
| Automated Axe pages/violations/errors | 22 / 0 / 0 |

Artifact: `/Users/amoghbanta/Library/Application Support/@adt/desktop/books/momo-embedded-gemma-12b/adt`

The Axe scan had color contrast disabled and is not WCAG certification.

## Runtime and delivery proof

- The 12B model and projector downloaded only after selection. Pause/resume preserved the partial file, and final sizes and SHA-256 hashes matched the pinned catalog.
- The app bundle contains llama.cpp but no `.gguf`, `.onnx`, or `.safetensors` model weights. Gemma and Kokoro files remain under Electron user data and are not copied into the ADT.
- Observed diagnostics reported Apple M2 Max, Metal, 36 GPU layers, 16K context, about 2.83 GB model GPU memory for the smaller E2B smoke model, about 256 prompt tokens/s, and about 139 generated tokens/s. These are one-machine smoke figures, not comparative benchmarks.
- The final ADT contains normal HTML, JavaScript, images, and generated WAV files; readers do not need Gemma, Kokoro, Ollama, or internet access.

## Quality and performance observations

- Gemma 4 12B is the recommended tier for this 32 GB machine. E2B proved the runtime/text/vision path but failed the full-book quality bar before prompt and language-validation hardening.
- Cold model startup and complex multimodal calls are materially slower than cloud calls. Warm illustrated-page sectioning was roughly 10–40 seconds on this machine.
- The optional image-meaningfulness LLM pass caused schema echo and excessive latency locally. Embedded local mode now keeps the deterministic image filter and skips that optional refinement unless a model is explicitly configured.
- Whole-run timing was not cleanly instrumented because fixes were applied and stages rerun. Do not use this run for the OpenAI comparison latency result.

## Remaining gates

1. Blind human review of all text, captions, quizzes, and 6.4 minutes of audio.
2. Same-PDF OpenAI run with fixed prompts/settings and per-stage quality, latency, retry, memory, and cost capture.
3. Signed/notarized macOS release and native Windows x64 validation. CI packaging/runtime smoke is useful but is not real Windows hardware proof.
4. Multilingual local TTS adapters must be benchmarked per language, model license, phonemizer, voice, and platform before being offered as supported choices.
