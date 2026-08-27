/**
 * GPT-Image-2 generated PNG buddy assets.
 *
 * Layout contract — one folder per character, files named `<id>_<n>.png`:
 *
 *   assets/kids-buddies/<id>/<id>_1.png   standing    (base pose, FAB + picker)
 *   assets/kids-buddies/<id>/<id>_2.png   signature   (character-specific pose)
 *   assets/kids-buddies/<id>/<id>_3.png   happy
 *   assets/kids-buddies/<id>/<id>_4.png   excited
 *   assets/kids-buddies/<id>/<id>_5.png   thinking
 *   assets/kids-buddies/<id>/<id>_6.png   surprised
 *   assets/kids-buddies/<id>/<id>_7.png   encouraging
 *
 * The source PNGs live once in the repo at `assets/adt/kids-buddies/`
 * (alongside sounds/, symbols/, fonts/) and are served book-relative:
 *   - dev: the runtime Vite `publicDir` is `assets/adt/`, so they resolve
 *     under `./assets/kids-buddies/...` automatically.
 *   - packaged books: packages/pipeline copies the folder into the book's
 *     `adt/assets/kids-buddies/` only when the book is a kids book
 *     (see package-web.ts), so buddy art is no longer baked into the shared
 *     runtime bundle.
 *
 * Because the sets are plain book-relative URLs (not bundled data URLs),
 * future user-created characters follow the same numbering and folder layout.
 */
import { KIDS_BUDDIES } from "@adt/types/kids"

export type BuddyExpression =
  | "standing"
  | "signature"
  | "happy"
  | "excited"
  | "thinking"
  | "surprised"
  | "encouraging"

/** File-number convention shared by built-in and future custom characters. */
const EXPRESSION_NUMBER: Record<BuddyExpression, number> = {
  standing: 1,
  signature: 2,
  happy: 3,
  excited: 4,
  thinking: 5,
  surprised: 6,
  encouraging: 7,
}

export interface BuddyImageSet {
  id: string
  labelFallback: string
  defaultNameFallback: string
  standing: string
  signature: string
  happy: string
  excited: string
  thinking: string
  surprised: string
  encouraging: string
}

function buddyImageSet(
  id: string,
  labelFallback: string,
  defaultNameFallback: string,
): BuddyImageSet {
  const url = (variant: BuddyExpression) =>
    `./assets/kids-buddies/${id}/${id}_${EXPRESSION_NUMBER[variant]}.png`
  return {
    id,
    labelFallback,
    defaultNameFallback,
    standing: url("standing"),
    signature: url("signature"),
    happy: url("happy"),
    excited: url("excited"),
    thinking: url("thinking"),
    surprised: url("surprised"),
    encouraging: url("encouraging"),
  }
}

export const BUDDY_IMAGE_SETS: readonly BuddyImageSet[] = KIDS_BUDDIES.map(
  (buddy) =>
    buddyImageSet(
      buddy.id,
      buddy.labelFallback,
      buddy.defaultNameFallback,
    ),
)

export function getBuddyImages(id: string): BuddyImageSet {
  return BUDDY_IMAGE_SETS.find((s) => s.id === id) ?? BUDDY_IMAGE_SETS[0]
}
