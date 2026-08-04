# ADT model evaluation framework

This framework generates the same ADT with multiple models, blocks technically
invalid outputs, creates blind review packs, and produces quality, balanced,
and Pareto rankings. It deliberately separates generation, deterministic
checks, judging, and ranking so a model cannot grade its own hidden failures.

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

1. Use at least five versioned PDFs covering storybooks, dense textbooks,
   scans/OCR, tables, multilingual/RTL material, and difficult images.
2. Run every model at least three times. The matrix randomizes model order but
   runs sequentially so local memory, thermal load, and API contention do not
   invalidate timing.
3. Hold non-LLM settings constant. Use the same TTS provider when comparing
   LLMs; evaluate speech models in a separate matrix.
4. Use two independent human reviewers and preferably two judge-model families.
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

Give only `blind-pack.json` to a reviewer. They score fidelity, completeness,
and clarity from 1–5. Convert the completed pack into evaluator input:

```sh
pnpm eval:adt resolve-review \
  --pack .local-evals/momo/blind-pack.completed.json \
  --key .local-evals/momo/blind-key.private.json \
  --reviewer reviewer-1 \
  --out .local-evals/momo/reviewer-1.json
```

For an OpenAI-compatible judge endpoint:

```sh
pnpm eval:adt:judge \
  --pack .local-evals/momo/blind-pack.json \
  --key .local-evals/momo/blind-key.private.json \
  --model judge-model-id \
  --endpoint https://provider.example/v1/chat/completions \
  --api-key-env JUDGE_API_KEY \
  --out .local-evals/momo/judge-1.json
```

Add review files to `suite.generated.json`, then run `pnpm eval:adt evaluate`.
The judge command refuses to send credentials to non-HTTPS remote endpoints and
keeps candidates anonymous in prompts. Judge rationales and usage are retained.

## Files

- `corpora/`: source-document metadata and gold page rubrics.
- `matrices/`: model generation configurations with no credentials.
- `reviews/`: resolved judgments; legacy unblinded data is labelled as such.
- `suites/`: candidates, run locations, gates, utility anchors, and weights.
- `schema/`: machine-readable suite schema.
- `scripts/adt-eval.mjs`: validate, blind, resolve, evaluate, and rank.
- `scripts/run-adt-eval-matrix.mjs`: repeated multi-model ADT generation.
- `scripts/judge-adt-eval-pack.mjs`: optional blind LLM judge adapter.

Current limitations: automatic source fidelity is lexical, axe results do not
replace manual WCAG testing, caption judging is the first gold content rubric,
and quiz/glossary/TOC gold rubrics still need to be added with the larger corpus.
