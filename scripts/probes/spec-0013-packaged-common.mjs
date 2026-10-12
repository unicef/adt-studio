/** Read-only recovery acceptance for disposable representative-book copies. */
import assert from "node:assert/strict"
import { hashes } from "./spec-0012-packaged-common.mjs"

export async function exercisePackagedRecovery({ request, books, restart }) {
  const assets = () => hashes(books, (file) => /^[^/]+\/(images|audio|fonts|videos)\//.test(file))
  const beforeAssets = assets()
  const before = await request("/books/momograde1/pages/pg005")
  const check = async () => {
    const { outputs } = await request("/books/momograde1/outputs")
    const extraction = outputs.find((output) => output.identity.kind === "extract-generation")
    assert.equal(extraction.current, false)
    assert.ok(extraction.pageErrors.some((error) => error.pageId === "pg005" && error.outcome === "skipped-with-error"))
    const captions = outputs.filter((output) => output.identity.kind === "caption" && output.pageIds.includes("pg005"))
    assert.ok(captions.length > 0, "Representative fixture must contain page005 captions")
    assert.ok(captions.every((output) => !output.current && output.pageErrors.some((error) => error.step === "image-captioning")))
    const state = await request("/books/momograde1/step-status")
    assert.equal(state.runStatus, "idle")
    assert.deepEqual(state.pendingDecisions, [])
    assert.equal(state.steps["image-meaningfulness"], "error")
    assert.match(JSON.stringify(state.stepErrors), /interrupt/i)
    return { pages: (await request("/books/momograde1/pages")).length, captionOutputs: captions.length }
  }
  const initial = await check()
  await restart()
  assert.deepEqual(await check(), initial)
  assert.deepEqual(await request("/books/momograde1/pages/pg005"), before)
  assert.deepEqual(assets(), beforeAssets)
  return { ...initial, durableSkip: true, captionWarning: true, interrupted: true, restartWithoutWork: true, unchangedPageDataAndVersions: true, unchangedAssetCount: Object.keys(beforeAssets).length }
}
