import { describe, expect, it } from "vitest"
import type { PageSummaryItem } from "@/api/client"
import { currentSectionLocations } from "../storyboard/components/feedback/current-section-locations"
import { feedbackDestination } from "./feedback-destination"

const pages = (ids: string[]) => [{ pageId: "pg001", pageNumber: 1, sections: ids.map((sectionId, sectionIndex) => ({ sectionId, sectionIndex })) }] as PageSummaryItem[]
describe("feedback identity", () => {
  it("carries the stable owner through the link after reorder, insertion and removal", () => {
    for (const ids of [["pg001_sec002", "pg001_sec001"], ["pg001_sec003", "pg001_sec002", "pg001_sec001"], ["pg001_sec001"]]) {
      const location = currentSectionLocations(pages(ids)).get("pg001_sec001")!
      expect(location.sectionIndex).toBe(ids.indexOf("pg001_sec001"))
      expect(feedbackDestination("raven", "pg001_sec001", "c-42", location.pageId)).toEqual({
        to: "/books/$label/$step/$pageId", params: { label: "raven", step: "storyboard", pageId: "pg001" },
        search: { sectionId: "pg001_sec001", comment: "c-42" },
      })
    }
  })
  it("has no destination for retired, blank or ambiguous identities and reconnects restored IDs", () => {
    expect(currentSectionLocations(pages(["pg001_sec003"])).has("pg001_sec001")).toBe(false)
    expect(feedbackDestination("raven", "pg001_sec001", "c", null)).toBeNull()
    expect(currentSectionLocations(pages(["", " ", "pg001_sec001", "pg001_sec001"])).size).toBe(0)
    expect(currentSectionLocations(pages(["pg001_sec003", "pg001_sec001"])).get("pg001_sec001")?.sectionIndex).toBe(1)
    const conflicting = [...pages(["pg001_sec001"]), { ...pages(["pg001_sec001"])[0], pageId: "pg002" }]
    expect(currentSectionLocations(conflicting).has("pg001_sec001")).toBe(false)
  })
})
