/** Create a NEW disposable fixture; never write the supplied source books. */
import { createBookStorage } from "../../packages/storage/dist/index.js"
import { copyBooks } from "./spec-0012-packaged-common.mjs"
const [source, destination] = process.argv.slice(2)
if (!source || !destination) throw new Error("Supply source books and a NEW destination")
copyBooks(source, destination)
const storage = createBookStorage("momograde1", destination)
try {
  for (const step of ["image-meaningfulness", "image-captioning"]) storage.appendLlmLog({
    requestId: `spec0013-${step}`, timestamp: new Date().toISOString(), taskType: step, pageId: "pg005",
    promptName: "page-error-decision", modelId: "", durationMs: 0, attempt: 2,
    success: false, errorCount: 0, cacheHit: false, providerCall: false, pageRecovery: true,
    outcome: "skipped-with-error", errorClass: "rate-limit", messages: [],
  })
  storage.markStepStarted("image-meaningfulness")
} finally { storage.close() }
console.log("Created disposable recovery fixture", destination)
