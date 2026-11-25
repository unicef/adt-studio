/**
 * Measures one PDF without AI (profile + measured facts) and prints the numbers the engine
 * works from, page by page, for the /dev/auto-mode walkthrough. No text and no images are kept.
 *   tsx measure-one.ts <file.pdf>
 */
import { readFileSync } from "node:fs"
import { profileBook } from "../../packages/pdf/dist/index.js"
import { measureFacts, samplePlan } from "../../packages/pipeline/dist/setup-recommender/index.js"

const buffer = new Uint8Array(readFileSync(process.argv[2]!))
const t0 = performance.now()
const profile = profileBook(buffer)
const profileMs = performance.now() - t0
const measured = measureFacts(profile)
const pages = profile.pages.map((p) => ({
  page: p.page,
  w: Math.round(p.width),
  h: Math.round(p.height),
  chars: p.visibleChars,
  invisible: p.invisibleChars,
  images: p.images.length,
  imageCoverage: +p.imageCoverage.toFixed(2),
  textOverImage: p.textOverImageChars,
  paths: p.pathCount,
}))
console.log(JSON.stringify({ profileMs: Math.round(profileMs), plan: samplePlan(profile.pages.length), measured, pages }, null, 1))
