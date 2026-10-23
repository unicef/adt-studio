import { useLingui } from "@lingui/react/macro"
import {
  AudioLines,
  BookOpen,
  Braces,
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
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"

export interface StepFact {
  icon: LucideIcon
  text: string
}

export interface StepFacts {
  label: string
  group: string
  description: string
  facts: StepFact[]
  before: string
  after: string | null
  fit: string
  helps: string
  joins: string
}

export function useGroupNames() {
  const { t } = useLingui()
  return (section: string): string =>
    section === "essential"
      ? t`Essential`
      : section === "access"
        ? t`More accessibility`
        : section === "extras"
          ? t`Learning extras`
          : t`Languages & voices`
}

export function useStepFacts() {
  const { t } = useLingui()
  const group = useGroupNames()
  const storyboard = t`Storyboard`
  const languages = t`Languages`
  const content = t`Your content`
  const contentFit = t`Any time after the storyboard. Add it before translating, so it gets translated too.`
  const joinsOnRun = t`Joins your book once it runs.`

  return (slug: string): StepFacts => {
    switch (slug) {
      case "extract":
        return {
          helps: t`Everyone: it's where the book starts.`,
          joins: t`Runs first, from your PDF.`,
          label: t`Extract`,
          group: t`Setup`,
          description: t`Reads your PDF and pulls out every page's text and pictures, so the rest of the book can be built from them.`,
          facts: [],
          before: t`Your PDF`,
          after: t`Sectioning`,
          fit: t`The first step. Run it again only if you replace the PDF.`,
        }
      case "sectioning":
        return {
          helps: t`Everyone: it decides how each page is read.`,
          joins: t`Runs after Extract.`,
          label: t`Sectioning`,
          group: t`Setup`,
          description: t`Splits each page into headings, paragraphs and pictures, and sets the order they're read in.`,
          facts: [],
          before: t`Extract`,
          after: t`Storyboard`,
          fit: t`Changing it rebuilds the storyboard and everything made from it.`,
        }
      case "storyboard":
        return {
          helps: t`Everyone: it's the book your readers will see.`,
          joins: t`Builds once Sectioning is done.`,
          label: t`Storyboard`,
          group: t`Setup`,
          description: t`Lays out every page as an accessible web page. It's where you'll spend most of your time.`,
          facts: [],
          before: t`Sectioning`,
          after: t`the features you add`,
          fit: t`Opens once Sectioning is done.`,
        }
      case "captions":
        return {
          helps: t`Blind and low-vision readers using screen readers or braille.`,
          joins: joinsOnRun,
          label: t`Image descriptions`,
          group: group("essential"),
          description: t`Short text alternatives for informative pictures, read by screen readers and braille displays. Decorative pictures are skipped.`,
          facts: [
            { icon: Sparkles, text: t`AI writes, you review` },
            { icon: ImageIcon, text: t`One per informative picture` },
          ],
          before: storyboard,
          after: languages,
          fit: contentFit,
        }
      case "toc":
        return {
          helps: t`Everyone, especially screen-reader and keyboard users.`,
          joins: joinsOnRun,
          label: t`Table of contents`,
          group: group("access"),
          description: t`A navigable list of chapters and sections, so readers and assistive tech can jump straight to a part.`,
          facts: [
            { icon: Braces, text: t`Built from headings` },
            { icon: ListOrdered, text: t`You can edit it` },
          ],
          before: storyboard,
          after: languages,
          fit: contentFit,
        }
      case "easy-read":
        return {
          helps: t`Readers with intellectual disabilities or who are learning the language.`,
          joins: joinsOnRun,
          label: t`Easy Read`,
          group: group("access"),
          description: t`AI rewrites the text in short, plain sentences, one idea each. Check it with readers who use Easy Read.`,
          facts: [
            { icon: Sparkles, text: t`AI rewrites, you review` },
            { icon: Eye, text: t`Readers switch it on` },
          ],
          before: storyboard,
          after: languages,
          fit: contentFit,
        }
      case "sign-language":
        return {
          helps: t`Deaf readers whose first language is sign language.`,
          joins: t`Joins your book once a video is uploaded.`,
          label: t`Sign language`,
          group: group("access"),
          description: t`Videos in your readers' national sign language, shown next to the matching section. Translated versions need their own videos.`,
          facts: [
            { icon: Upload, text: t`You upload the videos` },
            { icon: Video, text: t`One per section` },
          ],
          before: storyboard,
          after: null,
          fit: t`Any time after the storyboard. Each video plays beside its section.`,
        }
      case "quizzes":
        return {
          helps: t`Learners checking their understanding as they go.`,
          joins: joinsOnRun,
          label: t`Quizzes`,
          group: group("extras"),
          description: t`Short comprehension questions placed through the book, so readers can check what they understood.`,
          facts: [
            { icon: Sparkles, text: t`AI writes, you review` },
            { icon: HelpCircle, text: t`Every few pages` },
          ],
          before: storyboard,
          after: languages,
          fit: contentFit,
        }
      case "glossary":
        return {
          helps: t`Readers meeting new or technical words.`,
          joins: joinsOnRun,
          label: t`Glossary`,
          group: group("extras"),
          description: t`Key terms with plain definitions; readers tap a word in the text to see what it means.`,
          facts: [
            { icon: Sparkles, text: t`AI picks key terms` },
            { icon: BookOpen, text: t`Select a word to see its meaning` },
          ],
          before: storyboard,
          after: languages,
          fit: contentFit,
        }
      case "translate":
        return {
          helps: t`Readers who prefer another language.`,
          joins: joinsOnRun,
          label: t`Languages`,
          group: group("localization"),
          description: t`Adds other language versions of the book that you can review and edit.`,
          facts: [
            { icon: Languages, text: t`Every text in the book` },
            { icon: Sparkles, text: t`AI translates, you review` },
          ],
          before: content,
          after: t`Read aloud`,
          fit: t`Best done last: it translates every text, including descriptions and quizzes you've added.`,
        }
      case "speech":
        return {
          helps: t`Emerging, dyslexic and low-vision readers.`,
          joins: joinsOnRun,
          label: t`Read aloud`,
          group: group("localization"),
          description: t`Narrates the book with words highlighted as they're spoken. Blind readers usually use their own screen reader instead.`,
          facts: [
            { icon: AudioLines, text: t`Each language with a voice` },
            { icon: Highlighter, text: t`Words light up as spoken` },
          ],
          before: languages,
          after: null,
          fit: t`Best done last: it voices every language you've added.`,
        }
      default:
        return { label: getStageLabelI18n(slug), group: "", description: "", facts: [], before: storyboard, after: null, fit: contentFit, helps: "", joins: joinsOnRun }
    }
  }
}
