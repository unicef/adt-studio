import { expect, it, vi } from "vitest"
vi.mock("@lingui/core/macro", () => ({ msg: (parts: TemplateStringsArray, ...values: unknown[]) => ({ id: parts.reduce((text, part, i) => text + part + (values[i] ?? ""), "") }) }))
vi.mock("@lingui/core", () => ({ i18n: { _: (descriptor: { id: string }) => descriptor.id } }))
const { sectioningErrorMessage } = await import("./sectioning-error")

it.each(["SECTIONING_WINDOW_INVALID", "EXTRACTION_LEGACY", "EXTRACTION_INCOMPLETE", "EXTRACTION_SOURCE_CHANGED", "EXTRACTION_INPUTS_CHANGED", "EXTRACTION_ASSETS_INVALID", "EXTRACTION_INPUT_INVALID"])("maps %s consistently for HTTP codes and persisted/SSE diagnostics", code => {
  const diagnostic = `${code}: internal diagnostic; pnpm pipeline private-label private.pdf`
  const http = sectioningErrorMessage(diagnostic, code)
  expect(http).toBe(sectioningErrorMessage(diagnostic))
  expect(http).not.toContain(code)
  expect(http).not.toContain("pnpm")
  expect(http).not.toContain("private-label")
  expect(http).toBeTruthy()
})
it("retains unrecognized provider diagnostics", () => {
  expect(sectioningErrorMessage("Provider returned diagnostic ABC")).toBe("Provider returned diagnostic ABC")
})

it.each(["PIPELINE_PAGES_FAILED", "SECTIONING_INPUT_UNREADABLE"])("keeps bounded page IDs and full counts for %s in HTTP/SSE messages", code => {
  const message = `${code}: p2, p7; total=27; causes=INTERNAL_DETAIL`
  const translated = sectioningErrorMessage(message)
  expect(translated).toContain("27")
  expect(translated).toContain("p2, p7")
  expect(translated).not.toContain(code)
  expect(translated).not.toContain("INTERNAL_DETAIL")
  expect(sectioningErrorMessage(message, code)).toBe(translated)
})
