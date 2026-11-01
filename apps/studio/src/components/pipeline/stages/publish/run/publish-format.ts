/** Counts are read aloud and compared at a glance, so they follow the author's locale rather than
 *  the wire's. `340` and `1 250` are the same number to the machine and not to a French reader. */
export function formatCount(value: number, locale?: string): string {
  return value.toLocaleString(locale || undefined)
}

/** The small percent beside the bar. Formatted rather than concatenated, because the space before
 *  the sign in `fr` is part of the number, not decoration. */
export function formatPercent(percent: number, locale?: string): string {
  return (percent / 100).toLocaleString(locale || undefined, {
    style: "percent",
    maximumFractionDigits: 0,
  })
}
