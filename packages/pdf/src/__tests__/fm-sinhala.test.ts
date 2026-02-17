import { describe, it, expect } from "vitest";
import type { StructuredText } from "mupdf";
import {
  isFMFont,
  convertFMToUnicode,
  extractTextFromStructuredText,
} from "../fm-sinhala.js";

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

interface MockLine {
  fontName: string;
  text: string;
}

function createMockStructuredText(input: {
  asText: string;
  walkFontNames: string[];
  blocks: Array<{ type: string; lines: MockLine[] }>;
}): StructuredText {
  return {
    asText() {
      return input.asText;
    },
    asJSON() {
      return JSON.stringify({
        blocks: input.blocks.map((block) => ({
          type: block.type,
          lines: block.lines.map((line) => ({
            font: { name: line.fontName },
            text: line.text,
          })),
        })),
      });
    },
    walk(walker) {
      for (const fontName of input.walkFontNames) {
        walker.onChar?.(
          "x",
          { x: 0, y: 0 },
          { getName: () => fontName },
          12,
          { ul: { x: 0, y: 0 }, ur: { x: 0, y: 0 }, ll: { x: 0, y: 0 }, lr: { x: 0, y: 0 } },
          [0, 0, 0]
        );
      }
    },
  } as unknown as StructuredText;
}

describe("extractTextFromStructuredText", () => {
  it("collapses extra newlines in non-FM text", () => {
    const stext = createMockStructuredText({
      asText: "alpha\n\n\n\nbeta",
      walkFontNames: ["TimesNewRomanPSMT"],
      blocks: [],
    });

    expect(extractTextFromStructuredText(stext)).toBe("alpha\n\nbeta");
  });

  it("converts FM text and collapses extra newlines", () => {
    const stext = createMockStructuredText({
      asText: "",
      walkFontNames: ["DJCUQE+FMSamanthax"],
      blocks: [
        {
          type: "text",
          lines: [
            { fontName: "DJCUQE+FMSamanthax", text: "Y%S" },
            { fontName: "DJCUQE+FMSamanthax", text: "" },
            { fontName: "DJCUQE+FMSamanthax", text: "" },
            { fontName: "DJCUQE+FMSamanthax", text: "" },
          ],
        },
        {
          type: "text",
          lines: [{ fontName: "DJCUQE+FMSamanthax", text: "l%d" }],
        },
      ],
    });

    expect(extractTextFromStructuredText(stext)).toBe("ශ්‍රී\n\nක්‍රා");
  });

  it("converts only FM lines when a page has mixed fonts", () => {
    const stext = createMockStructuredText({
      asText: "",
      walkFontNames: ["DJCUQE+FMSamanthax", "TimesNewRomanPSMT"],
      blocks: [
        {
          type: "text",
          lines: [
            { fontName: "DJCUQE+FMSamanthax", text: "Y%S" },
            { fontName: "TimesNewRomanPSMT", text: "Chapter 1" },
            { fontName: "DJCUQE+FMSamanthax", text: "l%d" },
          ],
        },
      ],
    });

    expect(extractTextFromStructuredText(stext)).toBe("ශ්‍රී\nChapter 1\nක්‍රා");
  });
});
