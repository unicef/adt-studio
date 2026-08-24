import type { AdtImportedActivityReview } from "@adt/types"

export interface ImportedAdtSeedResult {
  label: string
  title: string
  sourceFileName: string | null
  createdAt: string
  coverBase64: string | null
  sourceLanguage: string
  outputLanguages: string[]
  runtimeFeatures: Record<string, boolean>
  pageCount: number
  catalogEntryCount: number
  glossaryEntryCount: number
  tocEntryCount: number
  translationLanguageCount: number
  recoveredHtmlEntryCount: number
  ignoredHtmlEntryCount: number
  contentChanged: boolean
}



export interface AdtImportInProgressMarker {
  version: 1
  createdAt: string
  sourceLabel: string
  sourceFileName: string | null
}


