import { expect, it, vi } from "vitest"
vi.mock("@lingui/core/macro", () => ({ msg: (parts: TemplateStringsArray, ...values: unknown[]) => ({ id: parts.reduce((text, part, i) => text + part + (values[i] ?? ""), "") }) }))
vi.mock("@lingui/core", () => ({ i18n: { _: (descriptor: { id: string }) => descriptor.id } }))
const { sectioningErrorMessage, needsHistoryRecovery } = await import("./sectioning-error")

it.each(["HISTORY_RECOVERY_BOOK_MISSING", "HISTORY_RECOVERY_AUDIT_MISSING", "HISTORY_RECOVERY_STALE", "HISTORY_RECOVERY_UNVERIFIED", "HISTORY_RECOVERY_REQUEST_CONFLICT", "HISTORY_RECOVERY_NOT_NEEDED", "HISTORY_RECOVERY_REQUEST_INVALID", "HISTORY_REPAIR_REQUIRED", "PACKAGE_RECOVERY_UNSAFE", "BOOK_CONFIG_INVALID", "STORYBOARD_REQUEST_INVALID", "SECTIONING_WINDOW_INVALID", "EXTRACTION_LEGACY", "EXTRACTION_INCOMPLETE", "EXTRACTION_SOURCE_CHANGED", "EXTRACTION_INPUTS_CHANGED", "EXTRACTION_ASSETS_INVALID", "EXTRACTION_INPUT_INVALID"])("maps %s consistently for HTTP codes and persisted/SSE diagnostics", code => {
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

it("distinguishes lost tracking evidence from a recoverable damaged history row", () => {
  const error = "HISTORY_REPAIR_REQUIRED: history-evidence/book@0"
  const message = sectioningErrorMessage(error)
  expect(message).toBe(sectioningErrorMessage(error, "HISTORY_REPAIR_REQUIRED"))
  expect(message).toContain("verified book backup")
  expect(message).toContain("cannot reconstruct")
  expect(message).not.toContain("history-evidence")
  expect(sectioningErrorMessage("HISTORY_REPAIR_REQUIRED: page-sectioning/p2@1")).not.toBe(message)
})

it.each(["PIPELINE_PAGES_FAILED", "SECTIONING_INPUT_UNREADABLE", "STORYBOARD_PAGE_OUTSIDE_WINDOW"])("keeps bounded page IDs and full counts for %s in HTTP/SSE messages", code => {
  const message = `${code}: p2, p7; total=27; causes=INTERNAL_DETAIL`
  const translated = sectioningErrorMessage(message)
  expect(translated).toContain("27")
  expect(translated).toContain("p2, p7")
  expect(translated).not.toContain(code)
  expect(translated).not.toContain("INTERNAL_DETAIL")
  expect(sectioningErrorMessage(message, code)).toBe(translated)
})

it("links only recoverable history damage to History recovery", () => {
  const raw = "HISTORY_REPAIR_REQUIRED: page-sectioning/pg001@3"
  // Raw server text, an HTTP code, and the already-translated message all qualify.
  expect(needsHistoryRecovery(raw)).toBe(true)
  expect(needsHistoryRecovery("Request failed", "HISTORY_REPAIR_REQUIRED")).toBe(true)
  expect(needsHistoryRecovery(sectioningErrorMessage(raw))).toBe(true)
  // Lost tracking evidence needs a backup, not recovery.
  const lost = "HISTORY_REPAIR_REQUIRED: history-evidence/book@0"
  expect(needsHistoryRecovery(lost)).toBe(false)
  expect(needsHistoryRecovery(sectioningErrorMessage(lost), "HISTORY_REPAIR_REQUIRED")).toBe(false)
  expect(needsHistoryRecovery(sectioningErrorMessage("VERSION_CONFLICT: x"), "VERSION_CONFLICT")).toBe(false)
  expect(needsHistoryRecovery(null)).toBe(false)
})
