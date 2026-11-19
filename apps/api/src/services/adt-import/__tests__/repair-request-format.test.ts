import { strToU8, unzipSync, zipSync } from "fflate"
import { describe, expect, it } from "vitest"

import { previewAdtRecoveryImport } from "../preview.js"
import { compactFileList } from "../repair-guide.js"
import { makeCurrentBundleWithExternallyAddedPage } from "./fixtures.js"

// The repair request is pasted into an AI assistant, so its length matters.
describe("compactFileList", () => {
  it("shortens consecutive sections of a page and sorts the list", () => {
    expect(compactFileList([
      "pg009_sec003.html", "pg009_sec001.html", "pg009_sec002.html", "pg009_sec004.html",
      "pg011_sec001.html", "creditos.html", "pg012_sec001.html", "pg012_sec003.html",
    ])).toBe("creditos.html, pg009_sec{001-004}.html, pg011_sec001.html, pg012_sec001.html, pg012_sec003.html")
  })

  it("keeps names it does not recognize as they are", () => {
    expect(compactFileList(["notes/", "index.html"])).toBe("index.html, notes/")
  })
})

function bundleWithTheSameScriptOnEveryPage(): Buffer {
  const files = unzipSync(makeCurrentBundleWithExternallyAddedPage())
  for (const name of ["index.html", "pg002_sec001.html"]) {
    const html = new TextDecoder().decode(files[name])
    files[name] = strToU8(html.replace("</body>", '<script src="./assets/extras.js"></script></body>'))
  }
  return Buffer.from(zipSync(files))
}

describe("repair request", () => {
  it("says a finding every problem of a kind shares once, then lists the files", () => {
    const { compatibility, agentGuide } = previewAdtRecoveryImport(bundleWithTheSameScriptOnEveryPage())
    expect(compatibility.issueCounts?.["unsupported-script"]).toBe(2)
    expect(agentGuide.repairPrompt).toContain("   found 2 times, each time: ./assets/extras.js\n   in: index.html, pg002_sec001.html")
    expect(agentGuide.repairPrompt).not.toContain("index.html: ./assets/extras.js")
    expect(agentGuide.repairPrompt).toContain("pg009_sec{001-004}.html stands for")
  })
})
