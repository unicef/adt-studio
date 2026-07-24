import { msg } from "@lingui/core/macro"
import type { I18n, MessageDescriptor } from "@lingui/core"

export const SETTINGS_TAB_MESSAGE: Record<string, MessageDescriptor> = {
  general: msg`General`,
  overview: msg`Overview`,
  "api-keys": msg`API Keys`,
  "global-prompts": msg`Global Prompts`,
  fonts: msg`Fonts`,
  "image-processing": msg`Image Processing`,
  "section-types": msg`Section Types`,
  "container-types": msg`Container Types`,
  "text-types": msg`Text Types`,
  "metadata-prompt": msg`Metadata Prompt`,
  prompt: msg`Extraction Prompt`,
  "meaningfulness-prompt": msg`Meaningfulness Prompt`,
  "cropping-prompt": msg`Cropping Prompt`,
  "segmentation-prompt": msg`Segmentation Prompt`,
  "book-summary-prompt": msg`Summary Prompt`,
  "sectioning-prompt": msg`Sectioning Prompt`,
  "refinement-prompt": msg`Refinement Prompt`,
  "rendering-prompt": msg`AI Rendering`,
  "rendering-template": msg`Template Rendering`,
  "activity-prompts": msg`Activity Rendering`,
  "image-generation": msg`Image Generation`,
  "visual-review-prompt": msg`Visual Review`,
  "quiz-prompt": msg`Quiz Prompt`,
  "glossary-prompt": msg`Glossary Prompt`,
  "caption-prompt": msg`Caption Prompt`,
  languages: msg`Languages`,
  "translation-prompt": msg`Translation Prompt`,
  "translation-review": msg`Translation Review`,
  "image-translation": msg`Image Translation`,
  speech: msg`Speech Settings`,
  "speech-prompts": msg`Speech Prompts`,
  voices: msg`Voices`,
  "toc-prompt": msg`Generation Prompt`,
  "easy-read-prompt": msg`Easy Read Prompt`,
}

export function getSettingsTabs(
  slug: string,
  i18n: I18n,
  showOverviewTab: boolean,
): { key: string; label: string }[] | undefined {
  const tabs: Record<string, { key: string; label: string }[]> = {
    book: [
      { key: "general", label: i18n._(SETTINGS_TAB_MESSAGE["api-keys"]) },
      { key: "global-prompts", label: i18n._(SETTINGS_TAB_MESSAGE["global-prompts"]) },
    ],
    extract: [
      { key: "general", label: i18n._(SETTINGS_TAB_MESSAGE.general) },
      { key: "metadata-prompt", label: i18n._(SETTINGS_TAB_MESSAGE["metadata-prompt"]) },
      { key: "meaningfulness-prompt", label: i18n._(SETTINGS_TAB_MESSAGE["meaningfulness-prompt"]) },
      { key: "cropping-prompt", label: i18n._(SETTINGS_TAB_MESSAGE["cropping-prompt"]) },
      { key: "segmentation-prompt", label: i18n._(SETTINGS_TAB_MESSAGE["segmentation-prompt"]) },
    ],
    sectioning: [
      { key: "section-types", label: i18n._(SETTINGS_TAB_MESSAGE["section-types"]) },
      { key: "sectioning-prompt", label: i18n._(SETTINGS_TAB_MESSAGE["sectioning-prompt"]) },
      { key: "refinement-prompt", label: i18n._(SETTINGS_TAB_MESSAGE["refinement-prompt"]) },
      { key: "container-types", label: i18n._(SETTINGS_TAB_MESSAGE["container-types"]) },
      { key: "text-types", label: i18n._(SETTINGS_TAB_MESSAGE["text-types"]) },
    ],
    storyboard: [
      { key: "general", label: i18n._(SETTINGS_TAB_MESSAGE.general) },
      { key: "fonts", label: i18n._(SETTINGS_TAB_MESSAGE.fonts) },
      { key: "rendering-prompt", label: i18n._(SETTINGS_TAB_MESSAGE["rendering-prompt"]) },
      { key: "rendering-template", label: i18n._(SETTINGS_TAB_MESSAGE["rendering-template"]) },
      { key: "activity-prompts", label: i18n._(SETTINGS_TAB_MESSAGE["activity-prompts"]) },
      { key: "image-generation", label: i18n._(SETTINGS_TAB_MESSAGE["image-generation"]) },
      { key: "visual-review-prompt", label: i18n._(SETTINGS_TAB_MESSAGE["visual-review-prompt"]) },
    ],
    quizzes: [
      { key: "general", label: i18n._(SETTINGS_TAB_MESSAGE.general) },
      { key: "prompt", label: i18n._(SETTINGS_TAB_MESSAGE["quiz-prompt"]) },
    ],
    glossary: [
      { key: "general", label: i18n._(SETTINGS_TAB_MESSAGE["glossary-prompt"]) },
    ],
    toc: [
      { key: "general", label: i18n._(SETTINGS_TAB_MESSAGE["toc-prompt"]) },
    ],
    "easy-read": [
      { key: "general", label: i18n._(SETTINGS_TAB_MESSAGE["easy-read-prompt"]) },
    ],
    captions: [
      { key: "general", label: i18n._(SETTINGS_TAB_MESSAGE["caption-prompt"]) },
    ],
    translate: [
      { key: "general", label: i18n._(SETTINGS_TAB_MESSAGE.languages) },
      { key: "prompt", label: i18n._(SETTINGS_TAB_MESSAGE["translation-prompt"]) },
      { key: "translation-review", label: i18n._(SETTINGS_TAB_MESSAGE["translation-review"]) },
      { key: "image-translation", label: i18n._(SETTINGS_TAB_MESSAGE["image-translation"]) },
    ],
    speech: [
      { key: "general", label: i18n._(SETTINGS_TAB_MESSAGE.speech) },
      { key: "speech-prompts", label: i18n._(SETTINGS_TAB_MESSAGE["speech-prompts"]) },
      { key: "voices", label: i18n._(SETTINGS_TAB_MESSAGE.voices) },
    ],
    validation: [
      { key: "general", label: i18n._(msg`Accessibility`) },
      { key: "reviewer-checklist", label: i18n._(msg`Reviewer Checklist`) },
    ],
  }
  const stageTabs = tabs[slug]
  if (!stageTabs) return undefined
  if (!showOverviewTab) return stageTabs
  return [{ key: "overview", label: i18n._(SETTINGS_TAB_MESSAGE.overview) }, ...stageTabs]
}

export function getSettingsTabLabel(stage: string, tabKey: string, i18n: I18n): string {
  const tabs = getSettingsTabs(stage, i18n, false)
  return tabs?.find((t) => t.key === tabKey)?.label ?? tabKey
}
