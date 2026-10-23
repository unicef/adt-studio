import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { ArrowUp, Loader2, Sparkles } from "lucide-react"
import { api, type PageSummarySection } from "@/api/client"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useApiKey, useBookStructuredTextAvailability } from "@/hooks/use-api-key"
import { bookTasksKey, useBookTasks } from "@/hooks/use-book-tasks"
import { useAiEditHistory } from "@/hooks/use-pages"
import { cn } from "@/lib/utils"
import { HistoryTurn, Shell, type ShellHeader } from "./AiEditShell"

const SUGGESTIONS: MessageDescriptor[] = [
  msg`Make the title larger and bolder`,
  msg`Place the image beside the text`,
  msg`Add more space between paragraphs`,
  msg`Make the text larger and easier to read`,
]

export interface AiEditPanelWiredProps {
  label: string
  pageId: string | null
  pageLabel?: string
  sections?: PageSummarySection[]
  sectionIndex?: number | null
  onSelectSection?: (sectionIndex: number) => void
  empty?: boolean
  open: boolean
  onCollapse: () => void
  header?: ShellHeader
}

export function AiEditPanelWired({
  label,
  pageId,
  pageLabel,
  sections,
  sectionIndex,
  onSelectSection,
  empty,
  open,
  onCollapse,
  header,
}: AiEditPanelWiredProps) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const { apiKey } = useApiKey()
  const canEdit = useBookStructuredTextAvailability(label)
  const { tasks } = useBookTasks(label)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const visible = (sections ?? []).filter((section) => !section.isPruned)
  const [picked, setPicked] = useState<number | null>(null)
  useEffect(() => setPicked(null), [pageId])
  const current = sectionIndex ?? picked ?? visible[0]?.sectionIndex ?? 0
  const position = visible.findIndex((section) => section.sectionIndex === current)

  const history = useAiEditHistory(label, pageId ?? "", current, {
    enabled: open && !empty && !!pageId,
  })
  const turns = history.data?.history ?? []

  const [instruction, setInstruction] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const running = tasks.some(
    (task) => task.kind === "ai-edit" && task.pageId === pageId && (task.status === "running" || task.status === "queued"),
  )
  const busy = submitting || running

  const wasRunning = useRef(false)
  useEffect(() => {
    if (running) {
      wasRunning.current = true
      return
    }
    if (!wasRunning.current) return
    wasRunning.current = false
    void queryClient.invalidateQueries({ queryKey: ["books", label, "pages"] })
  }, [running, label, queryClient])

  const choose = (index: number) => {
    setPicked(index)
    onSelectSection?.(index)
  }

  const submit = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || !pageId || !canEdit || busy) return
    setError(null)
    setSubmitting(true)
    setInstruction("")
    api
      .aiEditSection(label, pageId, current, trimmed, apiKey)
      .then(() => queryClient.invalidateQueries({ queryKey: bookTasksKey(label) }))
      .catch((err: unknown) => {
        setInstruction(trimmed)
        setError(err instanceof Error ? err.message : t`The AI edit could not start.`)
      })
      .finally(() => setSubmitting(false))
  }

  const sectionName = position >= 0 ? t`section ${position + 1}` : t`section`

  const composer = !canEdit && !empty ? (
    <div className="flex items-center justify-between gap-3 border-t p-3">
      <span className="text-[12px] leading-snug text-muted-foreground">
        <Trans>Edit with AI needs an AI provider for this book.</Trans>
      </span>
      <button
        type="button"
        onClick={() => void navigate({ to: "/pipeline/$label/settings/$section", params: { label, section: "api-keys" } })}
        className="shrink-0 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors hover:bg-muted"
      >
        <Trans>Set up AI access</Trans>
      </button>
    </div>
  ) : (
    <form
      className="border-t p-3"
      onSubmit={(event) => {
        event.preventDefault()
        submit(instruction)
      }}
    >
      <div
        className={cn(
          "flex items-center gap-2 rounded-[10px] border bg-card py-1.5 pl-3 pr-1.5 transition-[border-color,box-shadow] focus-within:border-brand-400 focus-within:shadow-[0_0_0_3px_var(--brand-50)]",
          (!canEdit || empty) && "opacity-60",
        )}
      >
        <Sparkles className="size-3.5 shrink-0 text-brand-600" />
        <input
          ref={inputRef}
          type="text"
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          disabled={!canEdit || empty || !pageId}
          placeholder={
            empty
              ? t`Available once this page is built`
              : canEdit
                ? t`Ask the AI to change ${sectionName}…`
                : t`Set up an AI provider to edit with AI`
          }
          aria-label={t`Instruction for the AI`}
          className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={!instruction.trim() || busy || !canEdit}
          aria-label={t`Send`}
          className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-600 text-white transition-[opacity,transform] duration-150 hover:bg-brand-700 active:scale-95 disabled:opacity-35"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUp className="size-3.5" />}
        </button>
      </div>
    </form>
  )

  return (
    <Shell
      title={<Trans>Edit with AI</Trans>}
      meta={pageLabel ? `${pageLabel} · ${sectionName}` : ""}
      composerPlaceholder=""
      composer={composer}
      onCollapse={onCollapse}
      header={header}
    >
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-3.5">
          {empty ? (
            <p className="rounded-xl border border-dashed px-3 py-6 text-center text-[11.5px] leading-relaxed text-muted-foreground">
              <Trans>AI edits change a page's layout, so they work once the page is built. Pages land here as the storyboard lays them out.</Trans>
            </p>
          ) : (
            <>
              {visible.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <Trans>Section</Trans>
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {visible.map((section, index) => (
                      <button
                        key={section.sectionIndex}
                        type="button"
                        onClick={() => choose(section.sectionIndex)}
                        title={section.textPreview || section.sectionType}
                        className={cn(
                          "min-w-7 rounded-md border px-2 py-1 text-[11px] font-medium tabular-nums transition-colors duration-150",
                          section.sectionIndex === current
                            ? "border-brand-300 bg-brand-50 text-brand-700"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        {index + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {turns.length === 0 && !busy && (
                <p className="py-4 text-center text-[11.5px] leading-relaxed text-muted-foreground">
                  <Trans>No AI edits on this section yet.</Trans>
                </p>
              )}
              {turns.map((turn) => (
                <HistoryTurn key={turn.correlationId} turn={turn} />
              ))}

              {busy && (
                <div className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 text-[12px] text-brand-800 animate-in fade-in duration-200">
                  <Loader2 className="size-3.5 animate-spin" />
                  <Trans>Editing {sectionName}… the page refreshes when it is done.</Trans>
                </div>
              )}
              {error && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-700 animate-in fade-in duration-200">
                  {error}
                </p>
              )}

              <div className="flex flex-col gap-1.5 border-t border-dashed pt-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <Trans>Try</Trans>
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion.id ?? String(suggestion.message)}
                      type="button"
                      disabled={!canEdit || busy}
                      onClick={() => {
                        setInstruction(i18n._(suggestion))
                        inputRef.current?.focus()
                      }}
                      className="rounded-full border px-2.5 py-1 text-[11px] text-foreground transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50"
                    >
                      {i18n._(suggestion)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </Shell>
  )
}
