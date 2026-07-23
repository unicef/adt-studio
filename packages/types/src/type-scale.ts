import { z } from "zod"

/**
 * Book-wide baseline font sizes (CSS px at 1x) for the core text roles,
 * derived deterministically from the font sizes extracted from the PDF.
 *
 * PDFs generally reuse the same size for body text and a small set of sizes
 * for headings. Rendering references these as shared CSS custom properties /
 * semantic classes so every page uses the same size per role — regardless of
 * which page an LLM generated in isolation, so page-by-page rendering stays
 * typographically consistent without needing cross-page context.
 */
export const TypeScale = z.object({
  /** Dominant body / paragraph size (modal size, weighted by character count). */
  bodyPx: z.number(),
  /** Heading tiers, largest → smallest. */
  h1Px: z.number(),
  h2Px: z.number(),
  h3Px: z.number(),
  /** Captions / footnotes — the dominant size below body. */
  captionPx: z.number(),
  /** Total characters analysed (transparency / confidence signal). */
  sampleChars: z.number(),
  /** Distinct sizes observed with their character weights, largest → smallest. */
  observed: z.array(z.object({ px: z.number(), chars: z.number() })),
})
export type TypeScale = z.infer<typeof TypeScale>
