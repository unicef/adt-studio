import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { buildPreviewTailwindCss } from "../tailwind.js"

const WEB_ASSETS_DIR = fileURLToPath(
  new URL("../../../../assets/adt/", import.meta.url),
)

describe("reader-aware viewport utilities", () => {
  it("generates the shared page-height contract for base and responsive variants", async () => {
    const css = await buildPreviewTailwindCss(
      `<div class="h-screen md:h-screen max-h-dvh"></div>`,
      WEB_ASSETS_DIR,
    )

    const baseRule = css.slice(css.lastIndexOf(".h-screen"), css.lastIndexOf(".h-screen") + 140)
    const responsiveRule = css.slice(
      css.lastIndexOf(".md\\:h-screen"),
      css.lastIndexOf(".md\\:h-screen") + 190,
    )
    const maxDynamicRule = css.slice(
      css.lastIndexOf(".max-h-dvh"),
      css.lastIndexOf(".max-h-dvh") + 150,
    )

    expect(baseRule).toContain("height: var(--adt-page-height-screen)")
    expect(responsiveRule).toContain("height: var(--adt-page-height-screen)")
    expect(maxDynamicRule).toContain("max-height: var(--adt-page-height-dvh)")
  })
})
