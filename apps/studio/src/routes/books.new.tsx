import { useState, useCallback } from "react"
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import {
  Upload,
  FileText,
  ChevronDown,
  Check,
  GraduationCap,
  BookHeart,
  Library,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { LanguagePicker } from "@/components/LanguagePicker"
import { useCreateBook } from "@/hooks/use-books"
import { useApiKey } from "@/hooks/use-api-key"

export const Route = createFileRoute("/books/new")({
  component: AddBookPage,
})

const LAYOUT_TYPES = ["textbook", "storybook", "reference"] as const
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
  const { hasApiKey } = useApiKey()

  const [step, setStep] = useState(1)

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

    const configOverrides: Record<string, unknown> = {}
    configOverrides.layout_type = layoutType
    configOverrides.editing_language = editingLanguage
    if (outputLanguages.size > 0) {
      configOverrides.output_languages = Array.from(outputLanguages)
    }
    if (spreadMode) {
      configOverrides.spread_mode = true
    }

    createMutation.mutate(
      { label, pdf: file, config: configOverrides },
      {
        onSuccess: (book) => {
          navigate({
            to: "/books/$label",
            params: { label: book.label },
            search: {
              autoRun: hasApiKey ? true : undefined,
              startPage: startPage ? Number(startPage) : undefined,
              endPage: endPage ? Number(endPage) : undefined,
            },
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

              <div className="grid grid-cols-3 gap-3">
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
              {createMutation.isError && (
                <p className="text-sm text-destructive">
                  {createMutation.error.message}
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
