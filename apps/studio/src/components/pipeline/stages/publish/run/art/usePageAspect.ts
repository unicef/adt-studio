import { useEffect, useState } from "react"

/**
 * The shape of this book's pages, measured from one of them.
 *
 * Every animation on this bench was drawn against a 3:4 portrait page, which is a textbook. A
 * picture book for five-year-olds is very often square or landscape, and a portrait frame drawn
 * around a landscape page does one of two ugly things: letterboxes it inside a card the wrong
 * shape, or crops the illustration that is the entire point of the page. Neither is acceptable in
 * a screen whose whole argument is "this is *your* book".
 *
 * Measured rather than declared, because nothing in the API carries page dimensions —
 * `PageSummaryItem` has no width or height, and asking the server for them would be a request per
 * page. One image is enough: pages within a book share a trim size, so the first render that
 * decodes answers for all of them.
 *
 * Returns the fallback until a real measurement arrives, so nothing waits on the network to draw.
 */
export const DEFAULT_PAGE_ASPECT = 3 / 4

export function usePageAspect(pages: readonly string[]): number {
  const [aspect, setAspect] = useState(DEFAULT_PAGE_ASPECT)
  const first = pages[0]

  useEffect(() => {
    if (!first) {
      setAspect(DEFAULT_PAGE_ASPECT)
      return
    }

    let cancelled = false
    const image = new Image()
    image.decoding = "async"
    image.src = first
    image
      .decode()
      .then(() => {
        if (cancelled || !image.naturalWidth || !image.naturalHeight) return
        /* Clamped: a page five times wider than it is tall is a scanning accident, not a trim size,
         * and a composition asked to accommodate one would be ruined for every real book. */
        const measured = image.naturalWidth / image.naturalHeight
        setAspect(Math.min(2, Math.max(0.5, measured)))
      })
      .catch(() => {
        /* A page that will not decode tells us nothing about the book's shape; the default is as
         * good a guess as any and better than a broken layout. */
      })

    return () => {
      cancelled = true
    }
  }, [first])

  return aspect
}
