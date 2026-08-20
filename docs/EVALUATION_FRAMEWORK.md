# ADT Studio model evaluation framework

## Decision standard

This benchmark evaluates the complete ADT-producing system, not an LLM in
isolation. A public recommendation is allowed only when the candidate passes
technical gates, covers the claimed language/content stratum, has repeated
runs, and has document-level confidence intervals. One PDF can validate the
harness but cannot establish which model is best.

The design follows five current principles:

1. Evaluate real workflows and distributions, not generic model benchmarks.
2. Use multiple metrics and disclose scenario gaps.
3. Prefer atomic, task-specific criteria and pairwise decisions over one
   subjective 1–5 score.
4. Calibrate automated judges against blinded expert humans.
5. Report uncertainty, worst-case reliability, and cost/latency trade-offs.

## Benchmark taxonomy

Every source document declares these independent strata:

| Axis | Examples |
|---|---|
| Language/locale | `en`, `pt-BR`, `pt-PT`, `es`, `fr`, `sq`, RTL and code-switched |
| Domain | general literacy, health, science, mathematics, safeguarding |
| Content type | storybook, textbook, workbook, teacher guide, reference |
| Audience | pre-reader, grade band, adult learner, teacher |
| Layout | sparse illustrated, dense text, tables, multi-column, forms |
| Source quality | born-digital, scanned clean, noisy OCR, photographed |
| Risk | standard, health/safety-sensitive, culturally sensitive |

Results are macro-averaged by document and reported for every represented
stratum. The framework does not infer that Portuguese performance predicts
Albanian performance, or that storybook performance predicts medical content.

### Evidence tiers

- **Harness proof:** one document; no recommendation.
- **Pilot:** at least 15 documents, three per selected evaluation cell.
- **Publishable model comparison:** at least 30 documents overall, at least
  five native documents and two native reviewers per claimed language, three
  independent generations per model, and at least three documents in every
  reported language/domain/layout cell.
- **High-risk domain claim:** domain-expert rubrics, expert adjudication, and a
  separately held-out test set.

Maintain `development`, `validation`, and private `test` partitions. Prompts
may be improved against development data, selected on validation, and compared
once on test. Add real production failures continuously, but never tune against
the final reporting split.

## Measurement layers

### 1. Deterministic gates

- source PDF integrity and page/section coverage;
- text and numerical fact preservation;
- schema validity and pipeline error rate;
- HTML/JS runtime, interaction, navigation and broken-asset tests;
- WCAG/axe results plus keyboard and screen-reader manual checks;
- export completeness, offline operation and reproducibility;
- audio decode, expected-audio coverage, clipping and silence checks.

A failed gate remains visible and cannot be averaged away by good prose.

### 2. Atomic content rubrics

Experts author small positive and negative criteria tied to a page or artifact.
Rubrics cover image-caption grounding, essential coverage, accessible language,
pedagogy, quiz correctness, glossary accuracy, table interpretation, cultural
appropriateness, harmful omissions and domain-specific facts. Each judgment is
`met`, `not_met`, or `uncertain`, with evidence and confidence. Critical
negative criteria can hard-fail an ADT.

### 3. Multimodal LLM judges

The judge sees the original page image, the page-specific criterion and
anonymous candidate outputs. Default high-quality automation uses GPT-5.6 Sol;
production reporting should add a capable judge from another model family and,
where viable, an open local judge such as Prometheus 2.

Bias controls:

- candidate/model names are hidden;
- order is randomized and then reversed in a second pass;
- judges abstain when evidence is insufficient;
- first-position preference and repeated-decision consistency are reported;
- a candidate model cannot be its sole judge;
- style, verbosity and prompt-injection text are explicitly non-evidence;
- disagreements and low-confidence cases go to human adjudication.

Before its scores affect recommendations, each judge must be meta-evaluated on
at least 50 atomic decisions labelled by at least two human reviewers,
including failures and adversarial controls. Default acceptance is macro-F1 at
least 0.80, Cohen's kappa at least 0.60, and decision coverage at least 0.90.
Calibration is repeated by
language and high-risk domain; a judge validated in English is not assumed to
be valid in Portuguese.

### 4. Human evaluation

At least two trained, blinded native-language reviewers use anchored examples
of `met`, `not_met`, and `uncertain`. Domain experts review health, science and
other consequential material. Report inter-rater agreement and adjudicate
material disagreement. Pairwise preference complements rubric scoring; it does
not replace factual gates.

### 5. TTS evaluation

For every bundled utterance, measure file validity, duration, clipping,
excessive silence and expected-text coverage. Optional ASR round-trip evaluation
reports WER and CER; CER is the primary cross-language diagnostic. Human native
speakers rate naturalness, intelligibility, pronunciation, prosody and age/
context appropriateness using MOS and blinded A/B preference. Names, numbers,
abbreviations, code-switching and domain terminology receive dedicated tests.

## Statistics and ranking

- The independent unit is the source document, not pages or rubric items.
- Confidence intervals use document-clustered bootstrap resampling.
- Model differences use paired document bootstrap, probability of superiority,
  effect size and Holm-Bonferroni correction across comparisons.
- Pairwise votes use Bradley-Terry ranking; its bias audit is reported beside
  the ranking.
- Reliability reports worst document, worst reviewed generation, run failure
  rate and worst latency—not only the mean.
- Quality, latency, cost, memory/energy, download size and privacy are separate
  scorecards plus a Pareto frontier. A single weighted score is secondary.
- A per-stratum winner is published only when its minimum evidence threshold is
  met and the improvement is practically meaningful.

## Commands

```sh
# Generate repeated ADTs from all configured systems
pnpm eval:adt:matrix --matrix evals/matrices/momo-multi-model.example.json \
  --base-url http://127.0.0.1:3133/api --books-root ./books \
  --out-dir .local-evals/momo

# Produce an anonymous review set
pnpm eval:adt blind-pack --suite .local-evals/momo/suite.generated.json \
  --out .local-evals/momo/blind.json \
  --key-out .local-evals/momo/blind.private.json

# Multimodal atomic judge, including a position-swapped second pass
pnpm eval:adt:judge --pack .local-evals/momo/blind.json \
  --key .local-evals/momo/blind.private.json --model gpt-5.6-sol \
  --endpoint https://api.openai.com/v1/responses \
  --api-key-env OPENAI_API_KEY --passes 2 --reasoning-effort high \
  --out .local-evals/momo/judge-gpt56.json

# TTS signal checks; add --api-key-env OPENAI_API_KEY for ASR WER/CER
pnpm eval:adt:tts --export books/<book>/adt --language pt-BR \
  --out .local-evals/tts.json
```

## Research basis

- [OpenAI evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices): task-specific distributions, pairwise/classification grading, continuous evaluation and human calibration.
- [HealthBench](https://openai.com/index/healthbench/): expert-authored atomic rubrics, multilingual/domain strata, worst-of-N reliability and grader meta-evaluation.
- [HELM](https://crfm.stanford.edu/helm/): explicit scenario taxonomy, multiple metrics and disclosure of missing coverage.
- [G-Eval](https://arxiv.org/abs/2303.16634): structured criterion-based NLG evaluation and evidence of model-family bias.
- [Judging the Judges](https://arxiv.org/abs/2406.07791): position consistency, repetition stability and preference fairness.
- [PARIKSHA](https://aclanthology.org/2024.emnlp-main.451/): direct multilingual judging has weaker human agreement and self-bias; pairwise evaluation is generally safer.
- [Chatbot Arena](https://proceedings.mlr.press/v235/chiang24b.html): blinded human pairwise comparison and Bradley-Terry ranking.
- [Prometheus 2](https://arxiv.org/abs/2405.01535): open judge supporting custom direct and pairwise rubrics.
- [Multilingual CER analysis](https://arxiv.org/abs/2410.07400): CER is more consistent than WER across writing systems.
- [W3C media accessibility guidance](https://www.w3.org/WAI/media/av/planning/): transcripts and meaningful visual/audio alternatives remain required beyond model scores.

## Current status

The code implements the measurement contract, stratified scorecards,
document-clustered statistics, paired tests, multiplicity correction,
Bradley-Terry ranking, judge calibration metrics, position-bias audit,
multimodal two-pass judging and TTS signal/ASR evaluation. Corpus expansion,
native/expert annotations and a second independent judge family are evidence
collection work; until those exist, reports correctly remain provisional.
