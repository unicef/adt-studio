import { useState, useEffect } from "react"
import { Link } from "@tanstack/react-router"
import { Lock, ArrowLeft, ChevronDown } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { useQuery } from "@tanstack/react-query"
import type { StageName } from "@adt/types"
import { DEFAULT_TRANSLATION_EVALUATION_JUDGE_MODEL } from "@adt/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ModelSelect, OPENAI_TTS_MODELS, AZURE_TTS_MODELS, GEMINI_TTS_MODELS, IMAGE_MODEL_GROUPS, LLM_MODEL_GROUPS } from "@/components/pipeline/components/ModelSelect"
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config"
import { useActiveConfig } from "@/hooks/use-debug"
import { api } from "@/api/client"
import { PromptViewer } from "@/components/pipeline/components/PromptViewer"
import { useStageSettingsBar } from "@/hooks/use-stage-settings-bar"
import { useDirtyTabTracker } from "@/hooks/use-settings-dirty-tabs"
import { LanguagePicker } from "@/components/LanguagePicker"
import { useBook } from "@/hooks/use-books"
import { useStepConfig } from "@/hooks/use-step-config"
import { normalizeLocale } from "@/lib/languages"
import { resolveSpeechProviderForLanguage } from "@/lib/speech-routing"
import { SpeechPromptsEditor } from "./components/SpeechPromptsEditor"
import { VoiceMappingsEditor } from "./components/VoiceMappingsEditor"
import { SelectImagesDialog } from "./components/SelectImagesDialog"
import { WordHighlightPreview } from "./components/WordHighlightPreview"
import { useLingui } from "@lingui/react/macro"
import { displayLang } from "./lib/display-lang"

type TranslationEvaluationIssueType =
  | "meaning"
  | "fluency"
  | "terminology"
  | "omission-or-addition"
  | "formatting"
  | "context"
  | "other"
type TranslationEvaluationSeverity = "low" | "medium" | "high"
type TranslationReviewStyle = "light" | "standard" | "detailed" | "custom"

const DEFAULT_TRANSLATION_EVALUATION_MAX_RETRIES = 3
const DEFAULT_TRANSLATION_EVALUATION_TEMPERATURE = 0
const DEFAULT_TRANSLATION_EVALUATION_SEVERITY_THRESHOLD: TranslationEvaluationSeverity = "medium"
// eslint-disable-next-line lingui/no-unlocalized-strings -- LLM judge prompt instructions, not interface copy.
const DEFAULT_TRANSLATION_EVALUATION_JUDGE_INSTRUCTIONS = `
Review the translated text-catalog entries against the source entries.

Use the full page context and book metadata when judging each entry.
Decide whether each translation is acceptable overall.
Use these criteria:
- preserve meaning faithfully
- sound fluent and natural in the target language
- keep important terminology correct and consistent
- avoid important omissions or unsupported additions
- preserve meaningful formatting markers and placeholders when they affect meaning

Return a concise rationale for entries that need attention.
When an entry needs attention, return suggested_text only when a clear correction is possible.
Suggested text must be a complete replacement translation, not a partial edit.
Suggested text must preserve every source meaning unit, including roles, names, numbers, actions, quoted text, and important modifiers.
For terminology-only issues, make the smallest possible edit that fixes the terminology while preserving the rest of the translation.
Treat existing translations on the page as local terminology memory. Repeated source roles, names, objects, and domain terms should keep the same target-language term unless user guidance says otherwise.
For terminology-only fixes, preserve the current translation's structure, role order, punctuation, and wording as much as possible.
Do not fix one issue by omitting, weakening, or changing another part of the source meaning.
Only return suggested_text if you would mark that suggested replacement acceptable under the same review criteria.
`.trim()

const TRANSLATION_REVIEW_ISSUE_TYPES: TranslationEvaluationIssueType[] = [
  "meaning",
  "fluency",
  "terminology",
  "omission-or-addition",
  "formatting",
  "context",
  "other",
]

const VISIBLE_TRANSLATION_REVIEW_ISSUE_TYPES: TranslationEvaluationIssueType[] = TRANSLATION_REVIEW_ISSUE_TYPES.filter((issueType) => issueType !== "other")
const DEFAULT_TRANSLATION_EVALUATION_ISSUE_TYPES = TRANSLATION_REVIEW_ISSUE_TYPES
const TRANSLATION_REVIEW_SEVERITIES: TranslationEvaluationSeverity[] = ["low", "medium", "high"]
const TRANSLATION_REVIEW_STYLES: Exclude<TranslationReviewStyle, "custom">[] = ["light", "standard", "detailed"]
const TRANSLATION_REVIEW_STYLE_SETTINGS: Record<Exclude<TranslationReviewStyle, "custom">, {
  strictness: "lenient" | "balanced" | "strict"
  severity: TranslationEvaluationSeverity
}> = {
  light: { strictness: "lenient", severity: "medium" },
  standard: { strictness: "balanced", severity: "medium" },
  detailed: { strictness: "strict", severity: "low" },
}
const DEFAULT_TRANSLATION_EVALUATION_CONTEXT_OPTIONS = {
  book_metadata: true,
  visible_page_entries: true,
  source_language: true,
  target_language: true,
}

const resolveTranslationReviewStyle = (
  strictness: "lenient" | "balanced" | "strict",
  severity: TranslationEvaluationSeverity,
): TranslationReviewStyle => {
  const match = TRANSLATION_REVIEW_STYLES.find((style) => {
    const settings = TRANSLATION_REVIEW_STYLE_SETTINGS[style]
    return settings.strictness === strictness && settings.severity === severity
  })
  return match ?? "custom"
}

export function LanguageSettings({ bookLabel, tab = "general", stageSlug = "translate" }: { bookLabel: string; headerTarget?: HTMLDivElement | null; tab?: string; stageSlug?: string }) {
  const isSpeechStage = stageSlug === "speech"
  const captionedImagesQuery = useQuery({
    queryKey: ["books", bookLabel, "captioned-images"],
    queryFn: () => api.listCaptionedImages(bookLabel),
    enabled: !isSpeechStage,
  })
  const { t } = useLingui()
  const { data: book } = useBook(bookLabel)
  const { data: bookConfigData } = useBookConfig(bookLabel)
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const updateConfig = useUpdateBookConfig()

  const [outputLanguages, setOutputLanguages] = useState<Set<string>>(new Set())
  const [promptDraft, setPromptDraft] = useState<string | null>(null)

  // Translation review settings
  const [reviewEnabled, setReviewEnabled] = useState(true)
  const [reviewModel, setReviewModel] = useState(DEFAULT_TRANSLATION_EVALUATION_JUDGE_MODEL)
  const [reviewRetries, setReviewRetries] = useState(String(DEFAULT_TRANSLATION_EVALUATION_MAX_RETRIES))
  const [reviewTemperature, setReviewTemperature] = useState(String(DEFAULT_TRANSLATION_EVALUATION_TEMPERATURE))
  const [reviewStrictness, setReviewStrictness] = useState<"lenient" | "balanced" | "strict">("balanced")
  const [reviewSeverityThreshold, setReviewSeverityThreshold] = useState<TranslationEvaluationSeverity>(DEFAULT_TRANSLATION_EVALUATION_SEVERITY_THRESHOLD)
  const [reviewIssueTypes, setReviewIssueTypes] = useState<Set<TranslationEvaluationIssueType>>(
    () => new Set(DEFAULT_TRANSLATION_EVALUATION_ISSUE_TYPES),
  )
  const [reviewGenerateSuggestions, setReviewGenerateSuggestions] = useState(true)
  const [reviewOnlySuggestWhenConfident, setReviewOnlySuggestWhenConfident] = useState(true)
  const [reviewIncludeBookMetadata, setReviewIncludeBookMetadata] = useState(DEFAULT_TRANSLATION_EVALUATION_CONTEXT_OPTIONS.book_metadata)
  const [reviewIncludeSourceLanguage, setReviewIncludeSourceLanguage] = useState(DEFAULT_TRANSLATION_EVALUATION_CONTEXT_OPTIONS.source_language)
  const [reviewIncludeTargetLanguage, setReviewIncludeTargetLanguage] = useState(DEFAULT_TRANSLATION_EVALUATION_CONTEXT_OPTIONS.target_language)
  const [reviewTargetAudience, setReviewTargetAudience] = useState("")
  const [reviewStyleGuidance, setReviewStyleGuidance] = useState("")
  const [reviewTerminologyGuidance, setReviewTerminologyGuidance] = useState("")
  const [reviewAdditionalGuidance, setReviewAdditionalGuidance] = useState("")
  const [reviewJudgeInstructions, setReviewJudgeInstructions] = useState(DEFAULT_TRANSLATION_EVALUATION_JUDGE_INSTRUCTIONS)
  const [advancedReviewOpen, setAdvancedReviewOpen] = useState(false)

  // Image translation
  const [imageTranslationEnabled, setImageTranslationEnabled] = useState(false)
  const [imageModel, setImageModel] = useState("")
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([])
  const [imagePromptDraft, setImagePromptDraft] = useState<string | null>(null)
  const [showImagePicker, setShowImagePicker] = useState(false)

  // Speech settings
  const [speechModel, setSpeechModel] = useState("")
  const [format, setFormat] = useState("")
  const [defaultProvider, setDefaultProvider] = useState("openai")
  const [openaiModel, setOpenaiModel] = useState("")
  const [openaiLanguages, setOpenaiLanguages] = useState("")
  const [azureModel, setAzureModel] = useState("")
  const [azureLanguages, setAzureLanguages] = useState("")
  const [geminiModel, setGeminiModel] = useState("")
  const [geminiLanguages, setGeminiLanguages] = useState("")
  const [bitRate, setBitRate] = useState("")
  const [sampleRate, setSampleRate] = useState("")
  const [geminiTemperature, setGeminiTemperature] = useState("")
  const [geminiSeed, setGeminiSeed] = useState("")
  const [batchByPage, setBatchByPage] = useState(false)
  const [wordHighlighting, setWordHighlighting] = useState(false)
  const [easyReadTts, setEasyReadTts] = useState(false)
  const [excludedCategories, setExcludedCategories] = useState<Set<string>>(new Set())

  const { markedTabs, markTab, resetMarkedTabs } = useDirtyTabTracker()
  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const markDirty = (field: string) => {
    setDirty((prev) => ({ ...prev, [field]: true }))
    markTab(tab)
  }

  const merged = activeConfigData?.merged as Record<string, unknown> | undefined
  const translation = useStepConfig(merged, "translation", markDirty)
  const imageTranslation = useStepConfig(merged, "image_translation", markDirty)

  const configuredEditingLanguage = merged?.editing_language as string | undefined
  const bookLanguage = book?.languageCode ?? book?.metadata?.language_code ?? null
  const baseLanguage = normalizeLocale(configuredEditingLanguage ?? bookLanguage ?? "en")

  useEffect(() => {
    if (!activeConfigData) return
    const m = activeConfigData.merged as Record<string, unknown>
    if (Array.isArray(m.output_languages)) {
      const normalized = (m.output_languages as string[]).map((code) => normalizeLocale(code))
      setOutputLanguages(new Set(normalized))
    }
    if (m.image_translation && typeof m.image_translation === "object") {
      const it = m.image_translation as Record<string, unknown>
      setImageTranslationEnabled(it.enabled === true)
      setImageModel(typeof it.image_model === "string" ? it.image_model : "")
      setSelectedImageIds(Array.isArray(it.selected_image_ids) ? (it.selected_image_ids as string[]) : [])
    } else {
      setImageTranslationEnabled(false)
      setImageModel("")
      setSelectedImageIds([])
    }
    if (m.translation_evaluation && typeof m.translation_evaluation === "object") {
      const te = m.translation_evaluation as Record<string, unknown>
      setReviewEnabled(te.enable_translation_evaluation !== false)
      setReviewModel(typeof te.judge_model === "string" ? te.judge_model : DEFAULT_TRANSLATION_EVALUATION_JUDGE_MODEL)
      setReviewRetries(typeof te.max_retries === "number" ? String(te.max_retries) : String(DEFAULT_TRANSLATION_EVALUATION_MAX_RETRIES))
      setReviewTemperature(typeof te.temperature === "number" ? String(te.temperature) : String(DEFAULT_TRANSLATION_EVALUATION_TEMPERATURE))
      setReviewStrictness(te.strictness === "lenient" || te.strictness === "strict" ? te.strictness : "balanced")
      setReviewSeverityThreshold(
        te.severity_threshold === "low" || te.severity_threshold === "high" ? te.severity_threshold : DEFAULT_TRANSLATION_EVALUATION_SEVERITY_THRESHOLD,
      )
      setReviewIssueTypes(new Set(
        Array.isArray(te.issue_types)
          ? (te.issue_types as string[]).filter((issueType): issueType is TranslationEvaluationIssueType =>
            TRANSLATION_REVIEW_ISSUE_TYPES.includes(issueType as TranslationEvaluationIssueType),
          )
          : DEFAULT_TRANSLATION_EVALUATION_ISSUE_TYPES,
      ))
      setReviewGenerateSuggestions(te.generate_suggestions !== false)
      setReviewOnlySuggestWhenConfident(te.only_suggest_when_confident !== false)
      const context = te.context && typeof te.context === "object" ? te.context as Record<string, unknown> : {}
      setReviewIncludeBookMetadata(context.book_metadata !== false)
      setReviewIncludeSourceLanguage(context.source_language !== false)
      setReviewIncludeTargetLanguage(context.target_language !== false)
      setReviewTargetAudience(typeof te.target_audience === "string" ? te.target_audience : "")
      setReviewStyleGuidance(typeof te.style_guidance === "string" ? te.style_guidance : "")
      setReviewTerminologyGuidance(typeof te.terminology_guidance === "string" ? te.terminology_guidance : "")
      setReviewAdditionalGuidance(typeof te.additional_guidance === "string" ? te.additional_guidance : "")
      setReviewJudgeInstructions(typeof te.judge_instructions === "string" ? te.judge_instructions : DEFAULT_TRANSLATION_EVALUATION_JUDGE_INSTRUCTIONS)
    } else {
      setReviewEnabled(true)
      setReviewModel(DEFAULT_TRANSLATION_EVALUATION_JUDGE_MODEL)
      setReviewRetries(String(DEFAULT_TRANSLATION_EVALUATION_MAX_RETRIES))
      setReviewTemperature(String(DEFAULT_TRANSLATION_EVALUATION_TEMPERATURE))
      setReviewStrictness("balanced")
      setReviewSeverityThreshold(DEFAULT_TRANSLATION_EVALUATION_SEVERITY_THRESHOLD)
      setReviewIssueTypes(new Set(DEFAULT_TRANSLATION_EVALUATION_ISSUE_TYPES))
      setReviewGenerateSuggestions(true)
      setReviewOnlySuggestWhenConfident(true)
      setReviewIncludeBookMetadata(true)
      setReviewIncludeSourceLanguage(true)
      setReviewIncludeTargetLanguage(true)
      setReviewTargetAudience("")
      setReviewStyleGuidance("")
      setReviewTerminologyGuidance("")
      setReviewAdditionalGuidance("")
      setReviewJudgeInstructions(DEFAULT_TRANSLATION_EVALUATION_JUDGE_INSTRUCTIONS)
    }
    const speech =
      m.speech && typeof m.speech === "object"
        ? (m.speech as Record<string, unknown>)
        : null
    setGeminiTemperature(
      typeof speech?.temperature === "number" ? String(speech.temperature) : ""
    )
    setGeminiSeed(typeof speech?.seed === "number" ? String(speech.seed) : "")
    setBatchByPage(speech?.batch_by_page === true)
    if (speech) {
      const s = speech
      if (s.model) setSpeechModel(String(s.model))
      if (s.format) setFormat(String(s.format))
      if (s.default_provider) setDefaultProvider(String(s.default_provider))
      if (s.bit_rate) setBitRate(String(s.bit_rate))
      if (s.sample_rate) setSampleRate(String(s.sample_rate))
      setWordHighlighting(s.word_highlighting === true)
      setExcludedCategories(
        new Set(Array.isArray(s.excluded_categories) ? (s.excluded_categories as string[]) : [])
      )
      if (s.providers && typeof s.providers === "object") {
        const providers = s.providers as Record<string, Record<string, unknown>>
        if (providers.openai) {
          if (providers.openai.model) setOpenaiModel(String(providers.openai.model))
          if (Array.isArray(providers.openai.languages)) setOpenaiLanguages((providers.openai.languages as string[]).join(", "))
        }
        if (providers.azure) {
          if (providers.azure.model) setAzureModel(String(providers.azure.model))
          if (Array.isArray(providers.azure.languages)) setAzureLanguages((providers.azure.languages as string[]).join(", "))
        }
        if (providers.gemini) {
          if (providers.gemini.model) setGeminiModel(String(providers.gemini.model))
          if (Array.isArray(providers.gemini.languages)) setGeminiLanguages((providers.gemini.languages as string[]).join(", "))
        }
      }
    }
  }, [activeConfigData])

  const shouldWrite = (field: string) =>
    dirty[field] || (bookConfigData?.config && field in bookConfigData.config)

  const parseNonNegativeInt = (value: string, fallback: number) => {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
  }

  const parseTemperature = (value: string) => {
    const parsed = Number.parseFloat(value)
    if (!Number.isFinite(parsed)) return DEFAULT_TRANSLATION_EVALUATION_TEMPERATURE
    return Math.min(2, Math.max(0, parsed))
  }

  const buildOverrides = () => {
    const overrides: Record<string, unknown> = {}
    if (bookConfigData?.config) Object.assign(overrides, bookConfigData.config)

    if (shouldWrite("translation")) {
      const existing = (bookConfigData?.config?.translation ?? {}) as Record<string, unknown>
      overrides.translation = { ...existing, ...translation.configOverrides }
    }
    if (shouldWrite("output_languages")) {
      const normalized = Array.from(outputLanguages).map((code) => normalizeLocale(code))
      overrides.output_languages = normalized.length > 0 ? normalized : undefined
    }
    if (shouldWrite("image_translation")) {
      const existing = (bookConfigData?.config?.image_translation ?? {}) as Record<string, unknown>
      overrides.image_translation = {
        ...existing,
        ...imageTranslation.configOverrides,
        enabled: imageTranslationEnabled,
        image_model: imageModel.trim() || undefined,
        selected_image_ids: selectedImageIds.length > 0 ? selectedImageIds : undefined,
      }
    }
    if (shouldWrite("speech")) {
      const existing = (bookConfigData?.config?.speech ?? {}) as Record<string, unknown>
      const openaiLangs = openaiLanguages.split(",").map((s) => s.trim()).filter(Boolean)
      const azureLangs = azureLanguages.split(",").map((s) => s.trim()).filter(Boolean)
      const geminiLangs = geminiLanguages.split(",").map((s) => s.trim()).filter(Boolean)
      const providers: Record<string, unknown> = {}
      if (openaiModel.trim() || openaiLangs.length > 0) {
        providers.openai = {
          model: openaiModel.trim() || undefined,
          languages: openaiLangs.length > 0 ? openaiLangs : undefined,
        }
      }
      if (azureModel.trim() || azureLangs.length > 0) {
        providers.azure = {
          model: azureModel.trim() || undefined,
          languages: azureLangs.length > 0 ? azureLangs : undefined,
        }
      }
      if (geminiModel.trim() || geminiLangs.length > 0) {
        providers.gemini = {
          model: geminiModel.trim() || undefined,
          languages: geminiLangs.length > 0 ? geminiLangs : undefined,
        }
      }
      // Guard the Gemini sampling inputs against values the SpeechConfig schema
      // rejects — an out-of-range value would be written to config.yaml and then
      // make AppConfig.parse throw on the next load, breaking the book. Clamp
      // temperature to the schema's [0, 2]; seed must be a finite integer.
      // Invalid/blank → omit, which disables that param (Gemini's own default).
      const tempRaw = Number(geminiTemperature.trim())
      const seedRaw = Number(geminiSeed.trim())
      overrides.speech = {
        ...existing,
        model: speechModel.trim() || undefined,
        format: format.trim() || undefined,
        default_provider: defaultProvider || undefined,
        providers: Object.keys(providers).length > 0 ? providers : undefined,
        bit_rate: bitRate.trim() || undefined,
        sample_rate: sampleRate.trim() ? Number(sampleRate.trim()) : undefined,
        temperature: geminiTemperature.trim() && Number.isFinite(tempRaw) ? Math.min(2, Math.max(0, tempRaw)) : undefined,
        seed: geminiSeed.trim() && Number.isFinite(seedRaw) ? Math.trunc(seedRaw) : undefined,
        batch_by_page: batchByPage || undefined,
        word_highlighting: wordHighlighting,
        excluded_categories: Array.from(excludedCategories),
      }
    }
    if (shouldWrite("translation_evaluation")) {
      const existing = {
        ...((bookConfigData?.config?.translation_evaluation ?? {}) as Record<string, unknown>),
      }
      delete existing.batch_size
      const selectedIssueTypes = Array.from(reviewIssueTypes)
      const issueTypes = selectedIssueTypes.includes("other")
        ? selectedIssueTypes
        : [...selectedIssueTypes, "other" as const]
      overrides.translation_evaluation = {
        ...existing,
        enable_translation_evaluation: reviewEnabled,
        judge_model: reviewModel.trim() || DEFAULT_TRANSLATION_EVALUATION_JUDGE_MODEL,
        max_retries: parseNonNegativeInt(reviewRetries, DEFAULT_TRANSLATION_EVALUATION_MAX_RETRIES),
        temperature: parseTemperature(reviewTemperature),
        strictness: reviewStrictness,
        severity_threshold: reviewSeverityThreshold,
        issue_types: issueTypes.length > 0 ? issueTypes : DEFAULT_TRANSLATION_EVALUATION_ISSUE_TYPES,
        generate_suggestions: reviewGenerateSuggestions,
        only_suggest_when_confident: reviewOnlySuggestWhenConfident,
        context: {
          book_metadata: reviewIncludeBookMetadata,
          visible_page_entries: true,
          source_language: reviewIncludeSourceLanguage,
          target_language: reviewIncludeTargetLanguage,
        },
        judge_instructions: reviewJudgeInstructions.trim() || DEFAULT_TRANSLATION_EVALUATION_JUDGE_INSTRUCTIONS,
        additional_guidance: reviewAdditionalGuidance.trim() || undefined,
        target_audience: reviewTargetAudience.trim() || undefined,
        style_guidance: reviewStyleGuidance.trim() || undefined,
        terminology_guidance: reviewTerminologyGuidance.trim() || undefined,
      }
    }
    return overrides
  }

  const toggleLanguage = (code: string) => {
    const normalizedCode = normalizeLocale(code)
    // Don't add the base language — it's always included implicitly
    if (normalizedCode === baseLanguage) return
    setOutputLanguages((prev) => {
      const next = new Set(prev)
      if (next.has(normalizedCode)) next.delete(normalizedCode)
      else next.add(normalizedCode)
      return next
    })
    markDirty("output_languages")
  }

  const save = async () => {
    const promptSaves: Promise<unknown>[] = []
    if (promptDraft != null) promptSaves.push(api.updatePrompt("translation", promptDraft, bookLabel))
    if (imagePromptDraft != null) promptSaves.push(api.updatePrompt("image_translation", imagePromptDraft, bookLabel))
    if (promptSaves.length > 0) await Promise.all(promptSaves)

    await updateConfig.mutateAsync({ label: bookLabel, config: buildOverrides() })
    setDirty({})
    setPromptDraft(null)
    setImagePromptDraft(null)
    resetMarkedTabs()
  }

  const reviewStyle = resolveTranslationReviewStyle(reviewStrictness, reviewSeverityThreshold)
  const setReviewStyle = (style: Exclude<TranslationReviewStyle, "custom">) => {
    const settings = TRANSLATION_REVIEW_STYLE_SETTINGS[style]
    setReviewStrictness(settings.strictness)
    setReviewSeverityThreshold(settings.severity)
    markDirty("translation_evaluation")
  }

  const mainSaveTab =
    tab === "general" ||
    tab === "prompt" ||
    tab === "speech" ||
    tab === "image-translation" ||
    tab === "translation-review"
  const dirtyTabs = [
    ...markedTabs,
    ...(promptDraft != null ? ["prompt"] : []),
    ...(imagePromptDraft != null ? ["image-translation"] : []),
  ].filter((tabKey, i, all) => all.indexOf(tabKey) === i)
  useStageSettingsBar({
    stage: stageSlug as StageName,
    bookLabel,
    dirty: mainSaveTab && dirtyTabs.length > 0,
    dirtyTabs,
    saving: updateConfig.isPending,
    save,
  })

  return (
    <div className={tab === "prompt" ? "h-full max-w-4xl" : "p-4 max-w-2xl space-y-6"}>
      {tab === "general" && !isSpeechStage && (
        <div className="space-y-4">
          {/* Base language (non-removable) */}
          <div>
            <Label className="text-xs">{t`Base Language`}</Label>
            <div className="mt-1.5">
              <Badge variant="secondary" className="gap-1.5 text-xs font-normal">
                <Lock className="h-3 w-3 text-muted-foreground" />
                {displayLang(baseLanguage)}
                <span className="text-muted-foreground">({baseLanguage})</span>
              </Badge>
            </div>
          </div>

          {/* Additional output languages */}
          <LanguagePicker
            selected={outputLanguages}
            onSelect={toggleLanguage}
            multiple
            label={t`Additional Languages`}
            hint={t`Add languages to translate the book content into.`}
          />
        </div>
      )}

      {tab === "prompt" && (
        <PromptViewer
          promptName="translation"
          bookLabel={bookLabel}
          title={t`Translation Prompt`}
          description={t`The prompt template used to translate text catalog entries.`}
          model={translation.model}
          onModelChange={translation.onModelChange}
          maxRetries={translation.maxRetries}
          onMaxRetriesChange={translation.onMaxRetriesChange}
          onContentChange={setPromptDraft}
          enabled={tab === "prompt"}
        />
      )}

      {tab === "translation-review" && !isSpeechStage && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold">{t`Translation Review`}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t`Choose how Studio reviews the visible translations when you click Review.`}
            </p>
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={reviewEnabled}
              onChange={(e) => {
                setReviewEnabled(e.target.checked)
                markDirty("translation_evaluation")
              }}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <div>
              <span className="text-sm font-medium">{t`Enable translation review`}</span>
              <p className="text-xs text-muted-foreground">
                {t`When enabled, Studio can evaluate saved translations with the configured judge.`}
              </p>
            </div>
          </label>

          <div className="space-y-5 border-t pt-5">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t`General Settings`}</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                {t`Use these settings for the common review workflow.`}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">{t`Review style`}</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {TRANSLATION_REVIEW_STYLES.map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setReviewStyle(style)}
                    className={`min-h-24 rounded-md border p-3 text-left transition-colors ${
                      reviewStyle === style
                        ? "border-black bg-black text-white"
                        : "border-border bg-white hover:bg-muted"
                    }`}
                  >
                    <span className="block text-sm font-semibold">
                      {style === "light" ? t`Light` : style === "standard" ? t`Standard` : t`Detailed`}
                    </span>
                    <span className={`mt-1 block text-xs leading-relaxed ${reviewStyle === style ? "text-white/80" : "text-muted-foreground"}`}>
                      {style === "light"
                        ? t`Flags clear meaning, missing-content, and formatting problems.`
                        : style === "standard"
                          ? t`Balances accuracy, fluency, terminology, and page context.`
                          : t`Flags smaller wording, tone, and consistency concerns.`}
                    </span>
                  </button>
                ))}
              </div>
              {reviewStyle === "custom" && (
                <p className="text-[11px] text-amber-700">
                  {t`Advanced settings currently use a custom review style.`}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs">{t`What should the review focus on?`}</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {VISIBLE_TRANSLATION_REVIEW_ISSUE_TYPES.map((issueType) => (
                  <label key={issueType} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={reviewIssueTypes.has(issueType)}
                      onChange={(e) => {
                        setReviewIssueTypes((current) => {
                          const next = new Set(current)
                          if (e.target.checked) next.add(issueType)
                          else next.delete(issueType)
                          return next
                        })
                        markDirty("translation_evaluation")
                      }}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span>
                      {issueType === "meaning"
                        ? t`Meaning is preserved`
                        : issueType === "fluency"
                          ? t`Translation sounds natural`
                          : issueType === "terminology"
                            ? t`Names and terms are consistent`
                            : issueType === "omission-or-addition"
                              ? t`Nothing important is missing or added`
                              : issueType === "formatting"
                                ? t`Formatting and placeholders are preserved`
                                : t`Page context is respected`}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={reviewGenerateSuggestions}
                onChange={(e) => {
                  setReviewGenerateSuggestions(e.target.checked)
                  markDirty("translation_evaluation")
                }}
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              <span>{t`Suggest improved translations when an entry needs attention`}</span>
            </label>

            <div className="space-y-1.5">
              <Label htmlFor="translation-review-audience" className="text-xs">{t`Audience or reading level`}</Label>
              <Input
                id="translation-review-audience"
                value={reviewTargetAudience}
                onChange={(e) => {
                  setReviewTargetAudience(e.target.value)
                  markDirty("translation_evaluation")
                }}
                placeholder={t`e.g. early readers`}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="translation-review-guidance" className="text-xs">{t`Guidance for this book`}</Label>
              <textarea
                id="translation-review-guidance"
                value={reviewAdditionalGuidance}
                onChange={(e) => {
                  setReviewAdditionalGuidance(e.target.value)
                  markDirty("translation_evaluation")
                }}
                className="min-h-20 w-full rounded-md border border-input bg-background p-3 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={t`Anything the judge should keep in mind for this book.`}
              />
            </div>
          </div>

          <div className="border-t pt-5">
            <button
              type="button"
              onClick={() => setAdvancedReviewOpen((open) => !open)}
              className="flex w-full items-center justify-between gap-3 text-left"
              aria-expanded={advancedReviewOpen}
            >
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t`Advanced Settings`}</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t`Open this section to tune the model, judge prompt, retry behavior, and exact review thresholds.`}
                </p>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${advancedReviewOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>

            {advancedReviewOpen && (
              <div className="mt-5 space-y-5">

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">{t`Judge model`}</Label>
              <ModelSelect
                value={reviewModel}
                onChange={(value) => {
                  setReviewModel(value)
                  markDirty("translation_evaluation")
                }}
                placeholder={DEFAULT_TRANSLATION_EVALUATION_JUDGE_MODEL}
                groups={LLM_MODEL_GROUPS}
                prefixProvider
                className="max-w-md"
                inputClassName="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="translation-review-retries" className="text-xs">{t`Retries`}</Label>
              <Input
                id="translation-review-retries"
                type="number"
                min={0}
                value={reviewRetries}
                onChange={(e) => {
                  setReviewRetries(e.target.value)
                  markDirty("translation_evaluation")
                }}
                className="h-9 max-w-32 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="translation-review-temperature" className="text-xs">{t`Temperature`}</Label>
              <Input
                id="translation-review-temperature"
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={reviewTemperature}
                onChange={(e) => {
                  setReviewTemperature(e.target.value)
                  markDirty("translation_evaluation")
                }}
                className="h-9 max-w-32 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t`Flag severity threshold`}</Label>
              <div className="flex flex-wrap gap-1">
                {TRANSLATION_REVIEW_SEVERITIES.map((severity) => (
                  <button
                    key={severity}
                    type="button"
                    onClick={() => {
                      setReviewSeverityThreshold(severity)
                      markDirty("translation_evaluation")
                    }}
                    className={`h-8 rounded px-2 text-xs font-medium ring-1 ${
                      reviewSeverityThreshold === severity
                        ? "bg-black text-white ring-black"
                        : "bg-white text-muted-foreground ring-border hover:bg-muted"
                    }`}
                  >
                    {severity === "low" ? t`Low` : severity === "medium" ? t`Medium` : t`High`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t`Review strictness`}</Label>
            <div className="flex flex-wrap gap-1">
              {(["lenient", "balanced", "strict"] as const).map((strictness) => (
                <button
                  key={strictness}
                  type="button"
                  onClick={() => {
                    setReviewStrictness(strictness)
                    markDirty("translation_evaluation")
                  }}
                  className={`h-8 rounded px-2 text-xs font-medium ring-1 ${
                    reviewStrictness === strictness
                      ? "bg-black text-white ring-black"
                      : "bg-white text-muted-foreground ring-border hover:bg-muted"
                  }`}
                >
                  {strictness === "lenient" ? t`Lenient` : strictness === "balanced" ? t`Balanced` : t`Strict`}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t`Strictness controls how aggressively the judge flags tone, fluency, terminology, and style concerns.`}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">{t`Issue types to check`}</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {TRANSLATION_REVIEW_ISSUE_TYPES.map((issueType) => (
                <label key={issueType} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={reviewIssueTypes.has(issueType)}
                    onChange={(e) => {
                      setReviewIssueTypes((current) => {
                        const next = new Set(current)
                        if (e.target.checked) next.add(issueType)
                        else next.delete(issueType)
                        return next
                      })
                      markDirty("translation_evaluation")
                    }}
                    className="h-4 w-4 rounded border-input"
                  />
                  <span>
                    {issueType === "meaning"
                      ? t`Meaning changed`
                      : issueType === "fluency"
                        ? t`Grammar and fluency`
                        : issueType === "terminology"
                          ? t`Terminology`
                          : issueType === "omission-or-addition"
                            ? t`Missing or added content`
                            : issueType === "formatting"
                              ? t`Formatting and placeholders`
                              : issueType === "context"
                                ? t`Page context`
                                : t`Other`}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">{t`Suggestion behavior`}</Label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={reviewGenerateSuggestions}
                onChange={(e) => {
                  setReviewGenerateSuggestions(e.target.checked)
                  markDirty("translation_evaluation")
                }}
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              <span>{t`Generate suggested replacement translations for flagged entries`}</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={reviewOnlySuggestWhenConfident}
                onChange={(e) => {
                  setReviewOnlySuggestWhenConfident(e.target.checked)
                  markDirty("translation_evaluation")
                }}
                disabled={!reviewGenerateSuggestions}
                className="mt-0.5 h-4 w-4 rounded border-input disabled:opacity-50"
              />
              <span>{t`Only suggest replacements when the correction is high confidence`}</span>
            </label>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">{t`Context included`}</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                ["book_metadata", reviewIncludeBookMetadata, setReviewIncludeBookMetadata, t`Book metadata`],
                ["source_language", reviewIncludeSourceLanguage, setReviewIncludeSourceLanguage, t`Source language`],
                ["target_language", reviewIncludeTargetLanguage, setReviewIncludeTargetLanguage, t`Target language`],
              ] as const).map(([key, checked, setter, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      setter(e.target.checked)
                      markDirty("translation_evaluation")
                    }}
                    className="h-4 w-4 rounded border-input"
                  />
                  <span>{label}</span>
                </label>
              ))}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked readOnly className="h-4 w-4 rounded border-input" />
                <span>{t`Visible page entries`}</span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="translation-review-style" className="text-xs">{t`Style guidance`}</Label>
            <Input
              id="translation-review-style"
              value={reviewStyleGuidance}
              onChange={(e) => {
                setReviewStyleGuidance(e.target.value)
                markDirty("translation_evaluation")
              }}
              placeholder={t`e.g. keep a warm children's-book tone`}
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="translation-review-terminology" className="text-xs">{t`Terminology guidance`}</Label>
            <textarea
              id="translation-review-terminology"
              value={reviewTerminologyGuidance}
              onChange={(e) => {
                setReviewTerminologyGuidance(e.target.value)
                markDirty("translation_evaluation")
              }}
              className="min-h-20 w-full rounded-md border border-input bg-background p-3 font-mono text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder={t`Terms, character names, or phrases the judge should preserve or prefer.`}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="translation-review-instructions" className="text-xs">{t`Judge instructions`}</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setReviewJudgeInstructions(DEFAULT_TRANSLATION_EVALUATION_JUDGE_INSTRUCTIONS)
                  markDirty("translation_evaluation")
                }}
              >
                {t`Reset default`}
              </Button>
            </div>
            <textarea
              id="translation-review-instructions"
              value={reviewJudgeInstructions}
              onChange={(e) => {
                setReviewJudgeInstructions(e.target.value)
                markDirty("translation_evaluation")
              }}
              className="min-h-56 w-full rounded-md border border-input bg-background p-3 font-mono text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
              </div>
            )}
          </div>
        </div>
      )}

      {(tab === "speech" || (isSpeechStage && tab === "general")) && (
        <>
          {isSpeechStage && (
            <Link
              to="/books/$label/$step/settings"
              params={{ label: bookLabel, step: "speech" }}
              search={{ tab: "overview" }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#737373] transition-colors hover:text-rose-700 focus:outline-none focus-visible:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              <Trans>Back to Speech overview</Trans>
            </Link>
          )}
        <SpeechLanguageCards
          bookLabel={bookLabel}
          baseLanguage={baseLanguage}
          outputLanguages={outputLanguages}
          speechModel={speechModel} setSpeechModel={setSpeechModel}
          format={format} setFormat={setFormat}
          defaultProvider={defaultProvider} setDefaultProvider={setDefaultProvider}
          openaiModel={openaiModel} setOpenaiModel={setOpenaiModel}
          openaiLanguages={openaiLanguages} setOpenaiLanguages={setOpenaiLanguages}
          azureModel={azureModel} setAzureModel={setAzureModel}
          azureLanguages={azureLanguages} setAzureLanguages={setAzureLanguages}
          geminiModel={geminiModel} setGeminiModel={setGeminiModel}
          geminiLanguages={geminiLanguages} setGeminiLanguages={setGeminiLanguages}
          bitRate={bitRate} setBitRate={setBitRate}
          sampleRate={sampleRate} setSampleRate={setSampleRate}
          geminiTemperature={geminiTemperature} setGeminiTemperature={setGeminiTemperature}
          geminiSeed={geminiSeed} setGeminiSeed={setGeminiSeed}
          batchByPage={batchByPage} setBatchByPage={setBatchByPage}
          wordHighlighting={wordHighlighting} setWordHighlighting={setWordHighlighting}
          markDirty={markDirty}
        />
        <ReadAloudContentSection
          excludedCategories={excludedCategories}
          onToggle={(category, readAloud) => {
            setExcludedCategories((prev) => {
              const next = new Set(prev)
              if (readAloud) next.delete(category)
              else next.add(category)
              return next
            })
            markDirty("speech")
          }}
        />
        </>
      )}

      {tab === "image-translation" && !isSpeechStage && (
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-semibold">{t`Image Translation`}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t`Regenerate selected images for each output language so that any text burned into them is shown in the target language.`}
            </p>
          </div>

          {/* Enable */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={imageTranslationEnabled}
              onChange={(e) => {
                setImageTranslationEnabled(e.target.checked)
                markDirty("image_translation")
              }}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <div>
              <span className="text-sm font-medium">{t`Translate text in images`}</span>
              <p className="text-xs text-muted-foreground">
                {t`When enabled, the selected images below are regenerated for every output language during the translate stage.`}
              </p>
            </div>
          </label>

          {/* Image model */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t`Image model`}</Label>
            <ModelSelect
              value={imageModel}
              onChange={(v) => { setImageModel(v); markDirty("image_translation") }}
              placeholder="openai:gpt-image-2"
              groups={IMAGE_MODEL_GROUPS}
              prefixProvider
              className="max-w-md"
              inputClassName="h-9 text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              {t`OpenAI image-edit model used to regenerate each image with translated text.`}
            </p>
          </div>

          {/* Selected images */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t`Selected images`}</Label>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="text-xs font-normal">
                {selectedImageIds.length === 1
                  ? t`1 image selected`
                  : t`${String(selectedImageIds.length)} images selected`}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => setShowImagePicker(true)}
              >
                {t`Choose images...`}
              </Button>
              {selectedImageIds.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-muted-foreground"
                  onClick={() => {
                    setSelectedImageIds([])
                    markDirty("image_translation")
                  }}
                >
                  {t`Clear`}
                </Button>
              )}
            </div>
            {(() => {
              const available = captionedImagesQuery.data?.images
              if (!available || selectedImageIds.length === 0) return null
              const availableIds = new Set(available.map((img) => img.imageId))
              const stale = selectedImageIds.filter((id) => !availableIds.has(id))
              if (stale.length === 0) return null
              return (
                <div className="flex items-center gap-3 text-[11px] text-amber-600 dark:text-amber-400">
                  <span>
                    {stale.length === 1
                      ? t`1 selected image is no longer in the storyboard.`
                      : t`${String(stale.length)} selected images are no longer in the storyboard.`}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[11px] underline"
                    onClick={() => {
                      setSelectedImageIds((prev) => prev.filter((id) => availableIds.has(id)))
                      markDirty("image_translation")
                    }}
                  >
                    {t`Remove`}
                  </Button>
                </div>
              )
            })()}
            <p className="text-[11px] text-muted-foreground">
              {t`Only images that appear in the storyboard (have captions) can be selected.`}
            </p>
          </div>

          {/* Prompt */}
          <div className="pt-2 border-t">
            <PromptViewer
              promptName="image_translation"
              bookLabel={bookLabel}
              title={t`Image translation prompt`}
              description={t`The prompt sent to the image model alongside each selected image.`}
              model={imageTranslation.model}
              onModelChange={imageTranslation.onModelChange}
              maxRetries={imageTranslation.maxRetries}
              onMaxRetriesChange={imageTranslation.onMaxRetriesChange}
              onContentChange={setImagePromptDraft}
              enabled={tab === "image-translation"}
            />
          </div>
        </div>
      )}

      {showImagePicker && (
        <SelectImagesDialog
          bookLabel={bookLabel}
          initialSelected={selectedImageIds}
          onConfirm={(ids) => {
            setSelectedImageIds(ids)
            markDirty("image_translation")
            setShowImagePicker(false)
          }}
          onClose={() => setShowImagePicker(false)}
        />
      )}

      {tab === "speech-prompts" && (
        <SpeechPromptsEditor bookLabel={bookLabel} />
      )}

      {tab === "voices" && (
        <VoiceMappingsEditor bookLabel={bookLabel} />
      )}
    </div>
  )
}

/* ---------- Read-aloud content types ---------- */

function ReadAloudContentSection({
  excludedCategories,
  onToggle,
}: {
  excludedCategories: Set<string>
  onToggle: (category: string, readAloud: boolean) => void
}) {
  const { t } = useLingui()

  const rows: Array<{ key: string; label: string; hint: string }> = [
    { key: "text", label: t`Text`, hint: t`Page text, headings, and quiz content.` },
    { key: "captions", label: t`Image captions`, hint: t`Descriptions spoken for images.` },
    { key: "answers", label: t`Activity answers`, hint: t`Answers revealed in activities.` },
    { key: "glossary", label: t`Glossary`, hint: t`Glossary words and their definitions.` },
    { key: "easy-read", label: t`Easy Read`, hint: t`Simplified Easy Read text variants.` },
  ]

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t`Read-Aloud Content`}</h3>
        <p className="text-[11px] text-muted-foreground mt-1">
          {t`Choose which kinds of on-screen text are read aloud. Disabled types get no audio in the reader. You can also mute individual entries from the Speech and Language views.`}
        </p>
      </div>
      <div className="rounded-lg border divide-y">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="space-y-0.5 pr-3">
              <Label htmlFor={`read-aloud-${row.key}`} className="text-xs cursor-pointer">
                {row.label}
              </Label>
              <p className="text-[11px] text-muted-foreground">{row.hint}</p>
            </div>
            <Switch
              id={`read-aloud-${row.key}`}
              checked={!excludedCategories.has(row.key)}
              onCheckedChange={(v) => onToggle(row.key, v)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Speech per-language cards ---------- */

// eslint-disable-next-line lingui/no-unlocalized-strings -- brand names
const PROVIDER_LABELS: Record<string, string> = { openai: "OpenAI", azure: "Azure", gemini: "Gemini" }

const MODEL_GROUPS_BY_PROVIDER: Record<string, typeof OPENAI_TTS_MODELS> = {
  openai: OPENAI_TTS_MODELS,
  azure: AZURE_TTS_MODELS,
  gemini: GEMINI_TTS_MODELS,
}

function SpeechLanguageCards({
  bookLabel,
  baseLanguage,
  outputLanguages,
  speechModel, setSpeechModel,
  format, setFormat,
  defaultProvider, setDefaultProvider,
  openaiModel, setOpenaiModel,
  openaiLanguages, setOpenaiLanguages,
  azureModel, setAzureModel,
  azureLanguages, setAzureLanguages,
  geminiModel, setGeminiModel,
  geminiLanguages, setGeminiLanguages,
  bitRate, setBitRate,
  sampleRate, setSampleRate,
  geminiTemperature, setGeminiTemperature,
  geminiSeed, setGeminiSeed,
  batchByPage, setBatchByPage,
  wordHighlighting, setWordHighlighting,
  markDirty,
}: {
  bookLabel: string
  baseLanguage: string
  outputLanguages: Set<string>
  speechModel: string; setSpeechModel: (v: string) => void
  format: string; setFormat: (v: string) => void
  defaultProvider: string; setDefaultProvider: (v: string) => void
  openaiModel: string; setOpenaiModel: (v: string) => void
  openaiLanguages: string; setOpenaiLanguages: (v: string) => void
  azureModel: string; setAzureModel: (v: string) => void
  azureLanguages: string; setAzureLanguages: (v: string) => void
  geminiModel: string; setGeminiModel: (v: string) => void
  geminiLanguages: string; setGeminiLanguages: (v: string) => void
  bitRate: string; setBitRate: (v: string) => void
  sampleRate: string; setSampleRate: (v: string) => void
  geminiTemperature: string; setGeminiTemperature: (v: string) => void
  geminiSeed: string; setGeminiSeed: (v: string) => void
  batchByPage: boolean; setBatchByPage: (v: boolean) => void
  wordHighlighting: boolean; setWordHighlighting: (v: boolean) => void
  markDirty: (field: string) => void
}) {
  const { t } = useLingui()

  // Load voice mappings + speech instructions
  const { data: voiceMappings } = useQuery({
    queryKey: ["voice-mappings"],
    queryFn: () => api.getVoiceMappings(),
  })
  const { data: speechInstructions } = useQuery({
    queryKey: ["speech-instructions"],
    queryFn: () => api.getSpeechInstructions(),
  })

  // Build a live speech config object to resolve providers
  const speechConfig = {
    model: speechModel || undefined,
    default_provider: defaultProvider || undefined,
    providers: {
      ...(openaiModel || openaiLanguages ? {
        openai: {
          model: openaiModel || undefined,
          languages: openaiLanguages.split(",").map((s) => s.trim()).filter(Boolean),
        },
      } : {}),
      ...(azureModel || azureLanguages ? {
        azure: {
          model: azureModel || undefined,
          languages: azureLanguages.split(",").map((s) => s.trim()).filter(Boolean),
        },
      } : {}),
      ...(geminiModel || geminiLanguages ? {
        gemini: {
          model: geminiModel || undefined,
          languages: geminiLanguages.split(",").map((s) => s.trim()).filter(Boolean),
        },
      } : {}),
    },
  }

  const allLanguages = [baseLanguage, ...Array.from(outputLanguages).filter((l) => l !== baseLanguage)]

  const getProviderModel = (provider: string): string => {
    if (provider === "openai") return openaiModel
    if (provider === "azure") return azureModel
    if (provider === "gemini") return geminiModel
    return ""
  }

  const setProviderModel = (provider: string, value: string) => {
    if (provider === "openai") setOpenaiModel(value)
    else if (provider === "azure") setAzureModel(value)
    else if (provider === "gemini") setGeminiModel(value)
    markDirty("speech")
  }

  const getProviderLanguages = (provider: string): string => {
    if (provider === "openai") return openaiLanguages
    if (provider === "azure") return azureLanguages
    if (provider === "gemini") return geminiLanguages
    return ""
  }

  const setProviderLanguages = (provider: string, value: string) => {
    if (provider === "openai") setOpenaiLanguages(value)
    else if (provider === "azure") setAzureLanguages(value)
    else if (provider === "gemini") setGeminiLanguages(value)
    markDirty("speech")
  }

  const resolveVoice = (lang: string, provider: string): string => {
    if (!voiceMappings) return ""
    const providerMap = voiceMappings[provider] as Record<string, string> | undefined
    return providerMap?.[lang] ?? providerMap?.["default"] ?? ""
  }

  const resolveInstruction = (lang: string): string => {
    if (!speechInstructions) return ""
    return speechInstructions[lang] ?? speechInstructions["default"] ?? ""
  }

  // Route a language to a different provider
  const routeLanguageTo = (lang: string, newProvider: string) => {
    // Remove from all providers' language lists
    for (const p of ["openai", "azure", "gemini"]) {
      const current = getProviderLanguages(p)
      const langs = current.split(",").map((s) => s.trim()).filter(Boolean)
      const filtered = langs.filter((l) => normalizeLocale(l) !== normalizeLocale(lang))
      if (filtered.length !== langs.length) {
        setProviderLanguages(p, filtered.join(", "))
      }
    }
    // If the new provider isn't the default, add to its language list
    if (newProvider !== defaultProvider) {
      const current = getProviderLanguages(newProvider)
      const langs = current.split(",").map((s) => s.trim()).filter(Boolean)
      if (!langs.some((l) => normalizeLocale(l) === normalizeLocale(lang))) {
        langs.push(lang)
        setProviderLanguages(newProvider, langs.join(", "))
      }
    }
    markDirty("speech")
  }

  return (
    <div className="space-y-6">
      {/* Global defaults */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t`Defaults`}</h3>
        <div className="flex gap-4 flex-wrap">
          <div className="space-y-1.5">
            <Label className="text-xs">{t`Default Provider`}</Label>
            <select
              value={defaultProvider}
              onChange={(e) => { setDefaultProvider(e.target.value); markDirty("speech") }}
              className="flex h-8 w-40 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm"
            >
              <option value="openai">{t`OpenAI`}</option>
              <option value="azure">{t`Azure`}</option>
              <option value="gemini">{t`Gemini`}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t`Format`}</Label>
            <Input
              value={format}
              onChange={(e) => { setFormat(e.target.value); markDirty("speech") }}
              placeholder="mp3"
              className="w-24 h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t`Bit Rate`}</Label>
            <Input
              value={bitRate}
              onChange={(e) => { setBitRate(e.target.value); markDirty("speech") }}
              placeholder="64k"
              className="w-24 h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t`Sample Rate`}</Label>
            <Input
              value={sampleRate}
              onChange={(e) => { setSampleRate(e.target.value); markDirty("speech") }}
              placeholder="24000"
              className="w-24 h-8 text-xs"
            />
          </div>
        </div>
        {/* Gemini sampling — keeps prosody consistent across the independent
            per-sentence requests. Only applies to Gemini-routed languages. */}
        <div className="space-y-2 pt-2">
          <Label className="text-[11px] font-medium text-muted-foreground">
            {t`Gemini voice consistency`}
          </Label>
          <div className="flex gap-4 flex-wrap">
            <div className="space-y-1.5">
              <Label className="text-xs">{t`Temperature`}</Label>
              <Input
                value={geminiTemperature}
                onChange={(e) => { setGeminiTemperature(e.target.value); markDirty("speech") }}
                placeholder="0.4"
                inputMode="decimal"
                className="w-24 h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t`Seed`}</Label>
              <Input
                value={geminiSeed}
                onChange={(e) => { setGeminiSeed(e.target.value); markDirty("speech") }}
                placeholder="42"
                inputMode="numeric"
                className="w-24 h-8 text-xs"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t`Gemini generates each sentence in its own request, so its tone can drift between sentences. Set a lower temperature (e.g. 0.4) to reduce that variation and a fixed seed to make delivery reproducible; leave both empty to disable them and use Gemini's own defaults. Only affects languages routed to Gemini — OpenAI and Azure ignore these. Changing either value regenerates Gemini audio on the next run.`}
          </p>
          <div className="flex items-start gap-3 pt-2">
            <Switch
              id="batch-by-page"
              checked={batchByPage}
              onCheckedChange={(v) => { setBatchByPage(v); markDirty("speech") }}
            />
            <div className="space-y-1 flex-1">
              <Label htmlFor="batch-by-page" className="text-xs">{t`Batch a whole page per request (experimental)`}</Label>
              <p className="text-[11px] text-muted-foreground">
                {t`Synthesize each page's text in a single Gemini request so tone flows naturally across sentences, then split the audio back into per-sentence clips. Needs an OpenAI key (used to align the split). Gemini-routed languages only; Chinese and Thai remain per-entry.`}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3 pt-2">
          <Switch
            id="word-highlighting"
            checked={wordHighlighting}
            onCheckedChange={(v) => { setWordHighlighting(v); markDirty("speech") }}
          />
          <div className="space-y-2 flex-1">
            <Label htmlFor="word-highlighting" className="text-xs">{t`Word-level highlighting`}</Label>
            <p className="text-[11px] text-muted-foreground">
              {t`When enabled, word-level timestamps are calculated automatically during speech generation so the reader can highlight words as they're spoken. When disabled, you can still calculate timestamps manually from the speech view.`}
            </p>
            <WordHighlightPreview enabled={wordHighlighting} />
          </div>
        </div>
      </div>

      {/* Per-language cards */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t`Languages`}</h3>
        {allLanguages.map((lang) => {
          const provider = resolveSpeechProviderForLanguage(lang, speechConfig)
          const model = getProviderModel(provider)
          const voice = resolveVoice(lang, provider)
          const instruction = resolveInstruction(lang)
          const isBase = lang === baseLanguage

          return (
            <div key={lang} className="rounded-lg border p-4 space-y-3">
              {/* Language header */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{displayLang(lang)}</span>
                <span className="text-xs text-muted-foreground">{lang}</span>
                {isBase && (
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-normal">
                    {t`base`}
                  </Badge>
                )}
              </div>

              {/* Provider + Model row */}
              <div className="flex gap-3 flex-wrap">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">{t`Provider`}</Label>
                  <select
                    value={provider}
                    onChange={(e) => routeLanguageTo(lang, e.target.value)}
                    className="flex h-8 w-36 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm"
                  >
                    {["openai", "azure", "gemini"].map((p) => (
                      <option key={p} value={p}>
                        {PROVIDER_LABELS[p]}{p === defaultProvider ? ` (${t`default`})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 flex-1 min-w-[200px]">
                  <Label className="text-[10px] text-muted-foreground">{t`Model`}</Label>
                  <ModelSelect
                    value={model}
                    onChange={(v) => setProviderModel(provider, v)}
                    placeholder={t`Default model`}
                    groups={MODEL_GROUPS_BY_PROVIDER[provider] ?? OPENAI_TTS_MODELS}
                    prefixProvider={false}
                    className="w-full"
                    inputClassName="h-8 text-xs"
                  />
                </div>
                {voice && (
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">{t`Voice`}</Label>
                    <div className="flex items-center h-8 px-2 rounded-md border border-input bg-muted/30 text-xs text-muted-foreground">
                      {voice}
                    </div>
                  </div>
                )}
              </div>

              {/* Accent / instruction prompt */}
              {instruction && (
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">{t`Accent Prompt`}</Label>
                  <p className="text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2 whitespace-pre-wrap">
                    {instruction}
                  </p>
                </div>
              )}
            </div>
          )
        })}

        {allLanguages.length === 0 && (
          <p className="text-xs text-muted-foreground italic">
            {t`No languages configured. Add languages in the Language settings.`}
          </p>
        )}
      </div>
    </div>
  )
}
