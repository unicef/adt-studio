import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
// SPEC-0010: admission must never grow a destructive extraction reset again.
const entryPoints = [
  "packages/pipeline/src/pdf-extraction.ts",
  "packages/pipeline/src/pipeline-dag.ts",
  "apps/api/src/routes/stages.ts",
  "apps/api/src/services/stage-runner.ts",
]
const violations = entryPoints.filter((file) => /\.clearExtractedData\s*\(/.test(fs.readFileSync(path.join(root, file), "utf8")))
if (violations.length) {
  console.error(`Extraction admission must not clear existing book content: ${violations.join(", ")}`)
  process.exitCode = 1
} else {
  console.log("SPEC-0010 extraction reset invariant passed. Other planned invariants remain listed in docs/INVARIANTS.md.")
}
