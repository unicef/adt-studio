import { describe, expect, it } from "vitest"
import { getTextDirection } from "../text-direction.js"

describe("getTextDirection", () => {
  it("is right-to-left for Urdu in every locale spelling", () => {
    for (const code of ["ur", "ur-PK", "ur_PK", "ur-pk", "UR", " ur-IN "]) {
      expect(getTextDirection(code)).toBe("rtl")
    }
  })

  it("is right-to-left for the other right-to-left languages Studio offers", () => {
    for (const code of ["ar", "ar-EG", "he", "he-IL", "fa", "fa-IR", "ps", "ps-AF"]) {
      expect(getTextDirection(code)).toBe("rtl")
    }
  })

  it("follows the region for Punjabi: Shahmukhi in Pakistan, Gurmukhi elsewhere", () => {
    expect(getTextDirection("pa-PK")).toBe("rtl")
    expect(getTextDirection("pa_pk")).toBe("rtl")
    expect(getTextDirection("pa")).toBe("ltr")
    expect(getTextDirection("pa-IN")).toBe("ltr")
  })

  it("is left-to-right for everything else, including unknown and empty codes", () => {
    for (const code of ["en", "en-US", "hi", "bn", "sw", "zh", "es-UY", "xx", "", null, undefined]) {
      expect(getTextDirection(code)).toBe("ltr")
    }
  })

  it("matches whole language subtags, not prefixes", () => {
    // `urd`/`ara` are not the codes this app stores; a prefix match would
    // also flip unrelated languages such as `arn` (Mapudungun).
    expect(getTextDirection("arn")).toBe("ltr")
    expect(getTextDirection("hey")).toBe("ltr")
  })
})
