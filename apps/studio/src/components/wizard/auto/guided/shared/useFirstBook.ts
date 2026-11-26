import { useContext } from "react"
import { useBooks } from "@/hooks/use-books"
import { LabDriveContext } from "./labDrive"

/**
 * Whether this is the user's first book: the library has no books yet (a library emptied later
 * counts as new again). False until the library has loaded. The lab can set it either way.
 */
export function useFirstBook(): boolean {
  const lab = useContext(LabDriveContext)?.library
  const { data: books, isSuccess } = useBooks()
  if (lab) return lab === "empty"
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
 * library has loaded. The lab's "Library: empty" always plays it.
 */
export function useFirstRun(): boolean | null {
  const lab = useContext(LabDriveContext)?.library
  const { data: books, isSuccess } = useBooks()
  if (lab) return lab === "empty"
  if (!isSuccess) return null
  return (books?.length ?? 0) === 0 && !tourSeen()
}
