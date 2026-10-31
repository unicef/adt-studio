import { assertOutputPublication, outputIdentityKey, outputSkipped, selectedForGeneration } from "@adt/pipeline"
import type { OutputIdentity, OutputRunScope, OutputStatus } from "@adt/types"

/** One review runs under the book writer lease. Validate all consent before
 * doing work; only our own completed publications may advance input guards.
 * Target content/protection must remain exactly as reviewed until replaced. */
export function outputRunReview(scope: OutputRunScope | undefined, read: () => OutputStatus[]) {
  if (!scope?.replace?.length) return undefined
  const readPending = () => {
    const keys = new Set(scope.replace?.map(item => outputIdentityKey(item.identity)))
    return new Map(read().filter(output => keys.has(outputIdentityKey(output.identity)))
      .map(output => [outputIdentityKey(output.identity), output]))
  }
  let previous = readPending()
  scope.replace = scope.replace.filter(replacement => {
    const output = previous.get(outputIdentityKey(replacement.identity))
    if (!output) throw new Error("Output changed since review. Refresh before replacing it.")
    return selectedForGeneration(output, undefined, scope)
  })
  return (identities: OutputIdentity[], publish: () => void) => {
    scope.replace = scope.replace?.filter(item => !outputSkipped(scope, item.identity))
    if (!scope.replace?.length) { publish(); return }
    // Check before the synchronous write, not after an asynchronous stage:
    // settings/source edits during generation must never become new consent.
    assertOutputPublication([...previous.values()], [...readPending().values()], scope.replace.map(item => item.identity))
    publish()
    const published = new Set(identities.map(outputIdentityKey))
    scope.replace = scope.replace.filter(item => !published.has(outputIdentityKey(item.identity)))
    if (!scope.replace.length) return
    const current = readPending()
    scope.replace = scope.replace.map(replacement => {
      const key = outputIdentityKey(replacement.identity)
      const before = previous.get(key)
      const after = current.get(key)
      if (!before || !after || before.contentHash !== after.contentHash ||
        before.protected !== after.protected || before.manual !== after.manual || before.excluded !== after.excluded) {
        throw new Error("Output changed since review. Refresh before replacing it.")
      }
      return { ...replacement, signature: after.signature }
    })
    previous = current
  }
}
