import { useEffect, useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { useStore } from "@tanstack/react-form"
import { Loader2, ArrowLeft } from "lucide-react"
import type { SetupRecommendation } from "@adt/types"
import { api } from "@/api/client"
import { Button } from "@/components/ui/button"
import { FlowTopBar } from "@/components/FlowTopBar"
import { useApiKey } from "@/hooks/use-api-key"
import { useWizard } from "../index"
import { useWizardForm } from "../wizardForm"
import { applyRecommendation } from "./applyRecommendation"
import { ReviewFlowA } from "./ReviewFlowA"

/**
 * Auto mode (issue #333, experiment): the AI reads the PDF, shows what it
 * picked, and the user confirms or changes. Questions only when needed.
 */
export function AutoMode({
  onCreate,
  isCreating,
  createError,
}: {
  onCreate: (setupRecommendationId: string) => void
  isCreating: boolean
  createError: string | null
}) {
  const { setPhase, setCurrentStep, setCommittedStep0Preset } = useWizard()
  const form = useWizardForm()
  const file = useStore(form.store, (s) => s.values.file)
  const { apiKey } = useApiKey()
  const [rec, setRec] = useState<SetupRecommendation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const started = useRef(0)

  useEffect(() => {
    if (!file) return
    const controller = new AbortController()
    setRec(null)
    setError(null)
    started.current = performance.now()
    const timer = window.setInterval(() => setElapsed(performance.now() - started.current), 200)
    api
      .recommendSetup(file, apiKey, controller.signal)
      .then(setRec)
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => window.clearInterval(timer))
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [file, apiKey, attempt])

  function backToPresets() {
    setPhase("wizard")
    setCurrentStep(0)
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col h-full bg-background">
      <FlowTopBar title={<Trans>Add Book</Trans>} />
      {rec && file ? (
        <ReviewFlowA
          rec={rec}
          file={file}
          isCreating={isCreating}
          error={createError}
          onBack={backToPresets}
          onCustomize={(settings, range) => {
            applyRecommendation(form, settings, range)
            setCommittedStep0Preset(settings.preset!.value as "textbook" | "storybook" | "reference")
            setPhase("wizard")
            setCurrentStep(1)
          }}
          onCreate={(settings, range) => {
            applyRecommendation(form, settings, range)
            onCreate(rec.id)
          }}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
          {error ? (
            <>
              <p className="max-w-md text-sm text-destructive">{error}</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={backToPresets}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" />
                  <Trans>Choose settings myself</Trans>
                </Button>
                <Button onClick={() => setAttempt((n) => n + 1)}>
                  <Trans>Try again</Trans>
                </Button>
              </div>
            </>
          ) : (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
              <h1 className="text-xl font-semibold text-foreground">
                <Trans>Reading your book</Trans>
              </h1>
              <p className="max-w-md text-sm text-muted-foreground">
                <Trans>
                  We measure every page, then the AI looks at the pages twice in two different ways. If the two
                  readings disagree about something that matters, we'll ask you.
                </Trans>
              </p>
              <p className="text-sm tabular-nums text-muted-foreground" aria-live="off">
                <Trans>{(elapsed / 1000).toFixed(1)} s</Trans>
              </p>
              <Button variant="ghost" onClick={backToPresets}>
                <Trans>Cancel and choose settings myself</Trans>
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
