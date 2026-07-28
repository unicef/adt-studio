import { useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { MathSpeechEvaluationItem } from "@adt/types"
import { AlertTriangle, Check, Loader2, RotateCcw, Sigma } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/api/client"
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
  apiKey,
}: {
  bookLabel: string
  language: string
  apiKey: string
}) {
  const { t } = useLingui()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: [QUERY_KEY, bookLabel, language],
    queryFn: () => api.getMathSpeechEvaluation(bookLabel, language),
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY, bookLabel, language] })

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
    mutationFn: () => api.runMathSpeechEvaluation(bookLabel, language, apiKey),
    onSuccess: invalidate,
  })

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
          disabled={run.isPending || !apiKey}
          onClick={() => run.mutate()}
        >
          {run.isPending && <Loader2 className="size-3.5 animate-spin" />}
          <Trans>Check maths</Trans>
        </Button>
      </header>

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
