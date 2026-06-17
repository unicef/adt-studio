import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { useNavigate, Link } from "@tanstack/react-router"
import { Play, Lock, ArrowLeft } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ModelSelect, OPENAI_TTS_MODELS, AZURE_TTS_MODELS, GEMINI_TTS_MODELS, IMAGE_MODEL_GROUPS } from "@/components/pipeline/components/ModelSelect"
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config"
import { useActiveConfig } from "@/hooks/use-debug"
import { useApiKey } from "@/hooks/use-api-key"
import { api } from "@/api/client"
import { PromptViewer } from "@/components/pipeline/components/PromptViewer"
import { LanguagePicker } from "@/components/LanguagePicker"
import { useBook } from "@/hooks/use-books"
import { useBookRun } from "@/hooks/use-book-run"
import { useStepConfig } from "@/hooks/use-step-config"
import { normalizeLocale } from "@/lib/languages"
import { resolveSpeechProviderForLanguage } from "@/lib/speech-routing"
import { SpeechPromptsEditor } from "./components/SpeechPromptsEditor"
import { VoiceMappingsEditor } from "./components/VoiceMappingsEditor"
import { SelectImagesDialog } from "./components/SelectImagesDialog"
import { WordHighlightPreview } from "./components/WordHighlightPreview"
import { useLingui } from "@lingui/react/macro"
import { displayLang } from "./lib/display-lang"

export function LanguageSettings({ bookLabel, headerTarget, tab = "general", stageSlug = "translate" }: { bookLabel: string; headerTarget?: HTMLDivElement | null; tab?: string; stageSlug?: string }) {
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
  const { apiKey, hasApiKey } = useApiKey()
  const { queueRun } = useBookRun()
  const navigate = useNavigate()
  const [showRerunDialog, setShowRerunDialog] = useState(false)

  const [outputLanguages, setOutputLanguages] = useState<Set<string>>(new Set())
  const [promptDraft, setPromptDraft] = useState<string | null>(null)

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
  const [wordHighlighting, setWordHighlighting] = useState(false)
  const [easyReadTts, setEasyReadTts] = useState(false)

  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const markDirty = (field: string) => setDirty((prev) => ({ ...prev, [field]: true }))

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
    if (m.speech && typeof m.speech === "object") {
      const s = m.speech as Record<string, unknown>
      if (s.model) setSpeechModel(String(s.model))
      if (s.format) setFormat(String(s.format))
      if (s.default_provider) setDefaultProvider(String(s.default_provider))
      if (s.bit_rate) setBitRate(String(s.bit_rate))
      if (s.sample_rate) setSampleRate(String(s.sample_rate))
      setWordHighlighting(s.word_highlighting === true)
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
      overrides.speech = {
        ...existing,
        model: speechModel.trim() || undefined,
        format: format.trim() || undefined,
        default_provider: defaultProvider || undefined,
        providers: Object.keys(providers).length > 0 ? providers : undefined,
        bit_rate: bitRate.trim() || undefined,
        sample_rate: sampleRate.trim() ? Number(sampleRate.trim()) : undefined,
        word_highlighting: wordHighlighting,
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

  const confirmSaveAndRerun = async () => {
    const promptSaves: Promise<unknown>[] = []
    if (promptDraft != null) promptSaves.push(api.updatePrompt("translation", promptDraft, bookLabel))
    if (imagePromptDraft != null) promptSaves.push(api.updatePrompt("image_translation", imagePromptDraft, bookLabel))
    if (promptSaves.length > 0) await Promise.all(promptSaves)

    const overrides = buildOverrides()
    updateConfig.mutate(
      { label: bookLabel, config: overrides },
      {
        onSuccess: async () => {
          setDirty({})
          setPromptDraft(null)
          setImagePromptDraft(null)
          setShowRerunDialog(false)
          queueRun({
            fromStage: stageSlug as "translate" | "speech",
            toStage: stageSlug as "translate" | "speech",
            apiKey,
          })
          navigate({ to: "/books/$label/$step", params: { label: bookLabel, step: stageSlug } })
        },
      }
    )
  }

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
          wordHighlighting={wordHighlighting} setWordHighlighting={setWordHighlighting}
          markDirty={markDirty}
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
        <SpeechPromptsEditor bookLabel={bookLabel} headerTarget={headerTarget} />
      )}

      {tab === "voices" && (
        <VoiceMappingsEditor bookLabel={bookLabel} headerTarget={headerTarget} />
      )}

      {headerTarget && (tab === "general" || tab === "prompt" || tab === "speech" || tab === "image-translation") && createPortal(
        <Button
          size="sm"
          className="h-7 px-2.5 text-xs bg-black/15 text-white hover:bg-black/25"
          onClick={() => setShowRerunDialog(true)}
          disabled={updateConfig.isPending || !hasApiKey}
        >
          <Play className="mr-1.5 h-3.5 w-3.5" />
          {t`Save & Rerun`}
        </Button>,
        headerTarget
      )}

      <Dialog open={showRerunDialog} onOpenChange={setShowRerunDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isSpeechStage ? t`Save & Rerun Speech` : t`Save & Rerun Translations`}</DialogTitle>
            <DialogDescription>
              {isSpeechStage
                ? t`This will save your settings and re-run speech generation.`
                : t`This will save your settings and re-run translations, rebuilding the text catalog and translating to output languages.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRerunDialog(false)}>
              {t`Cancel`}
            </Button>
            <Button onClick={confirmSaveAndRerun} disabled={updateConfig.isPending}>
              {updateConfig.isPending ? t`Saving...` : t`Confirm Rerun`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

