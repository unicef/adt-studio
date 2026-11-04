import { expect, it } from "vitest"
import { processWithConcurrency } from "../concurrency.js"

it("stops admission after a failure and drains an in-flight writer before rejecting", async () => {
  let release!: () => void
  let drained = false
  const called: number[] = []
  const run = processWithConcurrency([1, 2, 3], 2, async (item) => {
    called.push(item)
    if (item === 1) throw new Error("generation failed")
    await new Promise<void>((resolve) => { release = resolve })
    drained = true
  })
  let settled = false
  const observed = run.catch((error) => { settled = true; expect(error.message).toBe("generation failed") })
  await Promise.resolve()
  expect(settled).toBe(false)
  release()
  await observed
  expect(drained).toBe(true)
  expect(called).toEqual([1, 2])
})
