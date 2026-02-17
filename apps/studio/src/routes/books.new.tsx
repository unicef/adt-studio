import { useState, useCallback, useEffect } from "react"
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import {
  Upload,
  FileText,
  ChevronDown,
  Check,
  GraduationCap,
  BookHeart,
  Library,
  SlidersHorizontal,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { LanguagePicker } from "@/components/LanguagePicker"
import { useCreateBook } from "@/hooks/use-books"
import { useApiKey } from "@/hooks/use-api-key"
import { api } from "@/api/client"
import { usePreset, useGlobalConfig } from "@/hooks/use-presets"
import {
  AdvancedLayoutPanel,
  type RenderStrategyState,
} from "@/components/config/AdvancedLayoutPanel"

export const Route = createFileRoute("/books/new")({
  component: AddBookPage,
})

const LAYOUT_TYPES = ["textbook", "storybook", "reference", "custom"] as const
type LayoutType = (typeof LAYOUT_TYPES)[number]


const STEPS = [
  { number: 1, label: "Upload" },
  { number: 2, label: "Layout" },
  { number: 3, label: "Settings" },
] as const

const LAYOUT_CARDS: {
  type: LayoutType
  icon: typeof GraduationCap
  color: string
  selectedBg: string
  description: string
}[] = [
  {
    type: "textbook",
    icon: GraduationCap,
    color: "bg-blue-500",
    selectedBg: "bg-blue-500/5",
    description:
      "Structured chapters, exercises. Best for educational content.",
  },
  {
    type: "storybook",
    icon: BookHeart,
    color: "bg-amber-500",
    selectedBg: "bg-amber-500/5",
    description:
      "Large images, narrative flow. Best for illustrated books.",
  },
  {
    type: "reference",
    icon: Library,
    color: "bg-emerald-500",
    selectedBg: "bg-emerald-500/5",
    description:
      "Dense text, tables, glossaries. Best for technical material.",
  },
  {
    type: "custom",
    icon: SlidersHorizontal,
    color: "bg-violet-500",
    selectedBg: "bg-violet-500/5",
    description:
      "Full control over render strategies, pruning, and filters.",
  },
]

function Stepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center px-6 pt-5 pb-2">
      {STEPS.map((step, i) => (
        <div key={step.number} className="flex flex-1 items-center">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                currentStep > step.number
                  ? "bg-primary text-primary-foreground"
                  : currentStep === step.number
                    ? "bg-primary text-primary-foreground"
                    : "border-2 border-muted-foreground/30 text-muted-foreground"
              }`}
            >
              {currentStep > step.number ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                step.number
              )}
            </div>
            <span
              className={`text-xs ${
                currentStep >= step.number
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              }`}
            >
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`mx-2 h-0.5 flex-1 transition-colors ${
                currentStep > step.number ? "bg-primary" : "bg-border"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function AddBookPage() {
  const navigate = useNavigate()
  const createMutation = useCreateBook()
  const { apiKey, hasApiKey } = useApiKey()

  const [step, setStep] = useState(1)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Step 1 — Upload
  const [label, setLabel] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [startPage, setStartPage] = useState("")
  const [endPage, setEndPage] = useState("")
  const [spreadMode, setSpreadMode] = useState(false)

  // Step 2 — Layout
  const [layoutType, setLayoutType] = useState<LayoutType>("textbook")
  const [showAdvancedLayout, setShowAdvancedLayout] = useState(false)
  const [defaultRenderStrategy, setDefaultRenderStrategy] = useState("")
  const [renderStrategies, setRenderStrategies] = useState<Record<string, RenderStrategyState>>({})
  const [sectionRenderStrategies, setSectionRenderStrategies] = useState<Record<string, string>>({})
  const [prunedTextTypes, setPrunedTextTypes] = useState<Set<string>>(new Set())
  const [prunedSectionTypes, setPrunedSectionTypes] = useState<Set<string>>(new Set())
  const [imageMinSide, setImageMinSide] = useState("")
  const [imageMaxSide, setImageMaxSide] = useState("")
  const [textTypes, setTextTypes] = useState<Record<string, string>>({})
  const [textGroupTypes, setTextGroupTypes] = useState<Record<string, string>>({})
  const [sectionTypes, setSectionTypes] = useState<Record<string, string>>({})

  // Fetch preset + global config via TanStack Query
  const presetName = layoutType === "custom" ? null : layoutType
  const { data: presetData } = usePreset(presetName)
  const { data: globalConfigData } = useGlobalConfig()

  // Populate local state when query data or layout type changes
  useEffect(() => {
    if (!globalConfigData) return
    if (layoutType !== "custom" && !presetData) return

    const config = presetData?.config ?? globalConfigData.config
    const globalConfig = globalConfigData.config

    // Type definitions always come from global config
    setTextTypes(
      globalConfig.text_types && typeof globalConfig.text_types === "object"
        ? (globalConfig.text_types as Record<string, string>)
        : {}
    )
    setTextGroupTypes(
      globalConfig.text_group_types && typeof globalConfig.text_group_types === "object"
        ? (globalConfig.text_group_types as Record<string, string>)
        : {}
    )
    setSectionTypes(
      globalConfig.section_types && typeof globalConfig.section_types === "object"
        ? (globalConfig.section_types as Record<string, string>)
        : {}
    )

    // Default to "dynamic" — picks the best strategy per section type
    setDefaultRenderStrategy("dynamic")

    // Render strategies
    if (config.render_strategies && typeof config.render_strategies === "object") {
      const loaded: Record<string, RenderStrategyState> = {}
      for (const [name, raw] of Object.entries(
        config.render_strategies as Record<string, Record<string, unknown>>
      )) {
        const cfg = (raw.config ?? {}) as Record<string, unknown>
        loaded[name] = {
          render_type: String(raw.render_type ?? "llm"),
          config: {
            prompt: cfg.prompt != null ? String(cfg.prompt) : undefined,
            model: cfg.model != null ? String(cfg.model) : undefined,
            max_retries: cfg.max_retries != null ? String(cfg.max_retries) : undefined,
            timeout: cfg.timeout != null ? String(cfg.timeout) : undefined,
            answer_prompt: cfg.answer_prompt != null ? String(cfg.answer_prompt) : undefined,
            template: cfg.template != null ? String(cfg.template) : undefined,
          },
        }
      }
      setRenderStrategies(loaded)
    } else {
      setRenderStrategies({})
    }

    // Section render strategies
    if (config.section_render_strategies && typeof config.section_render_strategies === "object") {
      setSectionRenderStrategies(
        config.section_render_strategies as Record<string, string>
      )
    } else {
      setSectionRenderStrategies({})
    }

    // Pruned types
    setPrunedTextTypes(
      Array.isArray(config.pruned_text_types)
        ? new Set(config.pruned_text_types as string[])
        : new Set()
    )
    setPrunedSectionTypes(
      Array.isArray(config.pruned_section_types)
        ? new Set(config.pruned_section_types as string[])
        : new Set()
    )

    // Image filters
    if (config.image_filters && typeof config.image_filters === "object") {
      const f = config.image_filters as Record<string, unknown>
      setImageMinSide(f.min_side != null ? String(f.min_side) : "")
      setImageMaxSide(f.max_side != null ? String(f.max_side) : "")
    } else {
      setImageMinSide("")
      setImageMaxSide("")
    }

    // Spread mode from preset
    if (typeof config.spread_mode === "boolean") {
      setSpreadMode(config.spread_mode)
    }

    // Custom layout auto-expands advanced panel
    if (layoutType === "custom") {
      setShowAdvancedLayout(true)
    }
  }, [layoutType, presetData, globalConfigData])

  // Step 3 — Settings
  const [editingLanguage, setEditingLanguage] = useState("en")
  const [outputLanguages, setOutputLanguages] = useState<Set<string>>(
    () => new Set(["en"])
  )

  const suggestLabel = useCallback((filename: string) => {
    return filename
      .replace(/\.pdf$/i, "")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/^-+/, "")
      .toLowerCase()
  }, [])

  const handleFileSelect = (selected: File) => {
    setFile(selected)
    if (!label) {
      setLabel(suggestLabel(selected.name))
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.type === "application/pdf") {
      handleFileSelect(dropped)
    }
  }

  const openFilePicker = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".pdf"
    input.onchange = () => {
      const selected = input.files?.[0]
      if (selected) handleFileSelect(selected)
    }
    input.click()
  }

  const toggleOutputLanguage = (code: string) => {
    setOutputLanguages((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const isLabelValid =
    !!label && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(label)
  const canAdvanceStep1 = !!file && isLabelValid

  const handleSubmit = () => {
    if (!file || !label) return
    setSubmitError(null)

    const parsedStartPage = startPage.trim() ? Number(startPage) : undefined
    const parsedEndPage = endPage.trim() ? Number(endPage) : undefined
    const hasInvalidStart =
      parsedStartPage !== undefined &&
      (!Number.isInteger(parsedStartPage) || parsedStartPage < 1)
    const hasInvalidEnd =
      parsedEndPage !== undefined &&
      (!Number.isInteger(parsedEndPage) || parsedEndPage < 1)

    if (hasInvalidStart || hasInvalidEnd) {
      setSubmitError("Page range must use whole numbers greater than or equal to 1.")
      return
    }
    if (
      parsedStartPage !== undefined &&
      parsedEndPage !== undefined &&
      parsedEndPage < parsedStartPage
    ) {
      setSubmitError("Last page must be greater than or equal to first page.")
      return
    }

    const configOverrides: Record<string, unknown> = {}
    configOverrides.layout_type = layoutType
    configOverrides.editing_language = editingLanguage
    configOverrides.output_languages = Array.from(outputLanguages)
    configOverrides.spread_mode = spreadMode
    if (parsedStartPage !== undefined) {
      configOverrides.start_page = parsedStartPage
    }
    if (parsedEndPage !== undefined) {
      configOverrides.end_page = parsedEndPage
    }

    // Advanced layout settings
    // "dynamic" means use section_render_strategies mapping with two_column fallback
    const effectiveStrategy = defaultRenderStrategy === "dynamic" ? "two_column" : defaultRenderStrategy
    if (effectiveStrategy.trim()) {
      configOverrides.default_render_strategy = effectiveStrategy.trim()
    }
    if (Object.keys(renderStrategies).length > 0) {
      const strategies: Record<string, unknown> = {}
      for (const [name, strategy] of Object.entries(renderStrategies)) {
        const config: Record<string, unknown> = {}
        if (strategy.config.prompt) config.prompt = strategy.config.prompt
        if (strategy.config.model) config.model = strategy.config.model
        if (strategy.config.max_retries) config.max_retries = Number(strategy.config.max_retries)
        if (strategy.config.timeout) config.timeout = Number(strategy.config.timeout)
        if (strategy.config.answer_prompt) config.answer_prompt = strategy.config.answer_prompt
        if (strategy.config.template) config.template = strategy.config.template
        strategies[name] = {
          render_type: strategy.render_type,
          ...(Object.keys(config).length > 0 ? { config } : {}),
        }
      }
      configOverrides.render_strategies = strategies
    }
    if (Object.keys(sectionRenderStrategies).length > 0) {
      configOverrides.section_render_strategies = sectionRenderStrategies
    }
    if (prunedTextTypes.size > 0) {
      configOverrides.pruned_text_types = Array.from(prunedTextTypes)
    }
    if (prunedSectionTypes.size > 0) {
      configOverrides.pruned_section_types = Array.from(prunedSectionTypes)
    }
    const imageFilters: Record<string, number> = {}
    if (imageMinSide.trim()) imageFilters.min_side = Number(imageMinSide)
    if (imageMaxSide.trim()) imageFilters.max_side = Number(imageMaxSide)
    if (Object.keys(imageFilters).length > 0) {
      configOverrides.image_filters = imageFilters
    }
    // Type definitions
    if (Object.keys(textTypes).length > 0) {
      configOverrides.text_types = textTypes
    }
    if (Object.keys(textGroupTypes).length > 0) {
      configOverrides.text_group_types = textGroupTypes
    }
    if (Object.keys(sectionTypes).length > 0) {
      configOverrides.section_types = sectionTypes
    }

    createMutation.mutate(
      { label, pdf: file, config: configOverrides },
      {
        onSuccess: async (book) => {
          if (hasApiKey && apiKey) {
            try {
              await api.runSteps(book.label, apiKey, { fromStep: "extract", toStep: "storyboard" })
            } catch {
              // Book creation already succeeded; user can retry the run from v2.
            }
          }
          navigate({
            to: "/books/$label/v2/$step",
            params: { label: book.label, step: "book" },
          })
        },
      }
    )
  }

  return (
    <div className="mx-auto max-w-xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <Link
          to="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ADT Studio
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <h1 className="text-lg font-semibold">Add Book</h1>
      </div>

      <Card>
        <Stepper currentStep={step} />
        <CardContent className="pt-4 space-y-4 max-h-[calc(100vh-10rem)] overflow-y-auto">
          {/* Step 1 — Upload */}
          {step === 1 && (
            <div key={1} className="animate-wizard-enter space-y-4">
              {/* Drop zone */}
              <div
                className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
                  file ? "p-4" : "p-8"
                } ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={openFilePicker}
              >
                {file ? (
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(1)} MB — click to
                        change
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      Drop a PDF here, or click to browse
                    </p>
                  </>
                )}
              </div>

              {/* Label */}
              <div className="space-y-1.5">
                <Label htmlFor="book-label" className="text-xs">
                  Book Label
                </Label>
                <Input
                  id="book-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g., my-textbook-grade5"
                />
                {label && !isLabelValid ? (
                  <p className="text-xs text-destructive">
                    Must start with a letter or number. Only letters, numbers,
                    hyphens, dots, underscores.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    A unique identifier used as the book folder name.
                  </p>
                )}
              </div>

              {/* Advanced toggle */}
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? "" : "-rotate-90"}`}
                />
                Advanced options
              </button>

              {showAdvanced && (
                <div className="space-y-4 rounded-lg border bg-muted/30 p-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Page Range</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        value={startPage}
                        onChange={(e) => setStartPage(e.target.value)}
                        placeholder="First"
                        className="w-24"
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input
                        type="number"
                        min={1}
                        value={endPage}
                        onChange={(e) => setEndPage(e.target.value)}
                        placeholder="Last"
                        className="w-24"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Leave empty to process all pages.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="spread-mode"
                        checked={spreadMode}
                        onCheckedChange={setSpreadMode}
                      />
                      <Label htmlFor="spread-mode" className="text-xs">
                        Spread Mode
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Merge facing pages as spreads (cover + page pairs).
                    </p>
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="flex justify-end pt-1">
                <Button
                  size="sm"
                  onClick={() => setStep(2)}
                  disabled={!canAdvanceStep1}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {/* Step 2 — Layout */}
          {step === 2 && (
            <div key={2} className="animate-wizard-enter space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Choose a layout</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  This guides how your book pages will be styled
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {LAYOUT_CARDS.map((card) => {
                  const Icon = card.icon
                  const selected = layoutType === card.type
                  return (
                    <button
                      key={card.type}
                      type="button"
                      onClick={() => setLayoutType(card.type)}
                      className={`relative flex flex-col items-center rounded-xl border p-4 text-left transition-all ${
                        selected
                          ? `ring-2 ring-primary shadow-md ${card.selectedBg}`
                          : "hover:border-primary/40 hover:shadow-sm"
                      }`}
                    >
                      <div
                        className={`absolute inset-x-0 top-0 h-0.5 rounded-t-xl ${card.color}`}
                      />
                      <Icon className="h-6 w-6 text-muted-foreground mt-1" />
                      <span className="mt-2 text-sm font-semibold capitalize">
                        {card.type}
                      </span>
                      <span className="mt-1 text-center text-xs text-muted-foreground leading-snug">
                        {card.description}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Advanced layout settings toggle */}
              <button
                type="button"
                onClick={() => setShowAdvancedLayout(!showAdvancedLayout)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${showAdvancedLayout ? "" : "-rotate-90"}`}
                />
                Advanced layout settings
              </button>

              {showAdvancedLayout && (
                <div className="space-y-4 rounded-lg border bg-muted/30 p-3">
                  <AdvancedLayoutPanel
                    defaultRenderStrategy={defaultRenderStrategy}
                    onDefaultRenderStrategyChange={setDefaultRenderStrategy}
                    renderStrategies={renderStrategies}
                    onRenderStrategiesChange={setRenderStrategies}
                    textTypes={textTypes}
                    onTextTypesChange={setTextTypes}
                    textGroupTypes={textGroupTypes}
                    onTextGroupTypesChange={setTextGroupTypes}
                    sectionTypes={sectionTypes}
                    onSectionTypesChange={setSectionTypes}
                    prunedTextTypes={prunedTextTypes}
                    onTogglePrunedText={(t) => {
                      setPrunedTextTypes((prev) => {
                        const next = new Set(prev)
                        if (next.has(t)) next.delete(t)
                        else next.add(t)
                        return next
                      })
                    }}
                    prunedSectionTypes={prunedSectionTypes}
                    onTogglePrunedSection={(t) => {
                      setPrunedSectionTypes((prev) => {
                        const next = new Set(prev)
                        if (next.has(t)) next.delete(t)
                        else next.add(t)
                        return next
                      })
                    }}
                  />
                </div>
              )}

              {/* Navigation */}
              <div className="flex justify-between pt-1">
                <Button variant="outline" size="sm" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button size="sm" onClick={() => setStep(3)}>
                  Next
                </Button>
              </div>
            </div>
          )}

          {/* Step 3 — Settings */}
          {step === 3 && (
            <div key={3} className="animate-wizard-enter space-y-5">
              <LanguagePicker
                label="Editing Language"
                hint="The primary language of your book"
                selected={editingLanguage}
                onSelect={setEditingLanguage}
              />

              <LanguagePicker
                label="Output Languages"
                hint="Select languages for translated versions"
                selected={outputLanguages}
                onSelect={toggleOutputLanguage}
                multiple
              />

              {/* Error */}
              {(submitError || createMutation.isError) && (
                <p className="text-sm text-destructive">
                  {submitError ?? createMutation.error?.message ?? "Failed to create book."}
                </p>
              )}

              {/* Navigation */}
              <div className="flex justify-between pt-1">
                <Button variant="outline" size="sm" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending
                    ? "Creating..."
                    : "Create Storyboard"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
