import { useBookRun } from "./use-book-run"
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
  toggleable: AvailableExportFeatures
  present: {
    captions: boolean
    toc: boolean
    easyRead: boolean
  }
}

export function useAllProjectFeatures(bookLabel: string): AllProjectFeatures {
  const { stageState } = useBookRun()
  const { data: signLanguageData } = useSignLanguageVideos(bookLabel)
  const hasAssignedVideos = signLanguageData?.videos?.some((v) => v.sectionId !== null) ?? false

  return {
    toggleable: {
      glossary: stageState("glossary") === "done",
      readAloud: stageState("speech") === "done",
      quizzes: stageState("quizzes") === "done",
      signLanguage: hasAssignedVideos,
    },
    present: {
      captions: stageState("captions") === "done",
      toc: stageState("toc") === "done",
      easyRead: stageState("easy-read") === "done",
    },
  }
}

export function useAvailableExportFeatures(bookLabel: string): AvailableExportFeatures {
  return useAllProjectFeatures(bookLabel).toggleable
}
