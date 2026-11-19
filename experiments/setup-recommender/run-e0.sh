#!/usr/bin/env bash
# E0: Victor's adt-poc-llm poc-v1, unchanged, N runs per PDF.
#   run-e0.sh <poc-repo checked out at fd36742, npm ci done> <out-dir> [runs=3]
# Needs OPENAI_API_KEY in the environment. Then: tsx import-e0.ts <out-dir> <harness-out-dir>
set -u
POC="$1"; OUT="$(realpath -m "$2")"; RUNS="${3:-3}"
mkdir -p "$OUT"; cd "$POC"; export OPENAI_MODEL=gpt-5.4-mini
for run in $(seq 1 "$RUNS"); do
  for pdf in pdfs/*.pdf; do
    b=$(basename "$pdf" .pdf)
    if npx tsx src/recommend-openai.ts "$pdf" --variant poc-v1 --user-language en > "$OUT/$b.run$run.log" 2>&1; then
      cp "$(ls -t output/*.json | head -1)" "$OUT/$b.run$run.json"; echo "ok $b run$run"
    else echo "FAIL $b run$run"; fi
  done
done
