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
