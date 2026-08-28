import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// `assets/adt/tailwind_css.css` is a build artifact, not a hand-edited file:
// apps/adt-runtime/build.config.mjs copies src/styles/globals.css over it
// (`fs.copyFileSync`) so the per-book reader stylesheet compiles from the same
// CSS the runtime SPA uses. Because the mirror is committed to the repo, editing
// globals.css without re-running the runtime build leaves a stale copy — and a
// stale copy silently breaks storyboard/reader parity: the storyboard renders
// off globals.css (via Vite) while the exported reader compiles off this mirror,
// so drift means the shared page-height / chrome-inset contract differs between
// the two surfaces. Guard that the committed mirror is byte-identical to its
// source.
const SOURCE = fileURLToPath(
  new URL("../../../../apps/adt-runtime/src/styles/globals.css", import.meta.url),
)
const MIRROR = fileURLToPath(
  new URL("../../../../assets/adt/tailwind_css.css", import.meta.url),
)

describe("tailwind_css.css mirror", () => {
  it("stays byte-identical to apps/adt-runtime/src/styles/globals.css", () => {
    const source = readFileSync(SOURCE, "utf-8")
    const mirror = readFileSync(MIRROR, "utf-8")
    expect(
      mirror,
      "assets/adt/tailwind_css.css is stale — regenerate with `pnpm --filter @adt/runtime build`",
    ).toBe(source)
  })
})
