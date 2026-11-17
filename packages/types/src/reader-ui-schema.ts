import { z } from "zod"
import {
  READER_COLOR_TOKENS,
  READER_BUTTON_STYLES,
  READER_DOCK_ALIGNS,
  READER_DOCK_POSITIONS,
  READER_DOCK_WIDTHS,
  READER_FONTS,
  READER_PANEL_BEHAVIORS,
  READER_PANEL_SIDES,
  READER_PANEL_STYLES,
  READER_RADIUS_MAX,
  READER_RADIUS_MIN,
  isSafeReaderCssColor,
  type ReaderUi,
} from "./reader-ui.js"

export const ReaderCssColor = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(isSafeReaderCssColor, { message: "Not a CSS colour value" })

export const ReaderColorTokensSchema = z
  .object(
    Object.fromEntries(READER_COLOR_TOKENS.map((token) => [token, ReaderCssColor.optional()])) as Record<
      (typeof READER_COLOR_TOKENS)[number],
      z.ZodOptional<typeof ReaderCssColor>
    >,
  )
  .strict()

export const ReaderUiLayoutSchema = z
  .object({
    dock_position: z.enum(READER_DOCK_POSITIONS).optional(),
    dock_width: z.enum(READER_DOCK_WIDTHS).optional(),
    dock_align: z.enum(READER_DOCK_ALIGNS).optional(),
    panel_style: z.enum(READER_PANEL_STYLES).optional(),
    panel_side: z.enum(READER_PANEL_SIDES).optional(),
    panel_behavior: z.enum(READER_PANEL_BEHAVIORS).optional(),
    button_style: z.enum(READER_BUTTON_STYLES).optional(),
  })
  .strict()

/** Book-config schema for `reader_ui` (see `reader-ui.ts` for the contract). */
export const ReaderUiConfig = z
  .object({
    layout: ReaderUiLayoutSchema.optional(),
    light: ReaderColorTokensSchema.optional(),
    dark: ReaderColorTokensSchema.optional(),
    radius: z.number().min(READER_RADIUS_MIN).max(READER_RADIUS_MAX).optional(),
    font: z.enum(READER_FONTS).optional(),
  })
  .strict()

// The zod schema and the zod-free runtime type must describe the same shape.
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const readerUiShapesMatch: Exact<z.infer<typeof ReaderUiConfig>, ReaderUi> = true
void readerUiShapesMatch
