import { Fragment, useEffect, useRef, useState, type ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useStore } from "@tanstack/react-form"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, ChevronRight, FileText, Gauge, Loader2 } from "lucide-react"
import { EFFECTS_OPTIONS } from "@/components/app/screens/settings/options"
import { FlowTopBar } from "@/components/FlowTopBar"
import { useWizard } from "@/components/wizard"
import { useWizardForm } from "@/components/wizard/wizardForm"
import { suggestLabel } from "@/components/wizard/step1BasicInfo/PdfField"
import { readEffectsMode, setEffectsMode, useReducedEffects, type EffectsMode } from "@/lib/effects"
import { cn } from "@/lib/utils"
import { BookCreationWizard } from "@/components/wizard/BookCreationWizard"
import { ChooseScreen } from "./choose/ChooseScreen"
import { CreateScreen } from "./create/CreateScreen"
import { DecideScreen } from "./decide/DecideScreen"
import { ReviewScreen } from "./review/ReviewScreen"
import { applyAiPicks, useAiPicks, type SettingKey } from "./review/setup"
import { LoaderScreen } from "./loader/LoaderScreen"
import { MOCK_BOOKS, loadMockFile } from "./mockBooks"
import { UploadScreen } from "./upload/UploadScreen"
import { useUploadFlow } from "./upload/useUploadFlow"

/** Placeholder for a screen that is not designed yet. */
function NextScreenPlaceholder({ label, description, onBack }: { label: ReactNode; description: ReactNode; onBack: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <FlowTopBar title={<Trans>Add Book</Trans>} />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center motion-safe:animate-step-enter-forward">
        <span className="rounded-full border border-dashed px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
        <p className="max-w-md text-[14px] text-muted-foreground">{description}</p>
        <button type="button" onClick={onBack} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-muted px-3 text-sm font-medium transition-colors hover:bg-muted/70">
          <ArrowLeft className="size-4" />
          <Trans>Back</Trans>
        </button>
      </div>
    </div>
  )
}

function UploadStep() {
  const flow = useUploadFlow()
  return <UploadScreen flow={flow} />
}

export type ProtoStep = "upload" | "choose" | "loader" | "decide" | "review" | "create" | "opened" | "manual"
type Screen = Exclude<ProtoStep, "upload">

const MAIN_STEPS: { id: ProtoStep; label: ReactNode }[] = [
  { id: "upload", label: <Trans>Upload</Trans> },
  { id: "choose", label: <Trans>Choose</Trans> },
  { id: "loader", label: <Trans>AI loader</Trans> },
  { id: "decide", label: <Trans>Decide</Trans> },
  { id: "review", label: <Trans>Review</Trans> },
  { id: "create", label: <Trans>Create</Trans> },
]


function EffectsSwitch() {
  const { t, i18n } = useLingui()
  const [mode, setMode] = useState<EffectsMode>(readEffectsMode)
  const reduced = useReducedEffects()
  return (
    <div className="flex items-center gap-0.5 pr-1">
      <span title={reduced ? t`Effects are reduced` : t`Full effects`} className={cn("grid size-7 place-items-center", reduced ? "text-brand-600" : "text-muted-foreground")}>
        <Gauge className="size-3.5" />
      </span>
      {EFFECTS_OPTIONS.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => {
            setMode(o.key)
            setEffectsMode(o.key)
          }}
          className={cn("h-7 rounded-full px-2.5 transition-colors duration-150", mode === o.key ? "bg-muted text-foreground" : "text-foreground/60 hover:bg-muted")}
        >
          {i18n._(o.label)}
        </button>
      ))}
    </div>
  )
}

/** Lab toolbar (bottom-left): the mock PDF plus every prototype step, so any screen is one click away. */
function LabToolbar({ mock, loading, current, onMock, onStep }: { mock?: string; loading: boolean; current: ProtoStep; onMock: (id: string | undefined) => void; onStep: (step: ProtoStep) => void }) {
  const stepButton = (id: ProtoStep, label: ReactNode, number?: number) => (
    <button
      key={id}
      type="button"
      onClick={() => onStep(id)}
      aria-current={current === id ? "step" : undefined}
      className={cn("inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 transition-colors duration-150", current === id ? "bg-brand-600 text-primary-foreground" : "text-foreground/80 hover:bg-muted")}
    >
      {number !== undefined && <span className={cn("grid size-4 place-items-center rounded-full text-[10px] font-bold tabular-nums", current === id ? "bg-card/25" : "bg-muted text-muted-foreground")}>{number}</span>}
      {label}
    </button>
  )
  return (
    <div className="fixed left-1/2 top-1.5 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-card/90 p-1 text-[12px] font-medium shadow-lg backdrop-blur">
      {MOCK_BOOKS.length > 0 && (
        <label className="flex items-center gap-2 pl-2">
          {loading ? <Loader2 className="size-3.5 animate-spin text-brand-600" /> : <FileText className="size-3.5 text-muted-foreground" />}
          <select value={mock ?? ""} onChange={(e) => onMock(e.target.value || undefined)} className="h-7 max-w-[170px] cursor-pointer rounded-full border-0 bg-muted px-3 text-[12px] font-medium outline-none transition-colors hover:bg-muted/70">
            <option value="">—</option>
            {MOCK_BOOKS.map((book) => (
              <option key={book.id} value={book.id}>
                {book.id}
              </option>
            ))}
          </select>
        </label>
      )}
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      <nav className="flex items-center gap-0.5">
        {MAIN_STEPS.map((step, i) => (
          <Fragment key={step.id}>
            {i > 0 && <ChevronRight aria-hidden className="size-3 text-muted-foreground/50" />}
            {stepButton(step.id, step.label, i + 1)}
          </Fragment>
        ))}
        <span aria-hidden className="mx-1 h-5 w-px bg-border" />
        {stepButton("manual", <Trans>Manual</Trans>)}
      </nav>
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      <EffectsSwitch />
    </div>
  )
}

/**
 * Prototype of the #333 Auto-mode path, built screen by screen:
 * upload → choose AI vs manual → AI loader → decide (when the AI isn't sure) → review (name,
 * languages and the AI's setup in one screen) → create.
 * Manual is the real wizard (preset grid). Switching between auto and manual only happens on the
 * choose step; once on the AI path every setting is still editable on the review (All settings).
 * `?mock=<id>` preloads a mock PDF; `&step=<step>` opens on that step (the URL follows the flow).
 */
export function AutoModePrototype({ mock, step }: { mock?: string; step?: ProtoStep }) {
  const navigate = useNavigate()
  const { phase, setPhase, setCurrentStep } = useWizard()
  const form = useWizardForm()
  const file = useStore(form.store, (s) => s.values.file)
  const [screen, setScreen] = useState<Screen>(step && step !== "upload" ? step : "choose")
  const [loadingMock, setLoadingMock] = useState(false)
  const pendingStep = useRef<Screen | null>(step && step !== "upload" ? step : null)
  const current: ProtoStep = phase === "upload" ? "upload" : screen
  const [loadedMock, setLoadedMock] = useState<string>()
  const requestedMock = mock ?? (pendingStep.current ? MOCK_BOOKS[0]?.id : undefined)
  const mockId = mock ?? loadedMock

  const loadBook = (id: string | undefined) => {
    const book = MOCK_BOOKS.find((b) => b.id === id)
    if (!book) return () => {}
    let cancelled = false
    setLoadingMock(true)
    loadMockFile(book)
      .then((loaded) => {
        if (cancelled) return
        form.setFieldValue("file", loaded)
        form.setFieldValue("label", suggestLabel(loaded) || book.id)
        setLoadedMock(book.id)
        if (pendingStep.current) {
          setScreen(pendingStep.current)
          setPhase("wizard")
          pendingStep.current = null
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMock(false)
      })
    return () => {
      cancelled = true
    }
  }

  useEffect(() => {
    const cancel = loadBook(requestedMock)
    return () => cancel()
  }, [requestedMock])

  useEffect(() => {
    if (loadingMock) return
    navigate({ to: "/labs/auto-mode", search: { ...(mockId ? { mock: mockId } : {}), step: current }, replace: true })
  }, [current, mockId, loadingMock])

  const [asked, setAsked] = useState<SettingKey[]>([])
  const setupFor = useRef<string | null>(null)
  const { picks: aiPicks, ready: picksReady } = useAiPicks()
  const picks = { ...aiPicks, asked }
  const applySetup = (renderStrategy?: string, nextAsked: SettingKey[] = []) => {
    applyAiPicks(form, aiPicks, renderStrategy ? { renderStrategy: renderStrategy as never } : {})
    setAsked(nextAsked)
    setupFor.current = file?.name ?? null
  }
  const needsSetup = ["review", "create"].includes(screen) && phase === "wizard"
  useEffect(() => {
    if (needsSetup && file && picksReady && setupFor.current !== file.name) applySetup()
  }, [needsSetup, file?.name, picksReady])

  useEffect(() => {
    if (screen === "manual") setCurrentStep(0)
  }, [screen])
  const openManual = () => setScreen("manual")

  const goTo = (target: ProtoStep) => {
    if (target === "upload") return setPhase("upload")
    if (file) {
      setScreen(target)
      setPhase("wizard")
      return
    }
    pendingStep.current = target
    loadBook(mockId ?? MOCK_BOOKS[0]?.id)
  }

  let content: ReactNode
  if (phase === "upload") content = <UploadStep />
  else if (screen === "loader")
    content = (
      <LoaderScreen
        onDone={() => {
          applySetup()
          setScreen("review")
        }}
        onUnsure={() => setScreen("decide")}
        onStartOver={() => setScreen("choose")}
      />
    )
  else if (screen === "decide")
    content = (
      <DecideScreen
        onBack={() => setScreen("choose")}
        onDone={(look) => {
          applySetup(look, ["look"])
          setScreen("review")
        }}
      />
    )
  else if (screen === "review") content = <ReviewScreen picks={picks} onBack={() => setScreen(asked.length ? "decide" : "choose")} onCreate={() => setScreen("create")} />
  else if (screen === "create") content = <CreateScreen onOpen={() => setScreen("opened")} />
  else if (screen === "opened")
    content = <NextScreenPlaceholder label={<Trans>The book page</Trans>} description={<Trans>In the app this opens the book&apos;s own page, with the pipeline already running.</Trans>} onBack={() => setScreen("create")} />
  else if (screen === "manual") content = <BookCreationWizard />
  else content = <ChooseScreen onAuto={() => setScreen("loader")} onManual={openManual} onBack={() => setPhase("upload")} />

  return (
    <>
      {content}
      <LabToolbar
        mock={mockId}
        loading={loadingMock}
        current={current}
        onMock={(id) => navigate({ to: "/labs/auto-mode", search: { ...(id ? { mock: id } : {}), step: current }, replace: true })}
        onStep={goTo}
      />
    </>
  )
}
