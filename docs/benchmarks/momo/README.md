# Momo benchmark artifacts

Source: `/Users/amoghbanta/Downloads/UNICEF/momograde1.pdf`
Machine used: Apple M2 Max, 32 GB unified memory
Date: 2026-08-03

## Runs

- `gemma-before-run.json`: embedded Gemma 4 12B + Kokoro before caption grounding.
- `gemma-improved-run.json`: embedded Gemma 4 12B + Kokoro with full-page image and extracted page-text grounding.
- `openai-gpt54-run.json`: repository-default GPT-5.4 + `gpt-4o-mini-tts` baseline.
- `gemma-e4b-optimized.json`: deterministic sectioning/cropping path with Gemma E4B + Kokoro ONNX.
- `gemma-e4b-p2.json`: two-slot Gemma E4B + Kokoro full-book proof.
- `gemma-e4b-system-final.json`: two-slot Gemma E4B + macOS system speech; fastest accepted local run.
- `gemma-e4b-overlap.json` and `gemma-e4b-overlap-final.json`: rejected CPU/GPU overlap experiments.
- `gemma-e4b-mlx.json`, `gemma-e4b-persistent.json`, and `gemma-e4b-final.json`: MLX reload, one-worker, and rejected two-worker evidence.
- `comparison.json`: database/log/artifact/audio aggregation for the three reported runs.
- `export-smoke.json`: Chromium navigation result for every exported HTML page.
- `browser-a11y.json`: browser color-contrast recheck for every exported page.
- `caption-review.csv`: page-level manual caption rubric and decisions.
- `caption-review-e4b-final.csv`: final Gemma E4B page-level rubric.
- `model-evaluation-v1.json`: evaluation-framework proof comparing the final
  Gemma E4B run with GPT-5.4. Its ranking is provisional because the corpus is
  one PDF and the inherited manual review was neither blind nor duplicated.
- `model-evaluation-v2.json`: document-level strata, recommendation eligibility,
  paired inference, multiplicity control and judge meta-evaluation.
- `gpt56-sol-multimodal-judge-v2-summary.json`: real two-pass, position-swapped
  GPT-5.6 Sol page-image judge run with atomic criteria, bias audit, token use
  and estimated cost. It remains provisional until native human calibration.
- `gpt56-sol-multimodal-judge-v2.json`: complete anonymous judgments, evidence,
  rationales, presentation order, and usage for independent audit.
- `tts-gemma-mac-fast-static-v1.json` and `tts-openai-static-v1.json`: complete
  bundled-audio signal and expected-text checks; ASR and native-listener
  judgments are not yet present.
- `tts-gemma-mac-fast-asr-v2.json` and `tts-openai-asr-v2.json`: full-file
  `gpt-transcribe` round-trip WER/CER plus signal checks. They measure
  intelligibility only; native-listener MOS remains required.
- `export-smoke-*-eval-v1.json`: per-candidate Chromium runtime evidence consumed
  as a hard evaluation gate.

Generated books remain under Electron user data and are not committed because they contain large derivative images/audio. JSON records contain no API key.

## Reproduce

Start the source API with the desktop books/model directories and packaged ADT assets, then run:

```sh
node scripts/benchmark-momo-ai.mjs \
  --mode local \
  --label momo-benchmark-gemma-grounded \
  --pdf /Users/amoghbanta/Downloads/UNICEF/momograde1.pdf \
  --base-url http://127.0.0.1:3133/api \
  --out docs/benchmarks/momo/gemma-improved-run.json
```

For the cloud baseline, set `OPENAI_API_KEY` (legacy `OPEN_AI_API_KEY` in `.env` is also accepted), change mode/label/output to `openai`, `momo-benchmark-openai-gpt54`, and `openai-gpt54-run.json`. Runs never overwrite an existing book. Use a new label when repeating a condition.

For the measured fast Mac path, start the API with `LOCAL_LLM_PARALLEL=2`
(automatic on machines with at least 10 logical cores and 24 GB RAM) and run
the same local command with `LOCAL_BENCHMARK_MODEL=local:gemma4-e4b` and
`LOCAL_TTS_PROVIDER=local-system`. The accepted record is
`gemma-e4b-system-final.json`; it completed in 157.746 seconds.

Aggregate and smoke-check:

```sh
node scripts/analyze-momo-benchmarks.mjs \
  --runs docs/benchmarks/momo/gemma-before-run.json,docs/benchmarks/momo/gemma-improved-run.json,docs/benchmarks/momo/openai-gpt54-run.json \
  --local-status-url http://127.0.0.1:3133/api/local-ai/status \
  --out docs/benchmarks/momo/comparison.json

node scripts/smoke-adt-exports.mjs \
  --labels momo-benchmark-gemma-before,momo-benchmark-gemma-grounded,momo-benchmark-openai-gpt54 \
  --out docs/benchmarks/momo/export-smoke.json
```

The analyzer requires `sqlite3`, `ffprobe`, and `ffmpeg`. Cost assumptions are dated and recorded in `comparison.json`; refresh official pricing before future comparisons.

## Quality rubric

Metrics and schema validity are automated. Caption, quiz, glossary, TOC, and page-layout judgments are manual. A story caption passes only when key characters, action, and setting agree with the source page. Minor wording differences do not fail it. Audio automation proves format and decode validity only; publication still requires native-speaker listening and editorial/accessibility review.
