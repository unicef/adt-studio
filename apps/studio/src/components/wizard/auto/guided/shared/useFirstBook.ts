import { useBooks } from "@/hooks/use-books"

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
