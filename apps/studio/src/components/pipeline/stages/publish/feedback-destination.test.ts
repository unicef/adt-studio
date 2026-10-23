import { describe, expect, it } from "vitest"
import { feedbackDestination } from "./feedback-destination"

describe("feedbackDestination", () => {
  /** The reviewer's complaint, as an assertion: every row used to arrive at the same first page
   *  with nothing selected, whichever comment had been clicked. */
  it("carries the comment's own page, section and id", () => {
    expect(feedbackDestination("raven", "pg012_sec002", "c-42")).toEqual({
      to: "/books/$label/$step/$pageId",
      params: { label: "raven", step: "storyboard", pageId: "pg012" },
      search: { section: 1, comment: "c-42" },
    })
  })

  it("sends the first section to index zero, not one", () => {
    const destination = feedbackDestination("raven", "pg001_sec001", "c-1")
    expect(destination.search?.section).toBe(0)
    expect(destination.params.pageId).toBe("pg001")
  })

  /** Two comments on one page differ only by section, so a row that dropped it would land the
   *  author on the right page and the wrong half of it. */
  it("distinguishes two sections of the same page", () => {
    const first = feedbackDestination("raven", "pg007_sec001", "a")
    const second = feedbackDestination("raven", "pg007_sec003", "b")
    expect(first.params.pageId).toBe(second.params.pageId)
    expect(first.search?.section).toBe(0)
    expect(second.search?.section).toBe(2)
  })

  /** Still clickable: a dead row is worse than one that opens the stage. */
  it("falls back to the stage when the section id makes no sense", () => {
    expect(feedbackDestination("raven", "not-a-section-id", "c-9")).toEqual({
      to: "/books/$label/$step",
      params: { label: "raven", step: "storyboard" },
    })
  })
})
