import { describe, it, expect } from "vitest";
import { isFMFont, convertFMToUnicode } from "../fm-sinhala.js";

describe("isFMFont", () => {
  it("detects FM Sinhala font names", () => {
    expect(isFMFont("DJCUQE+FMSamanthax")).toBe(true);
    expect(isFMFont("FMAbhaya")).toBe(true);
    expect(isFMFont("ABCDEF+FMMalithi")).toBe(true);
  });

  it("rejects non-FM font names", () => {
    expect(isFMFont("TimesNewRomanPSMT")).toBe(false);
    expect(isFMFont("Arial")).toBe(false);
    expect(isFMFont("CPJXEB+TimesNewRomanPSMT")).toBe(false);
    expect(isFMFont("")).toBe(false);
  });
});

describe("convertFMToUnicode", () => {
  it("converts FM-encoded Sri Lanka national anthem title", () => {
    // "Y%S ,xld cd;sl .Sh" → "ශ්‍රී ලංකා ජාතික ගීය"
    const result = convertFMToUnicode("Y%S ,xld cd;sl .Sh");
    expect(result).toBe("ශ්‍රී ලංකා ජාතික ගීය");
  });

  it("preserves digits and spaces", () => {
    const result = convertFMToUnicode("2020");
    expect(result).toBe("2020");
  });

  it("handles mixed digits and FM text", () => {
    const result = convertFMToUnicode("1' ");
    // 1 stays, ' → . (period), space stays
    expect(result).toContain("1");
  });

  it("returns empty string unchanged", () => {
    expect(convertFMToUnicode("")).toBe("");
  });

  it("handles multi-character FM sequences correctly", () => {
    // "l%d" → "ක්‍රා" (conjunct: ka + virama + ZWJ + ra + aa)
    const result = convertFMToUnicode("l%d");
    expect(result).toBe("ක්‍රා");
  });
});
