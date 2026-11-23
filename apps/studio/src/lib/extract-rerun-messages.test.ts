import { expect, it, vi } from "vitest"
import { ExtractRerunBlockedReason, type ExtractRerunStatus } from "@adt/types"
vi.mock("@lingui/core/macro", () => ({ msg: (parts: TemplateStringsArray, ...values: unknown[]) => ({ id: parts.reduce((text, part, i) => text + part + (values[i] ?? ""), "") }) }))
vi.mock("@lingui/core", () => ({ i18n: { _: (descriptor: { id: string }) => descriptor.id } }))
const { extractRerunAction, extractRerunBlockedMessage } = await import("./extract-rerun-messages")

const generic = "Extract cannot run again on this book. To extract again, create a new book from the PDF."

it("RAC-24: explains every blocked reason without naming an identifier", () => {
  const messages = ExtractRerunBlockedReason.options.map(reason => [reason, extractRerunBlockedMessage(reason)] as const)
  for (const [reason, message] of messages) {
    expect(message, reason).toBeTruthy()
    expect(message, reason).not.toContain(reason)
  }
  const text = Object.fromEntries(messages)
  expect(text["downstream-output"]).toContain("Sectioning or later stages")
  expect(text["downstream-output"]).toContain("create a new book from the PDF")
  expect(text["part-book"]).toContain("part of a larger book")
  expect(text["split-coordinator"]).toContain("split into parts")
  expect(text["not-pdf-source"]).toContain("not created from a PDF")
  expect(text["run-active"]).toContain("current run to finish")
  // Only later work sends the user to a new book; a part or a running book must not.
  for (const reason of ["part-book", "split-coordinator", "not-pdf-source", "run-active"]) expect(text[reason]).not.toContain("new book")
})

it("RAC-24: falls back to the generic reason", () => {
  expect(extractRerunBlockedMessage("unrecognized-content")).toBe(generic)
  expect(extractRerunBlockedMessage("extraction-inconsistent")).toBe(generic)
  expect(extractRerunBlockedMessage(null)).toBe(generic)
  expect(extractRerunBlockedMessage(undefined)).toBe(generic)
  expect(extractRerunBlockedMessage("added-by-a-newer-server" as never)).toBe(generic)
})

it("RAC-24: picks the action a run performs from the ones offered", () => {
  const offers = (...actions: ExtractRerunStatus["actions"]): ExtractRerunStatus => ({ actions, attemptId: null, blockedReason: null })
  expect(extractRerunAction(offers("resume", "replace"))).toBe("replace")
  expect(extractRerunAction(offers("replace"))).toBe("replace")
  expect(extractRerunAction(offers("retry"))).toBe("retry")
  expect(extractRerunAction(offers("resume"))).toBe("resume")
  expect(extractRerunAction(offers())).toBeNull()
  expect(extractRerunAction(undefined)).toBeNull()
})
