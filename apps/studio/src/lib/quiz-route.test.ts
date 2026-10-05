import { describe, expect, it } from "vitest"
import { parseQuizRouteId } from "./quiz-route"

describe("quiz storyboard routes", () => {
  it.each([
    ["quiz-qz003", "qz003"], ["quiz-0", "qz001"], ["quiz-4", "qz005"],
    ["quiz-998", "qz999"], ["quiz-qz1000", "qz1000"], ["quiz-qz1001", "qz1001"],
    ["quiz-qz9007199254740991", "qz9007199254740991"],
    ["quiz-9007199254740990", "qz9007199254740991"], ["quiz-9007199254740991", null],
    ["quiz-qz0001", null], ["quiz-qz9007199254740992", null], ["quiz-qz1000\n", null],
    ["quiz-1000\n", null], ["quiz-1e3", null], ["quiz-999", "qz1000"], ["quiz-qz000", null],
    ["quiz-", null], ["quiz-../other", null], ["pg001", null],
  ])("resolves %s", (route, expected) => expect(parseQuizRouteId(route)).toBe(expected))
})
