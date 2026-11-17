import { useOutputs } from "./use-outputs"
import { useQuizzes } from "./use-quizzes"
import { useGlossary } from "./use-glossary"
import { useToc } from "./use-toc"
import { useSignLanguageVideos } from "./use-sign-language-videos"

export interface ExportFeatureToggles {
  glossary: boolean
  readAloud: boolean
  quizzes: boolean
  signLanguage: boolean
  languages?: string[]
}

export interface AvailableExportFeatures {
  glossary: boolean
  readAloud: boolean
  quizzes: boolean
  signLanguage: boolean
}

export interface AllProjectFeatures {
  isReady: boolean
  toggleable: AvailableExportFeatures
  present: {
    captions: boolean
    toc: boolean
    easyRead: boolean
  }
}

export function useAllProjectFeatures(bookLabel: string): AllProjectFeatures {
  const outputs = useOutputs(bookLabel)
  const quizzes = useQuizzes(bookLabel)
  const glossary = useGlossary(bookLabel)
  const toc = useToc(bookLabel)
  const signLanguage = useSignLanguageVideos(bookLabel)
  const signLanguageData = signLanguage.data
  // Attempt status can be cleared while these persisted outputs remain usable.
  // The shared catalog applies current source membership and asset checks.
  const hasOutput = (kind: "audio" | "caption" | "easy-read") =>
    outputs.data?.outputs.some((output) => output.identity.kind === kind && output.usable) ?? false
  const hasAssignedVideos = signLanguageData?.videos?.some((v) => v.sectionId !== null) ?? false

  return {
    isReady: [outputs, quizzes, glossary, toc, signLanguage].every((query) => !query.isPending && !query.isError),
    toggleable: {
      glossary: glossary.data?.items.some((item) => !item.pruned) ?? false,
      readAloud: hasOutput("audio"),
      quizzes: (quizzes.data?.quizzes?.quizzes.length ?? 0) > 0,
      signLanguage: hasAssignedVideos,
    },
    present: {
      captions: hasOutput("caption"),
      toc: (toc.data?.entries.length ?? 0) > 0,
      easyRead: hasOutput("easy-read"),
    },
  }
}

export function useAvailableExportFeatures(bookLabel: string): AvailableExportFeatures {
  return useAllProjectFeatures(bookLabel).toggleable
}
