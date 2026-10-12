/** Exercise Phase B's persisted protocol in real packaged hosts without paid work. */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { hashes } from "./spec-0012-packaged-common.mjs"

export async function exercisePackagedValidation({ request, books, restart }) {
  const label = "momograde1", book = path.join(books, label)
  const fixture = JSON.parse(fs.readFileSync(path.join(book, "spec0009-acceptance.json"), "utf8"))
  const { acceptedRequest: original, taskId } = fixture
  const before = hashes(book), page = await request(`/books/${label}/pages/pg005`)
  const receipt = await request(`/books/${label}/tasks/requests/${original.requestId}`)
  assert.equal(receipt.task.taskId, taskId); assert.equal(receipt.task.status, "completed")
  const availability = await request(`/books/${label}/pages/pg005/render-tasks/availability?target=${encodeURIComponent(JSON.stringify(original))}`)
  assert.equal(availability.available, false); assert.equal(availability.reason, "historical")
  // A published accepted request remains idempotent after export/import/restart,
  // even though its source version is now old and no credentials are supplied.
  const duplicate = await request(`/books/${label}/pages/pg005/render-tasks`, "POST", original)
  assert.equal(duplicate.taskId, taskId)
  assert.deepEqual(await request(`/books/${label}/pages/pg005`), page)
  assert.deepEqual(hashes(book), before)
  await restart()
  assert.equal((await request(`/books/${label}/tasks/requests/${original.requestId}`)).task.status, "completed")
  assert.equal((await request(`/books/${label}/pages/pg005/render-tasks`, "POST", original)).taskId, taskId)
  assert.deepEqual(await request(`/books/${label}/pages/pg005`), page)
  assert.deepEqual(hashes(book), before)
  return { checks: ["durable completed task survives packaged restart", "duplicate request without credentials returns the same completed task", "old human finding remains historical after new artifact", "all database/cache/package/media bytes unchanged by reads and duplicate requests"], taskId, files: Object.keys(before).length }
}
