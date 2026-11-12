import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { COMMENT_STRINGS } from "./strings"

/**
 * The runtime's `t()` answers with the raw key when a catalog is missing it, so
 * a string that never reaches `en` ships as `comments-post-label` on the page.
 * `useCommentsText()` falls back to `COMMENT_STRINGS`, which makes that
 * impossible — this test is what keeps the two in step, and what fails when a
 * translated locale has been left behind after a copy change.
 */
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../..",
)

const CATALOG_DIR = path.join(REPO_ROOT, "assets/adt/interface_translations")

/** The locales the project actively maintains (the Studio's Lingui set). The
 *  long tail of shipped catalogs already trails `en` by dozens of keys and is
 *  filled in one pass before merge — see M7. */
const MAINTAINED_LOCALES = ["en", "es", "fr", "pt", "pt-br", "sq"]

function catalog(locale: string): Record<string, string> {
  const file = path.join(CATALOG_DIR, locale, "interface_translations.json")
  return JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, string>
}

describe("comment interface strings", () => {
  it.each(MAINTAINED_LOCALES)("%s carries every comment key", (locale) => {
    const entries = catalog(locale)
    const missing = Object.keys(COMMENT_STRINGS).filter((key) => !entries[key])
    expect(missing).toEqual([])
  })

  it("keeps every interpolation placeholder across locales", () => {
    for (const locale of MAINTAINED_LOCALES) {
      const entries = catalog(locale)
      for (const [key, source] of Object.entries(COMMENT_STRINGS)) {
        expect(placeholders(entries[key] ?? ""), `${locale}/${key}`).toEqual(
          placeholders(source),
        )
      }
    }
  })

  it("uses the runtime's kebab-case key convention", () => {
    for (const key of Object.keys(COMMENT_STRINGS)) {
      expect(key).toMatch(/^comments-[a-z0-9-]+$/)
    }
  })
})

function placeholders(value: string): string[] {
  return [...value.matchAll(/\$\{(.*?)\}/g)].map((match) => match[1]).sort()
}
