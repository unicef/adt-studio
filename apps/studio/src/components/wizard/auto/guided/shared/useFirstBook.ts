import { useBooks } from "@/hooks/use-books"

/**
 * Whether this is the user's first book: the library has no books yet (a library emptied later
 * counts as new again). False until the library has loaded.
 */
export function useFirstBook(): boolean {
  const { data: books, isSuccess } = useBooks()
  return isSuccess && (books?.length ?? 0) === 0
}

const SEEN_KEY = "add-book:tour-seen"

/** The tour was seen (finished or skipped) in this browser. */
export function markTourSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1")
  } catch {
    /* storage blocked: the tour shows again next time */
  }
}
function tourSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1"
  } catch {
    return false
  }
}

/**
 * A first run: the library has no books and the tour wasn't seen in this browser. Null until the
 * library has loaded.
 */
export function useFirstRun(): boolean | null {
  const { data: books, isSuccess } = useBooks()
  if (!isSuccess) return null
  return (books?.length ?? 0) === 0 && !tourSeen()
}
