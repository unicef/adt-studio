import { R2_FREE_TIER_BYTES } from "@adt/types"

const KILOBYTE = 1024
const MEGABYTE = 1024 * KILOBYTE
const GIGABYTE = 1024 * MEGABYTE

type StorageUnit = "kilobyte" | "megabyte" | "gigabyte"

/**
 * A published book's size, localized.
 *
 * `lib/utils`' `formatBytes` stops at MB and hardcodes its units, which is right for the upload
 * screens it serves but wrong here: this number is compared against a 10 GB allowance and shown
 * in five locales. `Intl` carries both the unit name and the decimal separator, so nothing about
 * it needs translating by hand.
 */
export function formatStorage(bytes: number, locale: string): string {
  const [value, unit]: [number, StorageUnit] =
    bytes >= GIGABYTE
      ? [bytes / GIGABYTE, "gigabyte"]
      : bytes >= MEGABYTE
        ? [bytes / MEGABYTE, "megabyte"]
        : [bytes / KILOBYTE, "kilobyte"]

  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    unitDisplay: "short",
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value)
}

/** How much of R2's free allowance the measured snapshots take, clamped so a paid account's
 *  overshoot cannot draw a bar past its track. */
export function freeTierFraction(bytes: number): number {
  return Math.min(1, Math.max(0, bytes / R2_FREE_TIER_BYTES))
}
