/** The letter a pin shows for its author. Pins used to count up per section, which read as a
 *  cross-page index it never was — the third comment on page four wore a "1". A comment is a
 *  comment; the initial says who left it, which is the one thing worth reading at a glance.
 *
 *  Deliberately duplicated from the reader's own copy rather than shared: the reader ships as
 *  its own bundle and Studio may not import from it, and a pin that disagreed about its label
 *  between the two views would be worse than six lines repeated. */
export function initialOf(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? "•"
}
