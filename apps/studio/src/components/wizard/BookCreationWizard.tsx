
import { useState, useEffect, useRef, type CSSProperties } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Eye, ArrowLeft, ArrowRight, Zap, Loader2 } from "lucide-react"
import { useStore } from "@tanstack/react-form"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { api } from "@/api/client"
import { useApiKey } from "@/hooks/use-api-key"
import { useBooks, useCreateBook } from "@/hooks/use-books"
import { useWizard } from "./index"
import { useWizardForm } from "./wizardForm"
import { usePageTitle } from "@/hooks/use-page-title"
import { STEPS } from "./steps"
import { buildConfigOverrides } from "./bookCreationConfig"
import { getPresetAccent, type PresetAccent } from "./constants"
import { Step0Preset } from "./step0preset"
import { StepUpload } from "./stepUpload"
import { StudioTopBar } from "@/components/StudioTopBar"
import { PdfCoverPreview } from "./shared/PdfCoverPreview"
import { LayoutPreview, getPreviewWidth } from "./step2LayoutOptions/LayoutPreview"
import { ImageProcessingPreviewPane } from "./step3ContentProcessing/ImageProcessingPreviewPane"
import { LanguagesPreviewPane } from "./step4Languages/LanguagesPreviewPane"
import { StyleguidePreviewPane } from "./step5Styleguide/StyleguidePreviewPane"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

function WizardHeader({ step, accent }: { step: number; accent: PresetAccent }) {
  const { i18n, t } = useLingui()
  const def = STEPS[step - 1]
  return (
    <div className="flex flex-col gap-3 px-8 pt-6">
      <div className="flex items-center justify-between">
        {def.hasRequiredFields ? (
          <span className="inline-flex items-center bg-[#fef2f2] text-[#ef4444] text-[12px] font-semibold leading-4 px-[10px] py-[4px] rounded-[4px]">
            {t`Required Fields`}
          </span>
        ) : (
          <span />
        )}
        <span
          id="wizard-step-position"
          className="text-[14px] font-bold leading-5 uppercase tracking-wide animate-wizard-enter"
          style={{ color: accent.text, transition: "color 0.4s ease" }}
        >
          {t`Step ${step} of ${STEPS.length}`}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {/* Focus target on step change; described by the "Step X of N" text so a
            screen reader reads the step title together with the position. */}
        <h1
          id="wizard-step-heading"
          tabIndex={-1}
          aria-describedby="wizard-step-position"
          className="text-[30px] font-semibold leading-9 tracking-[-0.75px] text-black outline-none"
        >
          {i18n._(def.title)}
        </h1>
        <p className="text-[14px] font-medium text-[#737373]">{i18n._(def.description)}</p>
      </div>
    </div>
  )
}
function WizardFooter({
  isLastStep,
  canContinue,
  canCreate,
  isCreating,
  onBack,
  onNext,
  onCreate,
  accent,
  hint,
  onScrollToInvalid,
}: {
  isLastStep: boolean
  canContinue: boolean
  canCreate: boolean
  isCreating: boolean
  onBack: () => void
  onNext: () => void
  onCreate: () => void
  accent: PresetAccent
  hint?: string
  onScrollToInvalid?: () => void
}) {
  const { t } = useLingui()
  const isValid = isLastStep ? canCreate : canContinue
  const [attempted, setAttempted] = useState(false)

  useEffect(() => {
    if (isValid) setAttempted(false)
  }, [isValid])

  function handleNext() {
    if (isValid) {
      isLastStep ? onCreate() : onNext()
    } else {
      setAttempted(true)
      onScrollToInvalid?.()
    }
  }

  return (
    <div className="border-t border-[#e5e5e5] px-6 py-4 flex flex-col gap-2">
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-in-out motion-reduce:transition-none",
          attempted && hint ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <p className="pb-1 text-center text-xs text-red-600">{hint}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 w-full gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="flex h-10 min-w-0 w-full items-center justify-center overflow-hidden px-4 font-medium"
        >
          <span className="flex items-center gap-1.5 animate-btn-label-enter">
            <ArrowLeft className="h-4 w-4 shrink-0" />
            {t`Back`}
          </span>
        </Button>

        <Button
          type="button"
          onClick={handleNext}
          disabled={isCreating}
          className="flex h-10 w-full items-center justify-center overflow-hidden px-4 font-medium text-white transition-[background-color,opacity] duration-300 ease-out hover:opacity-90 border-0 disabled:opacity-60"
          style={{ backgroundColor: accent.bg }}
        >
          <span
            key={isLastStep ? "create-final" : "next"}
            className={cn(
              "flex items-center gap-1.5",
              isLastStep ? "animate-btn-final-enter" : "animate-btn-label-enter",
            )}
          >
            {isLastStep ? (
              <>
                {isCreating ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4 shrink-0" />
                )}
                {isCreating ? t`Creating...` : t`Create ADT`}
              </>
            ) : (
              <>
                {t`Next Step`}
                <ArrowRight className="h-4 w-4 shrink-0" />
              </>
            )}
          </span>
        </Button>
      </div>
    </div>
  )
}

function previewShellVars(width: number): CSSProperties {
  return {
    "--preview-w": `${width}px`,
    "--preview-ar": `${width} / 812`,
  } as CSSProperties
}

function PreviewContainer({
  children,
  width = 650,
  variant = "desktop",
}: {
  children: React.ReactNode
  width?: number
  variant?: "desktop" | "dialog"
}) {
  if (variant === "dialog") {
    return (
      <div
        className="mx-auto w-[var(--preview-w)] max-w-full shrink-0 [aspect-ratio:var(--preview-ar)] transition-[width] duration-500"
        style={previewShellVars(width)}
      >
        {children}
      </div>
    )
  }

  return (
    <div
      className="flex h-[812px] max-h-[80%] max-w-[80%] w-[var(--preview-w)] shrink-0 items-stretch transition-[width] duration-500"
      style={{ "--preview-w": `${width}px` } as CSSProperties}
    >
      {children}
    </div>
  )
}

export function BookCreationWizard() {
  const { t, i18n } = useLingui()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { phase, currentStep, setCurrentStep, stepDirection, previewFocus } = useWizard()
  const form = useWizardForm()
  const createMutation = useCreateBook()
  const { apiKey, hasApiKey, anthropicKey, googleKey, customBaseUrl, customApiKey, azureKey, azureRegion, geminiKey } = useApiKey()
  const { data: books, isPending: booksLoading } = useBooks()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const creatingRef = useRef(false)

  const values = useStore(form.store, (s) => s.values)
  const { file, renderStrategy, editingLanguage, outputLanguages, styleguide } = values
  const accent = getPresetAccent(values.selectedPreset)
  const stepIndex = currentStep - 1
  const existingBookLabels = booksLoading ? undefined : books?.map((b: { label: string }) => b.label)
  const stepValidationContext = { existingBookLabels }
  const canContinue =
    currentStep >= 1
      ? STEPS[stepIndex].isValid(values, stepValidationContext)
      : false
  const canCreate = STEPS.every((s) => s.isValid(values, stepValidationContext))
  const stepDef = STEPS[stepIndex]
  const hintDescriptor = stepDef?.hint?.(values, stepValidationContext) ?? null
  const hint = hintDescriptor ? i18n._(hintDescriptor) : undefined

  // Orientation for screen-reader users moving through the wizard.
  const pageTitle =
    phase === "upload"
      ? t`Add Book: Upload PDF`
      : currentStep === 0
        ? t`Add Book: Choose a preset`
        : stepDef
          ? i18n._(stepDef.title)
          : t`Add Book`
  // For the multi-step phase we move focus to the step heading (below), which
  // reads the title, so don't also announce it; for upload/preset there is no
  // such heading, so announce instead.
  usePageTitle(pageTitle, { announce: phase === "upload" || currentStep === 0 })

  // The footer and step container remount on step change (key={currentStep}),
  // dropping keyboard focus to <body>. Move it to the new step's heading so a
  // screen-reader user is never stranded mid-page.
  useEffect(() => {
    if (currentStep < 1) return
    document.getElementById("wizard-step-heading")?.focus()
  }, [currentStep])

  function handleScrollToInvalid() {
    const fieldId = stepDef?.scrollToFirstInvalid?.(values, stepValidationContext)
    if (!fieldId) return
    const el = document.getElementById(fieldId)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    // eslint-disable-next-line lingui/no-unlocalized-strings
    const focusable = el.matches("input,button,select,textarea,[tabindex]")
      ? el
      : el.querySelector<HTMLElement>("input,button,select,textarea,[tabindex]")
    if (focusable) setTimeout(() => focusable.focus({ preventScroll: true }), 300)
  }

  if (phase === "upload") {
    return <StepUpload />
  }

  if (currentStep === 0) {
    return (
      <div className="flex flex-1 min-h-0 flex-col h-full bg-white">
        <StudioTopBar brandLinksHome trailingTitle={<Trans>Add Book</Trans>} />
        <div className="flex flex-1 min-h-0 flex-col overflow-y-auto overflow-x-hidden">
          <Step0Preset />
        </div>
      </div>
    )
  }

  const StepComponent = STEPS[stepIndex].component

  function handleBack() {
    setCurrentStep(currentStep <= 1 ? 0 : currentStep - 1)
  }

  function handleNext() {
    if (currentStep < STEPS.length) setCurrentStep(currentStep + 1)
  }

  async function handleCreate() {
    if (creatingRef.current) return
    creatingRef.current = true
    setSubmitError(null)
    setIsCreating(true)
    try {
      const book = await createMutation.mutateAsync({
        label: values.label.trim(),
        pdf: values.file!,
        config: buildConfigOverrides(values),
      })

      // Kick off extraction automatically so the user lands on the book home
      // with the Extract stage already running — but only when the user intends
      // to process the book here ("whole" or windowed "range"). For the "split"
      // scope we skip it: each contributor extracts their own page-range part,
      // so extracting the full book on this machine would be the very cost the
      // split feature avoids.
      if (values.scope !== "split" && hasApiKey) {
        // Seed the run status the book page reads, so it paints "Extract
        // queued" on first render. Without this the page mounts with a cold
        // cache and shows an idle pipeline until its own step-status fetch
        // round-trips — several seconds while the server is busy opening the
        // PDF, which reads as "the run never started".
        queryClient.setQueryData(["books", book.label, "step-status"], {
          stages: { extract: "queued" },
          steps: {},
          error: null,
        })
        try {
          await api.runStages(
            book.label,
            apiKey,
            { fromStage: "extract", toStage: "extract" },
            {
              anthropicApiKey: anthropicKey || undefined,
              googleApiKey: googleKey || undefined,
              customBaseUrl: customBaseUrl || undefined,
              customApiKey: customApiKey || undefined,
              azure: { key: azureKey, region: azureRegion },
              geminiApiKey: geminiKey || undefined,
            },
          )
        } catch (pipelineError) {
          console.error("[wizard] extract kickoff failed:", pipelineError)
          // Roll the seeded status back — nothing is running.
          queryClient.removeQueries({ queryKey: ["books", book.label, "step-status"] })
        }
      }

      // When splitting, surface the Split & merge panel on the overview.
      if (values.scope === "split" && typeof window !== "undefined") {
        window.sessionStorage.setItem("adt:focus-parts", book.label)
      }

      navigate({ to: "/books/$label/$step", params: { label: book.label, step: "book" } })
    } catch (error) {
      creatingRef.current = false
      setIsCreating(false)
      setSubmitError(error instanceof Error ? error.message : t`Failed to create book.`)
    }
  }
  const previewWidth = currentStep === 2 ? getPreviewWidth(renderStrategy) : 650

  const isFixedLayout = values.renderStrategy === "fixed_layout"

  // When scoping to a page range, preview exactly which pages will be processed
  // — emphasise the selected range and dim the rest. Only once a bound is typed,
  // so an untouched range doesn't read as "whole book selected". An empty end
  // means "to the last page"; the preview clamps it to the real page count.
  const previewRange =
    values.scope === "range" && (values.startPage !== "" || values.endPage !== "")
      ? {
          startPage: parseInt(values.startPage) || 1,
          endPage: parseInt(values.endPage) || Number.MAX_SAFE_INTEGER,
        }
      : null

  function renderPreviewContent({mobileMode}: {mobileMode: boolean} = {mobileMode: false}) {
    if (currentStep === 1)
      return <PdfCoverPreview file={file} width={650} height={812} highlightRange={previewRange} />
    if (currentStep === 2) return <LayoutPreview strategy={renderStrategy} />
    if (currentStep === 3) {
      if (isFixedLayout) return <PdfCoverPreview file={file} width={650} height={812} />
      return <ImageProcessingPreviewPane focus={previewFocus} mobile={mobileMode} />
    }
    if (currentStep === 4)
      return <LanguagesPreviewPane editingLanguage={editingLanguage} outputLanguages={outputLanguages} />
    if (currentStep === 5)
      return <StyleguidePreviewPane styleguide={styleguide} />
    return <span className="text-sm text-[#a3a3a3]">{t`Book preview`}</span>
  }

  const previewDesktop = (
    <PreviewContainer width={previewWidth} variant="desktop">
      {renderPreviewContent()}
    </PreviewContainer>
  )

  const previewDialog = (
    <PreviewContainer width={previewWidth} variant="dialog">
      {renderPreviewContent({mobileMode: true})}
    </PreviewContainer>
  )

  return (
    <div className="flex flex-1 min-h-0 flex-col h-full bg-[#f5f5f5]">
      <StudioTopBar brandLinksHome trailingTitle={<Trans>Add Book</Trans>} />
      <div className="flex flex-1 min-h-0 lg:gap-[10px] overflow-hidden">
        <aside className="bg-white flex flex-col w-full lg:w-[633px] lg:shrink-0 overflow-hidden">
          <div className="flex items-center justify-end px-4 py-2.5 border-b border-[#e5e5e5] lg:hidden">
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="flex items-center gap-1.5 text-sm font-medium"
              style={{ color: accent.text, transition: "color 0.4s ease" }}
            >
              <Eye className="h-4 w-4" />
              {t`Preview`}
            </button>
          </div>

          <div className="mx-auto flex w-full min-h-0 lg:pr-8 flex-1 flex-col overflow-hidden">
            <WizardHeader step={currentStep} accent={accent} />

            <div className="wizard-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              <div
                key={currentStep}
                className={stepDirection === "forward" ? "animate-step-enter-forward" : "animate-step-enter-back"}
              >
                <StepComponent />
              </div>
            </div>
          </div>


          {(submitError || createMutation.isError) && (
            <p className="px-6 pb-3 text-sm text-center text-[#ef4444] animate-btn-label-enter">
              {submitError ?? createMutation.error?.message ?? t`Failed to create book.`}
            </p>
          )}
          <WizardFooter
            key={currentStep}
            isLastStep={currentStep === STEPS.length}
            canContinue={canContinue}
            canCreate={canCreate && !isCreating}
            isCreating={isCreating}
            onBack={handleBack}
            onNext={handleNext}
            onCreate={handleCreate}
            accent={accent}
            hint={hint}
            onScrollToInvalid={handleScrollToInvalid}
          />
        </aside>

        <main className="hidden flex-1 items-center justify-center overflow-auto lg:flex">
          {previewDesktop}
        </main>
      </div>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex max-h-[96dvh] w-full max-w-[min(97vw,calc(100vw-0.5rem))] flex-col overflow-hidden border-0 bg-[#f5f5f5] p-3 sm:p-5 rounded-lg">
          <DialogTitle className="sr-only">{t`Book Preview`}</DialogTitle>
          <DialogDescription className="sr-only">
            {t`This is a preview of the options you have selected for your book, each option affects the preview in a different way.`}
          </DialogDescription>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto h-full">
            {previewDialog}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}
