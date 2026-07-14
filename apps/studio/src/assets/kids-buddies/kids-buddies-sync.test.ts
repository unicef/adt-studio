import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { KIDS_BUDDY_IDS } from "@adt/types/kids"

/**
 * The Studio expression sets are committed copies of the runtime's buddy
 * images (`<id>/<id>_<n>.png`, 1..7) — the two apps can't import each
 * other's assets (layer rule), so this test is what keeps the copies from
 * drifting. If it fails, re-copy the runtime PNG over the studio one (or
 * vice versa, if the art intentionally changed).
 */
describe("kids buddy expression images", () => {
  const studioDir = __dirname
  const runtimeImagesDir = path.resolve(
    __dirname,
    "../../../../adt-runtime/src/features/kids/assets/images",
  )
  const expressionNumbers = [1, 2, 3, 4, 5, 6, 7] as const

  const cases = KIDS_BUDDY_IDS.flatMap((id) =>
    expressionNumbers.map((n) => ({ id, n, fileName: `${id}_${n}.png` })),
  )

  it.each(cases)(
    "$fileName is byte-identical to the runtime counterpart",
    ({ id, fileName }) => {
      const studio = fs.readFileSync(path.join(studioDir, id, fileName))
      const runtime = fs.readFileSync(
        path.join(runtimeImagesDir, id, fileName),
      )
      expect(studio.equals(runtime)).toBe(true)
    },
  )
})
