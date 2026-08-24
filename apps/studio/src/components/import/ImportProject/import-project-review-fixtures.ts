/* eslint-disable lingui/no-unlocalized-strings -- Development-only archive metadata fixtures. */
import type { AdtBundleImportPreview, AnyImportPreview, ImportPreview } from "@/api/client"

export const IMPORT_REVIEW_STATES = [
  "empty",
  "reading",
  "project",
  "part",
  "adt-current",
  "adt-edited",
  "adt-legacy",
  "activities-validated",
  "activities-review",
  "activities-modal",
  "unsupported-current-guide",
  "unsupported-missing-guide",
  "archive-error",
  "oversized-error",
  "importing",
  "import-error",
] as const

export type ImportReviewState = (typeof IMPORT_REVIEW_STATES)[number]

export interface ImportProjectReviewFixture {
  state: ImportReviewState
  fileName?: string
  fileSize?: number
  preview?: AnyImportPreview
  previewLoading?: boolean
  previewError?: string
  importPending?: boolean
  importError?: string
  activityDecisions?: Record<string, string | null>
  activityDialogOpen?: boolean
}

const CURRENT_GUIDE = {
  status: "current" as const,
  currentVersion: 2,
  files: {
    agentsMd: { present: true, version: 2, current: true },
    claudeMd: { present: true, version: 2, current: true },
  },
  currentGuide: "<!-- adt-studio-agent-guide: 2 -->\n# ADT Studio editing guide",
  repairPrompt: "Repair this exported ADT using the attached validation report.",
  activityPrompt: null,
}

const MISSING_GUIDE = {
  ...CURRENT_GUIDE,
  status: "missing" as const,
  files: {
    agentsMd: { present: false, version: null, current: false },
    claudeMd: { present: false, version: null, current: false },
  },
  activityPrompt: "Classify the ambiguous activity pages and update the ADT activity inventory.",
}

const PROJECT_PREVIEW: ImportPreview = {
  label: "hyena-and-raven",
  title: "Hyena and Raven",
  authors: ["J. H. Meiring"],
  publisher: "African Storybook",
  languageCode: "en",
  pageCount: 18,
  hasSourcePdf: true,
  imageCount: 24,
  videoCount: 0,
  coverBase64: null,
  stages: {
    storyboard: { status: "done", stepCount: 2, doneCount: 2 },
    quizzes: { status: "done", stepCount: 1, doneCount: 1 },
    toc: { status: "done", stepCount: 1, doneCount: 1 },
  },
  validationError: null,
}

function makeAdtPreview(
  overrides: Partial<AdtBundleImportPreview> = {},
): AdtBundleImportPreview {
  return {
    isAdtBundle: true,
    legacyRecovery: false,
    label: "hyena-and-raven-imported",
    title: "Hyena and Raven",
    coverBase64: null,
    sourceLanguage: "en",
    outputLanguages: ["pt-BR", "fr"],
    runtimeFeatures: {
      readAloud: true,
      easyRead: true,
      signLanguage: false,
    },
    pageCount: 18,
    imageCount: 24,
    captionedImageCount: 24,
    glossaryEntryCount: 12,
    tocEntryCount: 18,
    translationLanguageCount: 2,
    contentChanged: false,
    exportComparisonStatus: "unchanged",
    featureRecovery: {
      storyboard: "recovered",
      captions: "recovered",
      glossary: "recovered",
      toc: "recovered",
      translate: "recovered",
      speech: "recovered",
      // Rebuilt from the catalog text plus the quiz page's answer key.
      quizzes: "recovered",
      // Baked into the published bundle, so the import cannot rebuild it.
      "easy-read": "needs-regeneration",
    },
    activityReview: {
      inventoryVersion: 2,
      items: [],
      needsReviewCount: 0,
      quizCount: 3,
      activityCount: 2,
      typeOptions: ["activity_quiz", "activity_matching", "activity_custom_external"],
    },
    compatibility: { supported: true, issues: [] },
    agentGuide: CURRENT_GUIDE,
    ...overrides,
  }
}

const REVIEW_ITEM: AdtBundleImportPreview["activityReview"]["items"][number] = {
  sectionId: "pg007_sec002",
  href: "page-007.html",
  declaredType: null,
  detectedType: null,
  suggestedType: "activity_matching",
  kind: "candidate",
  status: "needs-review",
  supportsStudioEditing: false,
  reasons: ["interactive-unmarked"],
  signals: ["drag-and-drop", "interactive-control"],
  validationErrors: [],
  textPreview: "Drag each animal to the matching description.",
  previewHtml: "<!doctype html><html><body><main id=\"content\"><section data-id=\"pg007_sec002\" data-section-type=\"activity\"><h1>Match the animals</h1><p>Drag each animal to the matching description.</p><button>Hyena</button><button>Raven</button></section></main></body></html>",
}

function activityPreview(): AdtBundleImportPreview {
  return makeAdtPreview({
    title: "English Standard 3",
    label: "english-standard-3-imported",
    pageCount: 72,
    outputLanguages: [],
    translationLanguageCount: 0,
    contentChanged: true,
    exportComparisonStatus: "changed",
    activityReview: {
      inventoryVersion: 2,
      items: [
        REVIEW_ITEM,
        {
          ...REVIEW_ITEM,
          sectionId: "pg014_sec001",
          href: "page-014.html",
          suggestedType: "activity_custom_external",
          textPreview: "Choose the words that complete each sentence.",
        },
      ],
      needsReviewCount: 2,
      quizCount: 6,
      activityCount: 28,
      typeOptions: ["activity_matching", "activity_fill_in_the_blank", "activity_custom_external"],
    },
    agentGuide: MISSING_GUIDE,
  })
}

function unsupportedPreview(missingGuide: boolean): AdtBundleImportPreview {
  return makeAdtPreview({
    title: "Edited publication needing repair",
    label: "edited-publication",
    contentChanged: true,
    exportComparisonStatus: "changed",
    compatibility: {
      supported: false,
      issues: [
        { code: "unsupported-asset-location", pageHref: "page-004.html", detail: "assets/photos/raven.png" },
        { code: "changed-page-structure", pageHref: "page-007.html" },
        { code: "unsupported-script", pageHref: "page-009.html", detail: "scripts/custom-activity.js" },
      ],
    },
    agentGuide: missingGuide ? MISSING_GUIDE : CURRENT_GUIDE,
  })
}

export function getImportProjectReviewFixture(value: string | null): ImportProjectReviewFixture | null {
  if (!value || !IMPORT_REVIEW_STATES.includes(value as ImportReviewState)) return null
  const state = value as ImportReviewState

  if (state === "empty") return { state }
  if (state === "reading") {
    return {
      state,
      fileName: "english-std-3-pb--2023-main.zip",
      fileSize: 48_500_000,
      previewLoading: true,
    }
  }
  if (state === "project") {
    return { state, fileName: "hyena-and-raven-project.zip", fileSize: 82_400_000, preview: PROJECT_PREVIEW }
  }
  if (state === "part") {
    return {
      state,
      fileName: "hyena-and-raven-pages-7-12.zip",
      fileSize: 18_700_000,
      preview: {
        isPart: true,
        label: "hyena-and-raven-part-7-12",
        sourceLabel: "hyena-and-raven",
        title: "Hyena and Raven",
        range: { startPage: 7, endPage: 12 },
        pageCount: 18,
        coverBase64: null,
      },
    }
  }
  if (state === "adt-current") {
    return { state, fileName: "Hyena and Raven-adt.zip", fileSize: 16_300_000, preview: makeAdtPreview() }
  }
  if (state === "adt-edited") {
    return {
      state,
      fileName: "Hyena and Raven-adt-edited.zip",
      fileSize: 17_100_000,
      preview: makeAdtPreview({ contentChanged: true, exportComparisonStatus: "changed" }),
    }
  }
  if (state === "adt-legacy") {
    return {
      state,
      fileName: "Hyena and Raven-legacy-export.zip",
      fileSize: 14_800_000,
      preview: makeAdtPreview({
        legacyRecovery: true,
        exportComparisonStatus: "unavailable",
        outputLanguages: [],
        translationLanguageCount: 0,
      }),
    }
  }
  if (state === "activities-validated") {
    return {
      state,
      fileName: "English Standard 3-validated.zip",
      fileSize: 96_400_000,
      preview: makeAdtPreview({
        title: "English Standard 3",
        pageCount: 72,
        activityReview: {
          inventoryVersion: 2,
          items: [],
          needsReviewCount: 0,
          quizCount: 6,
          activityCount: 28,
          typeOptions: ["activity_quiz", "activity_matching"],
        },
      }),
    }
  }
  if (state === "activities-review" || state === "activities-modal") {
    return {
      state,
      fileName: "english-std-3-pb--2023-main.zip",
      fileSize: 96_400_000,
      preview: activityPreview(),
      activityDialogOpen: state === "activities-modal",
    }
  }
  if (
    state === "unsupported-current-guide"
    || state === "unsupported-missing-guide"
  ) {
    return {
      state,
      fileName: "Hyena and Raven-adt-external-edit.zip",
      fileSize: 17_900_000,
      preview: {
        ...unsupportedPreview(state === "unsupported-missing-guide"),
      },
    }
  }
  if (state === "archive-error") {
    return {
      state,
      fileName: "damaged-export.zip",
      fileSize: 7_300,
      previewError: "Invalid ZIP file: central directory is missing",
    }
  }
  if (state === "oversized-error") {
    return {
      state,
      fileName: "large-publication.zip",
      fileSize: 612_000_000,
      previewError: "Archive exceeds the size limit",
    }
  }
  if (state === "importing") {
    return {
      state,
      fileName: "Hyena and Raven-adt.zip",
      fileSize: 16_300_000,
      preview: makeAdtPreview(),
      importPending: true,
    }
  }
  return {
    state,
    fileName: "Hyena and Raven-adt.zip",
    fileSize: 16_300_000,
    preview: makeAdtPreview(),
    importError: "Project database could not be created",
  }
}
