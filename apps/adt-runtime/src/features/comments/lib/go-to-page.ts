/**
 * The one way the comments feature moves the reader to another page — following someone, or
 * opening a comment on another page from the list.
 *
 * Every page is its own document here, so this is a full load. A reader that swaps pages in
 * place instead routes its own page turns through a single function; this is the seam where the
 * comments feature joins it, so neither caller has to know which kind of navigation it gets.
 */
export function goToPage(href: string): void {
  window.location.href = href
}
