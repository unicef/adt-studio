import { strToU8, unzipSync, zipSync } from "fflate"
import { describe, expect, it } from "vitest"

import { previewAdtRecoveryImport } from "../preview.js"
import { restoreKitName } from "../repair-guide.js"
import { makeCurrentBundleWithExternallyAddedPage } from "./fixtures.js"

// What an author added on top of an export (a script, a credits page) is
// deliberate work. A repair that removes it must let the author put it back.
describe("restoreKitName", () => {
  it("names the kit after the book, the same in every repair round", () => {
    expect(restoreKitName("cuaderno-fixed.zip")).toBe("cuaderno-restore-kit")
    expect(restoreKitName("cuaderno-fixed-2.zip")).toBe("cuaderno-restore-kit")
  })
})

function bundleWithACustomScript(): Buffer {
  const files = unzipSync(makeCurrentBundleWithExternallyAddedPage())
  const html = new TextDecoder().decode(files["index.html"])
  files["index.html"] = strToU8(html.replace("</body>", '<script src="./assets/extras.js"></script></body>'))
  files["assets/extras.js"] = strToU8("console.log('extras')")
  return Buffer.from(zipSync(files))
}

describe("repair request", () => {
  const { agentGuide } = previewAdtRecoveryImport(bundleWithACustomScript(), undefined, "cuaderno.zip")
  const request = agentGuide.repairPrompt

  it("asks to save what it removes in a restore kit outside the bundle and the ZIP", () => {
    expect(request).toContain("cuaderno-restore-kit")
    expect(request).toMatch(/restore kit[^\n]*outside the bundle folder and outside the new ZIP/)
  })

  it("asks to locate each removal by an anchor, since export regenerates the pages", () => {
    expect(request).toMatch(/not by line number/)
    expect(request).toMatch(/Running it twice must not add anything twice/)
  })

  it("keeps real repairs out of the kit", () => {
    expect(request).toMatch(/Renamed data-ids and media moved into images\/ are repairs/)
  })

  it("points the remove fixes at the kit", () => {
    expect(request).toMatch(/fix: Save the script in the restore kit, then remove it/)
  })
})

describe("repair request for a page outside the reading order", () => {
  const files = unzipSync(makeCurrentBundleWithExternallyAddedPage())
  files["creditos.html"] = strToU8("<!doctype html><html><body><p>Créditos</p></body></html>")
  files["notes.txt"] = strToU8("scratch")
  const request = previewAdtRecoveryImport(Buffer.from(zipSync(files)), undefined, "cuaderno.zip").agentGuide.repairPrompt

  it("saves the page in the restore kit instead of deleting it, and asks when unsure", () => {
    expect(request).toMatch(/kind: unlisted-root-page\n[^\n]*\n   fix: [^\n]*save it in the restore kit, then remove it/)
    expect(request).toMatch(/fix: [^\n]*If you can't tell whether the delivered book needs the page, ask the user/)
  })

  it("points a stray file at the kit too", () => {
    expect(request).toMatch(/fix: Move its files into the matching canonical folder, or save the folder or file in the restore kit/)
  })
})
