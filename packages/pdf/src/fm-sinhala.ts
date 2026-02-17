/**
 * FM Sinhala Legacy Font → Unicode Conversion
 *
 * FM fonts (FM Samantha, FM Abhaya, FM Malithi, etc.) are legacy Sri Lankan
 * fonts that map Sinhala glyphs to Latin/ASCII codepoints. PDFs using these
 * fonts render correctly (the font contains Sinhala glyph outlines) but text
 * extraction returns garbled Latin characters instead of proper Sinhala Unicode.
 *
 * This module detects FM fonts and remaps extracted text to correct Unicode.
 */

import type { StructuredText } from "mupdf";
import { FM_TO_UNICODE } from "./fm-sinhala-data.js";

/** Pattern matching FM-family font names (e.g. "DJCUQE+FMSamanthax", "FMAbhaya") */
const FM_FONT_PATTERN = /\bFM[A-Z]/i;

/** Check whether a font name belongs to the FM Sinhala font family. */
export function isFMFont(fontName: string): boolean {
  return FM_FONT_PATTERN.test(fontName);
}

/**
 * Convert FM-encoded text to proper Sinhala Unicode.
 * Applies replacements longest-first to avoid partial matches.
 */
export function convertFMToUnicode(text: string): string {
  for (const [fm, uni] of FM_TO_UNICODE) {
    if (text.includes(fm)) {
      text = text.split(fm).join(uni);
    }
  }
  return text;
}

interface StextJsonLine {
  font?: { name?: string };
  text?: string;
}

interface StextJsonBlock {
  type: string;
  lines?: StextJsonLine[];
}

interface StextJson {
  blocks: StextJsonBlock[];
}

/**
 * Normalize extracted text spacing:
 * - Normalize CRLF/CR to LF
 * - Remove trailing spaces/tabs on each line
 * - Collapse 3+ consecutive newlines to 2
 */
function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Extract text from a StructuredText object, remapping legacy FM Sinhala fonts
 * to proper Unicode when detected.
 *
 * For pages that don't use FM fonts, uses the default asText() output path.
 */
export function extractTextFromStructuredText(stext: StructuredText): string {
  // Quick check: scan for FM fonts via the walker
  let hasFMFont = false;
  stext.walk({
    beginLine(_bbox, _wmode, _direction) {},
    onChar(_c, _origin, font, _size, _quad) {
      if (!hasFMFont && isFMFont(font.getName())) {
        hasFMFont = true;
      }
    },
  });

  // No FM fonts — use default extraction, then normalize whitespace.
  if (!hasFMFont) {
    return normalizeExtractedText(stext.asText());
  }

  // FM fonts detected — walk JSON, remap per-line, preserve block boundaries.
  const json: StextJson = JSON.parse(stext.asJSON());
  const textBlocks: string[] = [];

  for (const block of json.blocks) {
    if (block.type !== "text" || !block.lines) continue;
    const lines: string[] = [];
    for (const line of block.lines) {
      const fontName = line.font?.name ?? "";
      const text = line.text ?? "";
      lines.push(isFMFont(fontName) ? convertFMToUnicode(text) : text);
    }
    if (lines.length > 0) {
      textBlocks.push(lines.join("\n"));
    }
  }

  return normalizeExtractedText(textBlocks.join("\n\n"));
}
