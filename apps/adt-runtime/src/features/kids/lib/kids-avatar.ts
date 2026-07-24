/**
 * Renders a kid's avatar config to an SVG string, fully offline.
 *
 * The art ships inside `@dicebear/collection` (the "adventurer" style); only
 * the part IDs come from the stored config, so nothing is fetched at runtime.
 * `background: false` renders a transparent avatar (the container paints the
 * colour — used by tiles/preview); otherwise the chosen background is baked in.
 */
import { createAvatar } from "@dicebear/core"
import { adventurer } from "@dicebear/collection"
import type { KidsAvatarConfig } from "@adt/types/kids"

type AdventurerOptions = NonNullable<
  Parameters<typeof adventurer.create>[0]["options"]
>

export function kidsAvatarSvg(
  config: KidsAvatarConfig,
  opts?: { background?: boolean },
): string {
  const transparent = opts?.background === false
  // The part ids are validated against our own catalogs in `@adt/types/kids`;
  // DiceBear types them as strict literal unions, so we cast at this boundary.
  const options = {
    seed: "adt-kids",
    radius: 0,
    backgroundColor: [
      transparent ? "transparent" : config.backgroundColor || "transparent",
    ],
    skinColor: [config.skinColor],
    hairColor: [config.hairColor],
    eyes: [config.eyes],
    eyebrows: [config.eyebrows],
    mouth: [config.mouth],
    hair: config.hair ? [config.hair] : undefined,
    hairProbability: config.hair ? 100 : 0,
    glasses: config.glasses ? [config.glasses] : undefined,
    glassesProbability: config.glasses ? 100 : 0,
    earrings: config.earrings ? [config.earrings] : undefined,
    earringsProbability: config.earrings ? 100 : 0,
    features: config.features ? [config.features] : undefined,
    featuresProbability: config.features ? 100 : 0,
  } as unknown as AdventurerOptions

  // Force the root <svg> to fill its container regardless of app CSS.
  return createAvatar(adventurer, options)
    .toString()
    .replace(
      "<svg ",
      '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block" ',
    )
}
