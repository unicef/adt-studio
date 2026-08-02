# Local AI on Mac and Windows

ADT Studio can create books with Gemma 4 through Ollama without a cloud LLM key.

## Mac app

1. Install and open [Ollama](https://ollama.com/download).
2. Open ADT Studio.
3. In onboarding, keep **Local AI** selected. Later, use **Settings → Local AI**.
4. Download the recommended Gemma 4 model, or select an already installed model.
5. Create/import a book and run the pipeline normally.

The app detects system memory, streams download progress, and writes model files to Ollama's normal model storage—not inside the book or app bundle.

## Windows app

The flow is the same: install Ollama for Windows, start it, then select/download a model in **Settings → Local AI**. The integration uses `127.0.0.1` and contains no macOS-only model code.

## Model guidance

| System memory | Suggested model |
|---:|---|
| 8 GB | Gemma 4 E2B |
| 12–19 GB | Gemma 4 E4B |
| 20–47 GB | Gemma 4 12B |
| 48–63 GB | Gemma 4 26B A4B |
| 64 GB+ | Gemma 4 31B |

Use the recommendation as a safe default. Faster GPUs and available memory bandwidth affect real performance; the benchmark round should refine these thresholds.

## Privacy and networking

- PDF content and prompts are sent only to the loopback Ollama service.
- The ADT API binds to `127.0.0.1` by default.
- Model download contacts Ollama's registry.
- No cloud LLM key is required.
- Cloud TTS is skipped during local-first creation when no speech key is configured.

## Optional OpenAI improvement pass

Add an OpenAI key in provider settings, select an OpenAI model as the default or step override, and rerun the desired stage. The previous local output remains available through the project's version history.

## Developer verification

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build:desktop
SKIP_NOTARIZE=MAC pnpm --filter @adt/desktop build:unpack
```

Runtime check:

```bash
curl http://127.0.0.1:11434/api/tags
```

Supported stable ADT model IDs map to Ollama tags in `packages/llm/src/ollama.ts`.

## Troubleshooting

- **Ollama is not running:** open Ollama, then select **Check again**.
- **Model is slow or memory pressure is high:** select the next smaller model and keep local concurrency at 1.
- **Structured response retry:** expected occasionally. ADT validates Gemma's JSON and sends precise correction feedback.
- **Speech has no audio:** configure OpenAI, Azure, or Gemini TTS, then run Speech separately. Gemma 4 is not a speech synthesizer.
- **App cannot edit prompts/config after packaging:** current builds seed writable copies into Electron `userData`. Existing user changes are preserved on update.
