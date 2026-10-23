/** The letter a pin shows for its author. Pins used to count up per page, which read as a
 *  cross-page index it never was — the third comment on page four wore a "1". A comment is a
 *  comment; the initial says who left it, which is the one thing worth reading at a glance. */
export function initialOf(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? "•"
}
