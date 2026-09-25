import { describe, expect, it } from "vitest"
import { preflightSectioning, SectioningPreflightError } from "../sectioning-preflight.js"

const section = {
  sectionId: "pg007_sec004", sectionType: "text", backgroundColor: "white",
  textColor: "black", pageNumber: 7, isPruned: false, nodes: [],
}
const output = (count: number) => ({ reasoning: "saved", sections: Array.from({ length: count }, () => ({ ...section })) })

describe("persisted Sectioning preflight (SPEC-0003)", () => {
  it("collects missing, empty and multiple failures across non-contiguous source pages", () => {
    const pages = [2, 7, 11, 19].map((pageNumber) => ({ pageId: `pg${pageNumber}`, pageNumber }))
    const values = new Map([["pg7", output(0)], ["pg11", output(2)], ["pg19", output(1)]])
    const before = JSON.stringify([...values])
    expect(preflightSectioning("page", pages, values)).toEqual({
      total: 3,
      failures: [
        { pageId: "pg2", pageNumber: 2, reason: "missing" },
        { pageId: "pg7", pageNumber: 7, reason: "empty" },
        { pageId: "pg11", pageNumber: 11, reason: "multiple" },
      ],
      displayedPages: expect.any(Array),
    })
    expect(JSON.stringify([...values])).toBe(before)
  })

  it.each([null, undefined, "unreadable", {}, { sections: [{}] }, { reasoning: "saved", sections: null }])(
    "rejects malformed latest values without falling back to historical versions: %j", (value) => {
      expect(preflightSectioning("page", [{ pageId: "p", pageNumber: 3 }], new Map([["p", value]])).failures)
        .toEqual([{ pageId: "p", pageNumber: 3, reason: "invalid-data" }])
    },
  )

  it("accepts one valid section, including a pruned section, without changing its identity", () => {
    const value = { ...output(1), sections: [{ ...section, isPruned: true }] }
    expect(preflightSectioning("page", [{ pageId: "p", pageNumber: 7 }], new Map([["p", value]])).total).toBe(0)
    expect(value.sections[0].sectionId).toBe("pg007_sec004")
  })

  it("does not infer missing pages outside the caller's active source set", () => {
    expect(preflightSectioning("page", [{ pageId: "pg7", pageNumber: 7 }], new Map([["pg7", output(1)]])).total).toBe(0)
  })

  it("preserves Dynamic mode behavior even for multi-section historical data", () => {
    expect(preflightSectioning("dynamic", [{ pageId: "p", pageNumber: 7 }], new Map([["p", output(2)]])).total).toBe(0)
  })

  it("keeps full structured details while bounding the displayed identities to twenty", () => {
    const pages = Array.from({ length: 30 }, (_, n) => ({ pageId: `page-${n + 1}`, pageNumber: n + 1 }))
    const result = preflightSectioning("page", pages, new Map())
    expect(result.total).toBe(30)
    expect(result.failures).toHaveLength(30)
    expect(result.displayedPages).toHaveLength(20)
    const error = new SectioningPreflightError(result)
    expect(error.message).toContain("30 page(s)")
    expect(error.message).not.toContain("page-21")
    expect(error.message).toContain("Re-run Sectioning")
  })
})
