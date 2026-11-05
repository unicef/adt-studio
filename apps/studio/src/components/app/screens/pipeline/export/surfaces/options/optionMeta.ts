import { useLingui } from "@lingui/react/macro"
import { Circle, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { STAGES } from "@/components/pipeline/stage-config"

export const ACCENT_SWITCH = cn("[&_[role=switch][data-state=checked]]:bg-(--accent)")

export interface StageLook {
  icon: LucideIcon
  hex: string
}

export function stageLook(slug: string): StageLook {
  const stage = STAGES.find((candidate) => candidate.slug === slug)
  return { icon: stage?.icon ?? Circle, hex: stage?.hex ?? "#4b5563" }
}

export function useOptionText() {
  const { t } = useLingui()
  return {
    name: {
      glossary: t`Glossary`,
      speech: t`Read aloud`,
      quizzes: t`Quizzes`,
      "sign-language": t`Sign language`,
      captions: t`Image descriptions`,
      toc: t`Table of contents`,
      "easy-read": t`Easy Read`,
    } as Record<string, string>,
    hint: {
      glossary: t`Tap a word to see what it means`,
      speech: t`Narration for every page`,
      quizzes: t`Questions after the pages they cover`,
      "sign-language": t`Video next to the pages that have one`,
    } as Record<string, string>,
  }
}
