import { useLingui } from "@lingui/react/macro"
import {
  AudioLines,
  BookOpen,
  Eye,
  HelpCircle,
  Highlighter,
  ImageIcon,
  Languages,
  ListOrdered,
  Sparkles,
  Upload,
  Video,
  type LucideIcon,
} from "lucide-react"

export interface StepFact {
  icon: LucideIcon
  text: string
}

export interface StepFacts {
  facts: StepFact[]
  before: string
  after: string | null
  fit: string
}

export function useStepFacts() {
  const { t } = useLingui()
  const storyboard = t`Storyboard`
  const languages = t`Languages`
  const content = t`Your content`
  const contentFit = t`Any time after the storyboard. Add it before translating, so it gets translated too.`

  return (slug: string): StepFacts => {
    switch (slug) {
      case "captions":
        return { facts: [{ icon: Sparkles, text: t`AI writes them` }, { icon: ImageIcon, text: t`One per picture` }], before: storyboard, after: languages, fit: contentFit }
      case "toc":
        return { facts: [{ icon: Sparkles, text: t`Built from headings` }, { icon: ListOrdered, text: t`You can edit it` }], before: storyboard, after: languages, fit: contentFit }
      case "easy-read":
        return { facts: [{ icon: Sparkles, text: t`AI simplifies the text` }, { icon: Eye, text: t`Readers switch it on` }], before: storyboard, after: languages, fit: contentFit }
      case "sign-language":
        return {
          facts: [{ icon: Upload, text: t`You upload the videos` }, { icon: Video, text: t`One per section` }],
          before: storyboard,
          after: null,
          fit: t`Any time after the storyboard. Videos play next to the matching section.`,
        }
      case "quizzes":
        return { facts: [{ icon: Sparkles, text: t`AI writes questions` }, { icon: HelpCircle, text: t`Every few pages` }], before: storyboard, after: languages, fit: contentFit }
      case "glossary":
        return { facts: [{ icon: Sparkles, text: t`AI picks key terms` }, { icon: BookOpen, text: t`Tap a word to see it` }], before: storyboard, after: languages, fit: contentFit }
      case "translate":
        return {
          facts: [{ icon: Languages, text: t`Every text in the book` }, { icon: Sparkles, text: t`AI translation you can edit` }],
          before: content,
          after: t`Read aloud`,
          fit: t`Do this after your content: it translates everything above.`,
        }
      case "speech":
        return {
          facts: [{ icon: AudioLines, text: t`Every text, every language` }, { icon: Highlighter, text: t`Words light up as spoken` }],
          before: languages,
          after: null,
          fit: t`Comes last: it reads the translated text aloud.`,
        }
      default:
        return { facts: [], before: storyboard, after: null, fit: contentFit }
    }
  }
}
