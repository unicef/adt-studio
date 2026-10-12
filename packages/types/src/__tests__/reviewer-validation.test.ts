import { describe, expect, it } from "vitest"
import {
  ReviewerPageValidationRecord,
  ReviewerValidationCatalogSnapshot,
  ReviewerValidationSession,
  ValidationFixStage,
} from "../reviewer-validation.js"

describe("reviewer validation schemas", () => {
  it("supports future per-reviewer and per-language page records", () => {
    const session = ReviewerValidationSession.parse({
      session_id: "session-1",
      reviewer_name: "Jane Reviewer",
      language: "sw",
      start_page: 1,
      end_page: 10,
    })

    const record = ReviewerPageValidationRecord.parse({
      session_id: session.session_id,
      page_id: "page-1",
      section_id: "page-1_sec001",
      page_number: 1,
      href: "content/pages/page-1.html",
      language: "sw",
      results: [
        {
          criterion_id: "text-matches-original-reading-order",
          status: "needs-changes",
          comment: "The heading order differs from the source PDF.",
        },
      ],
    })

    expect(record.language).toBe("sw")
    expect(record.section_id).toBe("page-1_sec001")
    expect(record.results[0]?.status).toBe("needs-changes")
  })

  it("rejects invalid reviewer page ranges", () => {
    const result = ReviewerValidationSession.safeParse({
      session_id: "session-1",
      reviewer_name: "Jane Reviewer",
      start_page: 12,
      end_page: 3,
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(["end_page"])
  })

  it("supports catalog snapshots on reviewer sessions", () => {
    const snapshot = ReviewerValidationCatalogSnapshot.parse({
      identificationFields: [
        {
          id: "reviewer-name",
          label: "Reviewer name",
          type: "text",
          required: true,
        },
      ],
      instructions: [
        {
          id: "workflow",
          title: "Workflow",
          body: "Review pages in order.",
        },
      ],
      pageSections: [
        {
          id: "custom-checks",
          label: "Custom checks",
          fix_stage: "sectioning",
          criteria: [
            {
              id: "custom-criterion",
              label: "Custom criterion",
              guidance: "Check this custom requirement.",
              fix_stage: "storyboard",
            },
          ],
        },
      ],
    })

    const session = ReviewerValidationSession.parse({
      session_id: "session-1",
      reviewer_name: "Jane Reviewer",
      catalog_snapshot: snapshot,
    })

    expect(session.catalog_snapshot?.pageSections).toHaveLength(1)
    expect(session.catalog_snapshot?.pageSections[0]?.id).toBe("custom-checks")
    expect(session.catalog_snapshot?.pageSections[0]?.fix_stage).toBe("sectioning")
    expect(session.catalog_snapshot?.pageSections[0]?.criteria[0]?.fix_stage).toBe("storyboard")
  })

  it("limits fix routing to editable destination stages", () => {
    expect(ValidationFixStage.safeParse("storyboard").success).toBe(true)
    expect(ValidationFixStage.safeParse("validation").success).toBe(false)
  })
})
