import type { SetupRecommendation } from "@adt/types"
import type { Answers } from "../../shared/useAnswers"
import { FactPick } from "../FactPick"
import { screenFacts } from "../screens"

/** Screen 4 · Activities: exercises (activities and sections) and labelled pictures (maps and labelled drawings), each with what it turns on. */
export function ActivitiesScreen({ rec, chat, file }: { rec: SetupRecommendation; chat: Answers; file: File | null | undefined }) {
  const facts = screenFacts(rec, chat.derived!.current, "activities")
  return (
    <div className="flex flex-col gap-4">
      {facts.map((fact) => (
        <FactPick key={fact.id} rec={rec} fact={fact} chat={chat} file={file} sets />
      ))}
    </div>
  )
}
