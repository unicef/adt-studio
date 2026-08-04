# ADT model evaluation framework

This framework generates the same ADT with multiple models, blocks technically
invalid outputs, creates blind review packs, and produces quality, balanced,
and Pareto rankings. It deliberately separates generation, deterministic
checks, judging, and ranking so a model cannot grade its own hidden failures.

The full research-backed methodology, evidence tiers, multilingual/content
taxonomy and publication rules are in [`docs/EVALUATION_FRAMEWORK.md`](../docs/EVALUATION_FRAMEWORK.md).

Developer prerequisites are the repository dependencies plus `sqlite3` and
`ffprobe` on `PATH`; Chromium comes from the existing Playwright dependency.

## What is measured

- **Fidelity:** exact preservation of extracted source text plus blinded caption
  review against page-specific gold criteria.
- **Completeness:** expected page sectioning and rendering coverage.
- **Accessibility:** stored axe results, with a penalty for disabled rules.
- **Reliability:** completed package, zero LLM errors, valid audio, and no broken
  local HTML asset references.
- **Efficiency:** end-to-end wall time and recorded per-run API cost.

Hard gates run before scores. Rankings never hide a failed gate. The quality
profile excludes cost and latency; balanced includes them. The Pareto frontier
shows models that are not dominated simultaneously on quality, time, and cost.
Completed blind packs also produce a pairwise win-rate ranking independent of
the weighted absolute score.

## Valid evaluation protocol

1. Use at least 30 versioned PDFs for a public comparison, with at least three
   documents in every claimed language/domain/layout cell. A 15-document set is
   acceptable for an internal pilot only.
2. Run every model at least three times. The matrix randomizes model order but
   runs sequentially so local memory, thermal load, and API contention do not
   invalidate timing.
3. Hold non-LLM settings constant. Use the same TTS provider when comparing
   LLMs; evaluate speech models in a separate matrix.
4. Use two independent native-language human reviewers and at least two
   judge-model families for published comparisons.
   Candidate aliases are randomized. A candidate model must not be its own sole
   judge. Human adjudication resolves material disagreement.
5. Keep the private blind key separate from reviewers. Commit final rubrics,
   resolved judgments, raw run records, model revisions, and pricing date.
6. Treat bootstrap intervals as sampling uncertainty only. With fewer than five
   documents or unblinded review, the report explicitly remains provisional.

## Existing GPT/Gemma evaluation

```sh
pnpm eval:adt evaluate \
  --suite evals/suites/momo-gpt54-vs-gemma-e4b.json \
  --out docs/benchmarks/momo/model-evaluation-v1.json
```

This reuses the completed Momo runs. It is a framework proof, not a general
model verdict: one document and the legacy review is non-blind with one human.

## Generate several ADTs

Start the API, then run the example three times per model:

```sh
pnpm eval:adt:matrix \
  --matrix evals/matrices/momo-multi-model.example.json \
  --base-url http://127.0.0.1:3133/api \
  --books-root ./books \
  --out-dir .local-evals/momo
```

The runner reads credentials only from named environment variables or `.env`,
never writes them, randomizes candidate order per repetition, creates fresh book
labels, and writes `matrix-results.json` plus `suite.generated.json`. Add or
remove candidates in the matrix; provider headers are declared by environment
variable name, not secret value.

Validate the matrix and randomized plan without contacting any model:

```sh
pnpm eval:adt:matrix --matrix evals/matrices/momo-multi-model.example.json --dry-run true
```

## Blind review

```sh
pnpm eval:adt blind-pack \
  --suite .local-evals/momo/suite.generated.json \
  --out .local-evals/momo/blind-pack.json \
  --key-out .local-evals/momo/blind-key.private.json
```

Give only `blind-pack.json` to a reviewer. They mark each atomic criterion
`met`, `not_met`, or `uncertain`, add brief evidence, and choose a pairwise
preference. The legacy 1–5 fields remain accepted for old reviews. Convert the
completed pack into evaluator input:

```sh
pnpm eval:adt resolve-review \
  --pack .local-evals/momo/blind-pack.completed.json \
  --key .local-evals/momo/blind-key.private.json \
  --reviewer reviewer-1 \
  --out .local-evals/momo/reviewer-1.json
```

For the current multimodal GPT-5.6 Sol judge path:

```sh
pnpm eval:adt:judge \
  --pack .local-evals/momo/blind-pack.json \
  --key .local-evals/momo/blind-key.private.json \
  --model gpt-5.6-sol \
  --endpoint https://api.openai.com/v1/responses \
  --api-key-env OPENAI_API_KEY \
  --passes 2 \
  --reasoning-effort high \
  --out .local-evals/momo/judge-1.json
```

Add review files to `suite.generated.json`, then run `pnpm eval:adt evaluate`.
The judge sees the source PDF page, uses atomic `met` / `not_met` / `uncertain`
criteria, reverses candidate order on pass two, refuses to send credentials to
non-HTTPS remote endpoints, and retains evidence, confidence, usage and bias
audit metadata.

## Speech evaluation

```sh
pnpm eval:adt:tts \
  --export books/<book>/adt \
  --language pt-BR \
  --api-key-env OPENAI_API_KEY \
  --out .local-evals/tts.json
```

Without an API key this still checks every bundled file, expected-text
coverage, duration, clipping and excessive silence. With a key it adds ASR
round-trip WER/CER using `gpt-transcribe`. Native-speaker MOS and paired review
remain required for publishable TTS claims.

## Files

- `benchmark-policy.json`: machine-readable publication and calibration gates.
- `corpora/`: source-document metadata and gold page rubrics.
- `matrices/`: model generation configurations with no credentials.
- `reviews/`: resolved judgments; legacy unblinded data is labelled as such.
- `suites/`: candidates, run locations, gates, utility anchors, and weights.
- `schema/`: machine-readable suite schema.
- `scripts/adt-eval.mjs`: validate, blind, resolve, evaluate, and rank.
- `scripts/run-adt-eval-matrix.mjs`: repeated multi-model ADT generation.
- `scripts/judge-adt-eval-pack.mjs`: optional blind LLM judge adapter.

Current evidence limitation: Momo is one English storybook, so both candidates
remain ineligible for a public recommendation. Native multilingual documents,
domain rubrics, quiz/glossary/TOC criteria, human calibration labels and a
second judge family must be collected using the implemented protocol.
