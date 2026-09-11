import { describe, expect, it } from "vitest"
import { parseQuizRouteId } from "./quiz-route"

describe("quiz storyboard routes", () => {
  it.each([
    ["quiz-qz003", "qz003"], ["quiz-0", "qz001"], ["quiz-4", "qz005"],
    ["quiz-998", "qz999"], ["quiz-999", null], ["quiz-qz000", null],
    ["quiz-", null], ["quiz-../other", null], ["pg001", null],
  ])("resolves %s", (route, expected) => expect(parseQuizRouteId(route)).toBe(expected))
})
