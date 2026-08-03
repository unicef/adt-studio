# Local AI on Mac and Windows

ADT Studio runs Gemma 4 inside the desktop app. Users do **not** need Ollama, Python, Homebrew, or a Hugging Face account.

## User flow

1. Open **Settings → Local AI**.
2. Download the recommended Gemma 4 model.
3. ADT verifies the immutable Hugging Face revision and SHA-256 checksums, then selects it.
4. The model loads on first use. Later requests reuse the loaded runtime.

The app bundle contains a pinned llama.cpp runtime (about 26 MB on macOS), not model weights. Models download on demand to Electron `userData/models/llm`. Interrupted downloads remain resumable. PDFs, images, and prompts stay on the computer.

| System memory | Recommended model | Download |
| --- | --- | ---: |
| 8–11 GB | Gemma 4 E2B Q4 | 3.2 GB |
| 12–19 GB | Gemma 4 E4B Q4 | 4.8 GB |
| 20–47 GB | Gemma 4 12B Q4 | 6.9 GB |
| 48 GB+ | Gemma 4 26B A4B Q4 | 14.4 GB |

Recommendations are conservative starting points, not performance guarantees. The debug panel reports the active model, llama.cpp version, Metal/CUDA/Vulkan/CPU backend, context size, latency, and token speed.

## Runtime architecture

- `local:*` is the default provider.
- The API supervises a loopback-only `llama-server` process and lazily loads the selected model.
- The existing OpenAI-compatible client is proxied internally, so text, image inputs, structured-output validation, cancellation, caching, and logs keep one provider boundary.
- Ollama remains supported through `ollama:*` IDs for developers who already use it; it is never required.
- Runtime releases, model revisions, sizes, and hashes are pinned. Model data is never shipped in the installer or exported ADT.

## Platform matrix

| Platform | Bundled backend | Status |
| --- | --- | --- |
| macOS Apple Silicon | Metal + CPU fallback | Implemented and locally testable |
| macOS Intel | Metal + CPU fallback | Packaging supported; requires Intel runner verification |
| Windows x64/ARM64 | CPU baseline | Packaging supported; requires Windows runner verification |
| Linux x64/ARM64 | CPU baseline | Packaging supported; requires Linux runner verification |

Windows GPU acceleration should be added as a separately tested Vulkan/CUDA runtime choice with automatic CPU fallback. Do not claim cross-platform performance from macOS-only measurements.

## Local speech and exports

In **Local speech**, search Hugging Face or paste an `owner/model` ID/URL. ADT validates compatible Kokoro ONNX repositories and downloads the selected model and voices to `userData/models/tts`.

Kokoro synthesizes WAV files during authoring. Those audio files are embedded in the final static HTML/JS ADT. Neither Kokoro nor Gemma is bundled in the export, so the ADT plays normally without an AI runtime.

Current local speech is English-only. Unsupported languages must use a configured replaceable provider until a tested multilingual adapter is added.

## Build and operations

- `pnpm --filter @adt/desktop prepare:llama` downloads and verifies the pinned runtime for the build host.
- Native CI must build/test each target. Cross-building alone is not runtime verification.
- Set `LOCAL_LLM_SERVER_PATH` only for development overrides.
- The tested default context is 16K; set `LOCAL_LLM_CONTEXT_SIZE` or `LOCAL_LLM_GPU_LAYERS` only after benchmark validation.

Official references: [llama.cpp](https://github.com/ggml-org/llama.cpp), [multimodal llama.cpp](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md), [Hugging Face Hub JS](https://huggingface.co/docs/huggingface.js/en/hub/README).
