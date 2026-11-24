import { useIdea } from "../../../chat/ideas"
import { Citation } from "./Citation"
import { PeekTags } from "./PeekTag"

/**
 * The pages behind one claim, inline after it: an inline citation ("cite") or tiny peek tags
 * ("e23"). Nothing for the other Evidence ideas, or "now".
 */
export function ClaimMark({ file, pages }: { file: File | null | undefined; pages: number[] }) {
  const idea = useIdea("evidence")
  if (!pages.length) return null
  if (idea === "cite") return <Citation file={file} pages={pages} />
  if (idea === "e23") return <PeekTags file={file} pages={pages} />
  return null
}

/** The Evidence ideas that put the pages inline, so the separate page buttons can go. */
export const useInlinePages = () => {
  const idea = useIdea("evidence")
  return idea === "cite" || idea === "e23"
}
