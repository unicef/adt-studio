import { describe, expect, it } from "vitest"
import { aiEditNoticeFor } from "./ai-edit-outcome"

describe("aiEditNoticeFor", () => {
  it("returns an unsupported notice with the model's reason", () => {
    expect(
      aiEditNoticeFor({ status: "unsupported", reason: " Use the image tools. ", reasoning: "x", sectionIndex: 0 }),
    ).toEqual({ kind: "unsupported", reason: "Use the image tools." })
  })

  it("returns an unverified notice when verification failed", () => {
    expect(
      aiEditNoticeFor({
        status: "applied",
        html: "<section></section>",
        reasoning: "x",
        verification: { applied: false, reason: "Nothing changed." },
      }),
    ).toEqual({ kind: "unverified", reason: "Nothing changed." })
  })

  it("returns nothing for verified, unverifiable, or unknown results", () => {
    expect(
      aiEditNoticeFor({ status: "applied", html: "", reasoning: "", verification: { applied: true, reason: "" } }),
    ).toBeUndefined()
    expect(aiEditNoticeFor({ status: "applied", html: "", reasoning: "" })).toBeUndefined()
    expect(aiEditNoticeFor({ html: "", reasoning: "" })).toBeUndefined()
    expect(aiEditNoticeFor(undefined)).toBeUndefined()
  })
})
