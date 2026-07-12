import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { KIDS_BUDDY_IDS } from "@adt/types/kids"

/**
 * The Studio thumbnails are committed copies of the runtime's standing pose
 * (`<id>/<id>_1.png`) — the two apps can't import each other's assets (layer
 * rule), so this test is what keeps the copies from drifting. If it fails,
 * re-copy the runtime PNG over the studio one (or vice versa, if the art
 * intentionally changed).
 */
describe("kids buddy thumbnails", () => {
  const studioDir = __dirname
  const runtimeImagesDir = path.resolve(
    __dirname,
    "../../../../adt-runtime/src/features/kids/assets/images",
  )

  it.each([...KIDS_BUDDY_IDS])(
    "%s.png is byte-identical to the runtime standing pose",
    (id) => {
      const studio = fs.readFileSync(path.join(studioDir, `${id}.png`))
      const runtime = fs.readFileSync(
        path.join(runtimeImagesDir, id, `${id}_1.png`),
      )
      expect(studio.equals(runtime)).toBe(true)
    },
  )
})
