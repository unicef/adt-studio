import { describe, expect, it } from "vitest"
import {
  parseSentenceParts,
  markerCount,
  resolveText,
  resolveSentenceText,
  isBlankCorrect,
  isMcStepCorrect,
  isUnderlineStepCorrect,
  blankWidthCh,
  parseStepperPayload,
  standaloneBlanks,
  contrastOnWhite,
  readableOnWhite,
  clampStageHeight,
} from "./stepper-logic"
import type { FitbStep, McStep, UnderlineStep } from "@adt/types"

describe("parseSentenceParts", () => {
  it("splits text around blank markers", () => {
    expect(parseSentenceParts("This is a [[blank:item-1]].")).toEqual([
      { type: "text", text: "This is a " },
      { type: "blank", itemId: "item-1", hint: undefined },
      { type: "text", text: "." },
    ])
  })

  it("handles hints and multiple markers", () => {
    const parts = parseSentenceParts("m[[blank:item-2]]y[[blank:item-3:o]]")
    expect(parts).toEqual([
      { type: "text", text: "m" },
      { type: "blank", itemId: "item-2", hint: undefined },
      { type: "text", text: "y" },
      { type: "blank", itemId: "item-3", hint: "o" },
    ])
  })

  it("returns plain text untouched", () => {
    expect(parseSentenceParts("no blanks here")).toEqual([
      { type: "text", text: "no blanks here" },
    ])
  })
})

describe("resolveSentenceText", () => {
  const sentence = { text: "The sun is a [[blank:item-1]].", dataId: "text-1" }

  it("prefers a translation that keeps the marker", () => {
    const dict = { "text-1": "El sol es una [[blank:item-1]]." }
    expect(resolveSentenceText(sentence, dict)).toBe("El sol es una [[blank:item-1]].")
  })

  it("falls back when the translation lost the marker", () => {
    const dict = { "text-1": "El sol es una estrella." }
    expect(resolveSentenceText(sentence, dict)).toBe(sentence.text)
  })

  it("falls back when there is no translation", () => {
    expect(resolveSentenceText(sentence, {})).toBe(sentence.text)
    expect(markerCount(sentence.text)).toBe(1)
  })
})

describe("resolveText", () => {
  it("uses the dict entry when present", () => {
    expect(resolveText({ text: "Hello", dataId: "t1" }, { t1: "Hola" })).toBe("Hola")
    expect(resolveText({ text: "Hello", dataId: "t1" }, {})).toBe("Hello")
    expect(resolveText({ text: "Hello" }, { t1: "Hola" })).toBe("Hello")
    expect(resolveText(undefined, {})).toBe("")
  })
})

describe("isBlankCorrect", () => {
  it("matches case-insensitively and trims", () => {
    expect(isBlankCorrect(" Cat ", ["cat"])).toBe(true)
    expect(isBlankCorrect("dog", ["cat"])).toBe(false)
  })

  it("accepts any of the alternatives", () => {
    expect(isBlankCorrect("kitten", ["cat", "kitten"])).toBe(true)
  })

  it("accepts anything non-empty when no answers are stored", () => {
    expect(isBlankCorrect("whatever", [])).toBe(true)
    expect(isBlankCorrect("   ", [])).toBe(false)
  })
})

describe("isMcStepCorrect", () => {
  const step: McStep = {
    id: "q1",
    options: [
      { itemId: "item-1", correct: true },
      { itemId: "item-2", correct: false },
    ],
  }

  it("checks the selected option's correctness", () => {
    expect(isMcStepCorrect(step, "item-1")).toBe(true)
    expect(isMcStepCorrect(step, "item-2")).toBe(false)
    expect(isMcStepCorrect(step, null)).toBe(false)
  })
})

describe("isUnderlineStepCorrect", () => {
  const step: UnderlineStep = {
    id: "question-group-1",
    tokens: [
      { itemId: "item-1", text: "I", correct: true },
      { text: " " },
      { itemId: "item-2", text: "like", correct: false },
      { text: " " },
      { itemId: "item-3", text: "bananas", correct: false },
      { text: "." },
    ],
  }

  it("is correct only when the selection matches the answer key exactly", () => {
    // Exactly the correct word.
    expect(isUnderlineStepCorrect(step, ["item-1"])).toBe(true)
    // Missing the correct word.
    expect(isUnderlineStepCorrect(step, [])).toBe(false)
    // Correct word plus a wrong one.
    expect(isUnderlineStepCorrect(step, ["item-1", "item-2"])).toBe(false)
    // Only a wrong word.
    expect(isUnderlineStepCorrect(step, ["item-3"])).toBe(false)
  })
})

describe("standaloneBlanks", () => {
  it("returns blanks not referenced by any sentence marker", () => {
    const step: FitbStep = {
      id: "step-1",
      sentences: [{ text: "The cow says [[blank:item-1]]." }],
      blanks: [
        { itemId: "item-1", answers: ["moo"] },
        { itemId: "item-2", answers: [], hint: "animal" },
      ],
    }
    expect(standaloneBlanks(step).map((b) => b.itemId)).toEqual(["item-2"])
  })

  it("treats all blanks as standalone when there are no sentences", () => {
    const step: FitbStep = {
      id: "step-1",
      sentences: [],
      blanks: [{ itemId: "item-3", answers: ["goat"] }],
    }
    expect(standaloneBlanks(step)).toHaveLength(1)
  })
})

describe("blankWidthCh", () => {
  it("prioritizes hint, then longest answer, then default", () => {
    expect(blankWidthCh(["cat"], "kitten")).toBe(8) // hint + 2
    expect(blankWidthCh(["hippopotamus"])).toBe(13) // answer + 1
    expect(blankWidthCh(["a"])).toBe(2)
    expect(blankWidthCh([])).toBe(8)
  })
})

describe("clampStageHeight", () => {
  it("keeps the configured height while image sizes are unknown", () => {
    expect(clampStageHeight(340, [])).toBe(340)
    expect(clampStageHeight(340, [0])).toBe(340)
  })

  it("shrinks to 2× the tallest image when all images are small", () => {
    expect(clampStageHeight(340, [100, 150])).toBe(300)
    expect(clampStageHeight(340, [80])).toBe(160)
  })

  it("never exceeds the configured height nor collapses below the floor", () => {
    expect(clampStageHeight(340, [400])).toBe(340)
    expect(clampStageHeight(340, [16, 20])).toBe(120)
  })
})

describe("readableOnWhite", () => {
  it("darkens a mid-tone pink accent until it passes AA on white", () => {
    const result = readableOnWhite("#EC6FA8") // book pink, ~3:1 on white
    expect(contrastOnWhite(result)).toBeGreaterThanOrEqual(4.5)
    // Still recognizably the accent hue, not a neutral fallback.
    expect(result).not.toBe("#1F2937")
  })

  it("keeps an already-dark accent unchanged", () => {
    expect(contrastOnWhite("#1D4ED8")).toBeGreaterThanOrEqual(4.5)
    expect(readableOnWhite("#1D4ED8").toLowerCase()).toBe("#1d4ed8")
  })

  it("falls back to a dark neutral for unparseable input", () => {
    expect(readableOnWhite("not-a-color")).toBe("#1F2937")
    expect(readableOnWhite("rgba(0,0,0,0.5)")).toBe("#1F2937")
  })
})

describe("parseStepperPayload", () => {
  it("round-trips a valid payload", () => {
    const payload = {
      activity: {
        kind: "multiple-choice",
        sectionType: "activity_multiple_choice",
        enabled: true,
        steps: [{ id: "q1", options: [] }],
      },
      palette: { accent: "#123456" },
    }
    const parsed = parseStepperPayload(JSON.stringify(payload))
    expect(parsed?.activity.kind).toBe("multiple-choice")
  })

  it("rejects malformed payloads", () => {
    expect(parseStepperPayload("not json")).toBeNull()
    expect(parseStepperPayload("{}")).toBeNull()
    expect(
      parseStepperPayload(JSON.stringify({ activity: { steps: [] }, palette: {} })),
    ).toBeNull()
  })
})
