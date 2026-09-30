import { describe, expect, it } from "vitest"
import type { BookOutlineAppliedHeading, BookOutlineEntry } from "@adt/types"
import { outlineAssignmentState } from "./BookOutlineAudit"

const entry: BookOutlineEntry = {
  outlineId: "outline-001",
  title: "Chapter One",
  level: 1,
  kind: "chapter",
  pageId: "pg001",
  pageNumber: 1,
  sourceCandidateIds: ["pg001_hc001"],
  parentId: null,
  styleClusterId: "chapter-style",
  confidence: 0.97,
}

function assignment(overrides: Partial<BookOutlineAppliedHeading> = {}): BookOutlineAppliedHeading {
  return {
    outlineEntryId: "outline-001",
    pageId: "pg001",
    nodeId: "pg001_n001",
    role: "chapter_title",
    text: "Chapter One",
    headingLevel: 1,
    headingStyleClusterId: "chapter-style",
    ...overrides,
  }
}

describe("outlineAssignmentState", () => {
  it("identifies assigned, missing, and mismatched headings", () => {
    expect(outlineAssignmentState(entry, [assignment()])).toBe("assigned")
    expect(outlineAssignmentState(entry, [])).toBe("missing")
    expect(outlineAssignmentState(entry, [assignment({ headingLevel: 2 })])).toBe("mismatch")
    expect(outlineAssignmentState(entry, [assignment({ text: "Rewritten" })])).toBe("mismatch")
  })

  it("accepts a title split across adjacent assigned leaves", () => {
    expect(outlineAssignmentState(entry, [
      assignment({ nodeId: "pg001_n001", text: "Chapter" }),
      assignment({ nodeId: "pg001_n002", text: "One" }),
    ])).toBe("assigned")
  })
})
