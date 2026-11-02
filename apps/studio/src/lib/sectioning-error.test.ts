import { expect, it, vi } from "vitest"
vi.mock("@lingui/core/macro", () => ({ msg: (parts: TemplateStringsArray, ...values: unknown[]) => ({ id: parts.reduce((text, part, i) => text + part + (values[i] ?? ""), "") }) }))
vi.mock("@lingui/core", () => ({ i18n: { _: (descriptor: { id: string }) => descriptor.id } }))
const { sectioningErrorMessage } = await import("./sectioning-error")

it.each(["EXTRACTION_LEGACY", "EXTRACTION_INCOMPLETE", "EXTRACTION_SOURCE_CHANGED", "EXTRACTION_INPUTS_CHANGED", "EXTRACTION_ASSETS_INVALID", "EXTRACTION_INPUT_INVALID"])("maps %s consistently for HTTP codes and persisted/SSE diagnostics", code => {
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
