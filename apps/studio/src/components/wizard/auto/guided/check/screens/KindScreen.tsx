import type { SetupRecommendation } from "@adt/types"
import type { Answers } from "../../shared/useAnswers"
import { FactPick } from "../FactPick"

/** Screen 1 · Kind of book: the genre, which picks the preset. */
export function KindScreen({ rec, chat, file }: { rec: SetupRecommendation; chat: Answers; file: File | null | undefined }) {
  const fact = rec.facts.find((f) => f.id === "genre")
  if (!fact) return null
  return <FactPick rec={rec} fact={fact} chat={chat} file={file} />
}
