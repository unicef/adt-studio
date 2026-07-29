import { useEffect, useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { MathSpeechEvaluationItem } from "@adt/types"
import { AlertTriangle, Check, Loader2, RotateCcw, Sigma } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/api/client"
import { useApiKey } from "@/hooks/use-api-key"
import { useActiveConfig } from "@/hooks/use-debug"
import { useBookTasks } from "@/hooks/use-book-tasks"
import { cn } from "@/lib/utils"

/**
 * Review queue for maths that could not be converted to speech with
 * confidence.
 *
 * An entry appears here only when the deterministic converter and the judge
 * disagree about how an expression should be read, so the queue is short. A
 * reviewer either keeps the converter's output or supplies the wording to
 * speak — nothing here changes what a learner hears without that decision.
 */

const QUERY_KEY = "math-speech-evaluation"

function ItemCard({
  item,
  onAcceptAnyway,
  onResolve,
  onClear,
  isPending,
}: {
  item: MathSpeechEvaluationItem
  onAcceptAnyway: (entryId: string) => void
  onResolve: (entryId: string, text: string) => void
  onClear: (entryId: string) => void
  isPending: boolean
}) {
  const { t } = useLingui()
  const [draft, setDraft] = useState(item.suggested_text ?? item.walker_text)
  const decided = Boolean(item.accepted_anyway || item.resolved_text)

  return (
    <div
      className={cn(
        "rounded-md border p-3 space-y-3",
        decided
          ? "border-border bg-muted/30"
          : "border-destructive/40 bg-destructive/5",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <code className="text-xs text-muted-foreground">{item.entry_id}</code>
            {item.severity && !decided && (
              <Badge variant={item.severity === "high" ? "destructive" : "secondary"}>
                {item.severity}
              </Badge>
            )}
            {item.accepted_anyway && (
              <Badge variant="secondary">
                <Trans>Kept as generated</Trans>
              </Badge>
            )}
            {item.resolved_text && (
              <Badge variant="secondary">
                <Trans>Wording set</Trans>
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{item.rationale}</p>
        </div>
        {decided && (
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => onClear(item.entry_id)}
          >
            <RotateCcw className="size-3.5" />
            <Trans>Undo</Trans>
          </Button>
        )}
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            <Trans>Source</Trans>
          </p>
          <code className="block rounded bg-muted p-2 text-xs break-all">
            {item.latex}
          </code>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            <Trans>Will be read as</Trans>
          </p>
          <code className="block rounded bg-muted p-2 text-xs break-all">
            {item.resolved_text ?? item.walker_text}
          </code>
        </div>
      </div>

      {!decided && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            <Trans>Wording to speak instead</Trans>
          </p>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            aria-label={t`Wording to speak instead`}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={isPending || !draft.trim()}
              onClick={() => onResolve(item.entry_id, draft.trim())}
            >
              <Check className="size-3.5" />
              <Trans>Use this wording</Trans>
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => onAcceptAnyway(item.entry_id)}
            >
              <Trans>Keep as generated</Trans>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function MathSpeechReviewPanel({
  bookLabel,
  language,
}: {
  bookLabel: string
  language: string
}) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const { tasks, isTaskRunning } = useBookTasks(bookLabel)
  const {
    apiKey,
    anthropicKey,
    googleKey,
    customBaseUrl,
    customApiKey,
    azureKey,
    azureRegion,
    geminiKey,
  } = useApiKey()
  const { data: activeConfigData } = useActiveConfig(bookLabel)

  // The judge model is configurable, so the key that matters is whichever
  // provider it names — not always OpenAI.
  const judgeModel =
    ((
      (activeConfigData?.merged as Record<string, unknown> | undefined)
        ?.math_speech_evaluation as Record<string, unknown> | undefined
    )?.judge_model as string | undefined) ?? "openai:gpt-5.4"
  const judgeProvider = judgeModel.split(":")[0]?.toLowerCase() ?? "openai"

  const providerCredentials = {
    anthropicApiKey: anthropicKey || undefined,
    googleApiKey: googleKey || undefined,
    customBaseUrl: customBaseUrl || undefined,
    customApiKey: customApiKey || undefined,
    geminiApiKey: geminiKey || undefined,
    ...(azureKey && azureRegion
      ? { azure: { key: azureKey, region: azureRegion } }
      : {}),
  }

  const keyForProvider: Record<string, string> = {
    openai: apiKey,
    anthropic: anthropicKey,
    google: googleKey || geminiKey,
    gemini: geminiKey || googleKey,
    azure: azureKey,
    custom: customApiKey || customBaseUrl,
  }
  const hasJudgeKey = Boolean(keyForProvider[judgeProvider] ?? apiKey)

  // The check runs as a background task, so the response to the POST says
  // nothing about the outcome. Watch the task instead.
  const checkRunning = isTaskRunning("math-speech-evaluation")
  const lastCheck = useMemo(
    () =>
      [...tasks]
        .filter((task) => task.kind === "math-speech-evaluation")
        .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0],
    [tasks],
  )

  const { data, isLoading } = useQuery({
    queryKey: [QUERY_KEY, bookLabel, language],
    queryFn: () => api.getMathSpeechEvaluation(bookLabel, language),
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY, bookLabel, language] })

  useEffect(() => {
    if (checkRunning) return
    // Re-reads once the run settles; `checkRunning` flipping false is the edge
    // that matters, so it is the only dependency.
    invalidate()
  }, [checkRunning])

  const acceptAnyway = useMutation({
    mutationFn: (entryId: string) =>
      api.acceptMathSpeechItemAnyway(bookLabel, language, entryId),
    onSuccess: invalidate,
  })

  const resolve = useMutation({
    mutationFn: ({ entryId, text }: { entryId: string; text: string }) =>
      api.resolveMathSpeechItem(bookLabel, language, entryId, text),
    onSuccess: invalidate,
  })

  const clear = useMutation({
    mutationFn: (entryId: string) =>
      api.clearMathSpeechItemDecision(bookLabel, language, entryId),
    onSuccess: invalidate,
  })

  const run = useMutation({
    mutationFn: (force: boolean = false) =>
      api.runMathSpeechEvaluation(bookLabel, language, apiKey, providerCredentials, force),
    onSuccess: invalidate,
  })
  // A run whose inputs are unchanged returns without judging anything. Saying so
  // is the difference between "already up to date" and "the button is broken".
  const skippedAsCurrent = run.data?.status === "current"

  const isPending =
    acceptAnyway.isPending || resolve.isPending || clear.isPending

  // Flagged entries first, and among those the undecided ones — a reviewer
  // should not have to hunt for what still needs them.
  const flagged = useMemo(() => {
    const items = data?.evaluation?.items ?? []
    return items
      .filter((item) => !item.acceptable)
      .sort((a, b) => {
        const decided = (i: MathSpeechEvaluationItem) =>
          i.accepted_anyway || i.resolved_text ? 1 : 0
        return decided(a) - decided(b)
      })
  }, [data])

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <Trans>Loading maths pronunciation review…</Trans>
      </div>
    )
  }

  // A book with no maths has nothing to review — show nothing at all rather
  // than an empty panel on every language book.
  if ((data?.mathsEntries ?? 0) === 0 && !data?.evaluation) return null

  const summary = data?.evaluation?.summary
  const pending = data?.pending ?? 0

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sigma className="size-4" />
          <h3 className="text-sm font-semibold">
            <Trans>Maths pronunciation</Trans>
          </h3>
          {pending > 0 && (
            <Badge variant="destructive">
              {t`${pending} to review`}
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={run.isPending || checkRunning || !hasJudgeKey}
          title={
            hasJudgeKey
              ? undefined
              : t`A ${judgeProvider} key is required for the configured judge model. Add one in Book settings.`
          }
          onClick={() => run.mutate(false)}
        >
          {(run.isPending || checkRunning) && (
            <Loader2 className="size-3.5 animate-spin" />
          )}
          {checkRunning ? <Trans>Checking…</Trans> : <Trans>Check maths</Trans>}
        </Button>
      </header>

      {/* Without this the button simply does nothing when no key is set, with
          no indication why. */}
      {!hasJudgeKey && (
        <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {t`The judge model ${judgeModel} needs a ${judgeProvider} key. Add one in Book settings, or pick a different model under Speech settings.`}
          </span>
        </p>
      )}

      {/* The check runs in the background, so a failure surfaces on the task
          rather than on the request that started it. */}
      {lastCheck?.status === "failed" && !checkRunning && (
        <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            <Trans>The maths check failed.</Trans>{" "}
            <span className="text-muted-foreground">{lastCheck.error}</span>
          </span>
        </p>
      )}

      {run.isError && (
        <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="text-muted-foreground">
            {run.error instanceof Error ? run.error.message : String(run.error)}
          </span>
        </p>
      )}

      {skippedAsCurrent && !checkRunning && (
        <p className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 p-2 text-sm">
          <span>
            <Trans>
              Already checked — nothing has changed since the last run.
            </Trans>
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={run.isPending || !hasJudgeKey}
            onClick={() => run.mutate(true)}
          >
            <Trans>Check again anyway</Trans>
          </Button>
        </p>
      )}

      {data?.stale && (
        <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <Trans>
            The text has changed since this check ran. Run it again to review the
            current maths.
          </Trans>
        </p>
      )}

      {!data?.evaluation && (
        <p className="text-sm text-muted-foreground">
          <Trans>
            Maths in this book has not been checked yet. Run the check to see
            anything that may be read aloud incorrectly.
          </Trans>
        </p>
      )}

      {summary && flagged.length === 0 && (
        <p className="text-sm text-muted-foreground">
          <Trans>
            Nothing needs review. Every expression converted cleanly.
          </Trans>
        </p>
      )}

      {flagged.length > 0 && (
        <div className="space-y-3">
          {flagged.map((item) => (
            <ItemCard
              key={item.entry_id}
              item={item}
              isPending={isPending}
              onAcceptAnyway={(id) => acceptAnyway.mutate(id)}
              onResolve={(id, text) => resolve.mutate({ entryId: id, text })}
              onClear={(id) => clear.mutate(id)}
            />
          ))}
        </div>
      )}

      {summary && (
        <p className="text-xs text-muted-foreground">
          {t`${summary.not_evaluated ?? 0} expressions converted without needing review.`}
        </p>
      )}
    </section>
  )
}
