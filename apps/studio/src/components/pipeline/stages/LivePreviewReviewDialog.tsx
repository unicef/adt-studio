import { useEffect, useMemo, useRef, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import {
  Check,
  Copy,
  Loader2,
  MessageSquare,
  RefreshCw,
  Trash2,
  UserMinus,
  Users,
} from "lucide-react"
import QRCode from "qrcode"
import { api } from "@/api/client"
import { useApiKey } from "@/hooks/use-api-key"
import { useBookTasks } from "@/hooks/use-book-tasks"
import { usePreviewLiveSocket } from "@/hooks/use-preview-live-socket"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function LivePreviewReviewDialog({
  open,
  onOpenChange,
  bookLabel,
  previewVersion,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookLabel: string
  previewVersion: string
}) {
  const { t, i18n } = useLingui()
  const { apiKey, hasApiKey } = useApiKey()
  const { tasks } = useBookTasks(bookLabel)
  const [session, setSession] = useState<{
    code: string
    hostToken: string
    joinUrls: string[]
  } | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(false)
  const [reprocessError, setReprocessError] = useState(false)
  const [processing, setProcessing] = useState<{
    taskIds: string[]
    commentIds: string[]
  } | null>(null)
  const lastSharedPreviewVersionRef = useRef(previewVersion)
  const { snapshot, connectionState, send } = usePreviewLiveSocket(
    open ? (session?.code ?? null) : null,
  )

  useEffect(() => {
    if (!open || session || createError) return
    let active = true
    setCreating(true)
    setCreateError(false)
    api
      .createPreviewLiveSession(bookLabel, previewVersion)
      .then((created) => {
        if (active) setSession(created)
      })
      .catch(() => {
        if (active) setCreateError(true)
      })
      .finally(() => {
        if (active) setCreating(false)
      })
    return () => {
      active = false
    }
  }, [bookLabel, createError, open, previewVersion, session])

  useEffect(() => {
    if (connectionState !== "connected" || !session) return
    send({ type: "host-join", hostToken: session.hostToken })
  }, [connectionState, send, session])

  useEffect(() => {
    if (!session) {
      lastSharedPreviewVersionRef.current = previewVersion
      return
    }
    if (
      connectionState !== "connected" ||
      lastSharedPreviewVersionRef.current === previewVersion
    ) {
      return
    }
    const sent = send({
      type: "host-action",
      hostToken: session.hostToken,
      action: "refresh-preview",
      previewVersion,
    })
    if (sent) lastSharedPreviewVersionRef.current = previewVersion
  }, [connectionState, previewVersion, send, session])

  const joinUrl = useMemo(() => {
    if (!session) return null
    const url = new URL(session.joinUrls[0])
    url.searchParams.set("lang", i18n.locale)
    return url.toString()
  }, [i18n.locale, session])

  useEffect(() => {
    if (!joinUrl) return
    QRCode.toDataURL(joinUrl, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: "M",
    }).then(setQrDataUrl)
  }, [joinUrl])

  useEffect(() => {
    if (!processing || processing.taskIds.length === 0 || !session) return
    const matching = processing.taskIds
      .map((taskId) => tasks.find((task) => task.taskId === taskId))
      .filter((task) => task != null)
    if (matching.some((task) => task.status === "failed")) {
      setProcessing(null)
      setReprocessError(true)
      return
    }
    if (
      matching.length === processing.taskIds.length &&
      matching.every((task) => task.status === "completed")
    ) {
      send({
        type: "host-action",
        hostToken: session.hostToken,
        action: "mark-processed",
        commentIds: processing.commentIds,
      })
      setProcessing(null)
      window.dispatchEvent(new Event("adt:repackage"))
    }
  }, [processing, send, session, tasks])

  const close = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setSession(null)
      setQrDataUrl(null)
      setProcessing(null)
    }
  }

  const unprocessed = snapshot?.comments.filter((comment) => !comment.processed) ?? []
  const processable = unprocessed.filter((comment) => comment.pageId)

  const reprocessComments = async () => {
    if (!session || !hasApiKey || processing || processable.length === 0) return
    setReprocessError(false)
    const commentsBySection = new Map<
      string,
      { pageId: string; sectionIndex: number | null; comments: typeof processable }
    >()
    for (const comment of processable) {
      const pageId = comment.pageId!
      const key = `${pageId}:${comment.sectionIndex ?? "page"}`
      const existing = commentsBySection.get(key)
      commentsBySection.set(key, {
        pageId,
        sectionIndex: comment.sectionIndex,
        comments: [...(existing?.comments ?? []), comment],
      })
    }
    try {
      const results = await Promise.all(
        Array.from(commentsBySection.values(), ({ pageId, sectionIndex, comments }) => {
          const instruction = [
            // eslint-disable-next-line lingui/no-unlocalized-strings -- LLM instruction, not interface text
            "Apply only the requested edits below. Follow literal removal and replacement requests exactly. Do not rewrite unrelated text or redesign the content.",
            ...comments.map((comment) => `- ${comment.participantName}: ${comment.text}`),
          ].join("\n")
          return sectionIndex == null
            ? api.reRenderPage(bookLabel, pageId, apiKey, undefined, instruction)
            : api.aiEditSection(bookLabel, pageId, sectionIndex, instruction, apiKey)
        }),
      )
      const taskIds = results.flatMap((result) =>
        result.taskId ? [result.taskId] : [],
      )
      const commentIds = processable.map((comment) => comment.id)
      if (taskIds.length === 0) {
        send({
          type: "host-action",
          hostToken: session.hostToken,
          action: "mark-processed",
          commentIds,
        })
        window.dispatchEvent(new Event("adt:repackage"))
      } else {
        setProcessing({ taskIds, commentIds })
      }
    } catch {
      setReprocessError(true)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,1000px)] max-w-none flex-col overflow-hidden p-0">
        <DialogHeader className="border-b bg-slate-800 px-6 py-4 text-left text-white">
          <DialogTitle className="flex items-center gap-2 text-xl text-white">
            <MessageSquare className="h-5 w-5" /> {t`Live preview review`}
          </DialogTitle>
          <DialogDescription className="text-slate-200">
            {t`Participants can explore the preview and comment on individual pages.`}
          </DialogDescription>
        </DialogHeader>

        {!session ? (
          <div className="flex min-h-80 flex-col items-center justify-center gap-4 p-8 text-center">
            {createError ? (
              <>
                <p className="font-bold text-red-700">{t`The review room could not be created.`}</p>
                <Button onClick={() => setCreateError(false)}>{t`Try again`}</Button>
              </>
            ) : (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-slate-700" />
                <p>{t`Preparing the review room…`}</p>
              </>
            )}
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto bg-slate-50 p-5 md:grid-cols-[280px_1fr]">
            <aside className="space-y-4">
              <section className="rounded-2xl border bg-white p-4 text-center shadow-sm">
                {qrDataUrl && (
                  <img src={qrDataUrl} alt={t`QR code for live preview review`} className="mx-auto h-56 w-56" />
                )}
                <p className="mt-2 text-sm text-slate-500">{t`Room code`}</p>
                <p className="text-3xl font-black tracking-[0.16em]">{session.code}</p>
                <Button
                  variant="outline"
                  className="mt-3 w-full gap-2"
                  onClick={async () => {
                    if (!joinUrl) return
                    await navigator.clipboard.writeText(joinUrl)
                    setCopied(true)
                    window.setTimeout(() => setCopied(false), 2_000)
                  }}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? t`Link copied` : t`Copy review link`}
                </Button>
              </section>

              <section className="rounded-2xl border bg-white p-4 shadow-sm">
                <h3 className="flex items-center gap-2 font-bold"><Users className="h-4 w-4" /> {t`Participants`}</h3>
                <div className="mt-3 space-y-2">
                  {snapshot?.participants.map((participant) => (
                    <div key={participant.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate font-medium">{participant.name}</span>
                      <button
                        type="button"
                        onClick={() => send({
                          type: "host-action",
                          hostToken: session.hostToken,
                          action: "kick",
                          participantId: participant.id,
                        })}
                        aria-label={t`Remove ${participant.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-red-100 hover:text-red-700"
                      >
                        <UserMinus className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {snapshot?.participants.length === 0 && (
                    <p className="text-sm text-slate-500">{t`Waiting for participants…`}</p>
                  )}
                </div>
              </section>
            </aside>

            <section className="flex min-h-96 flex-col rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black">{t`Comments`}</h3>
                  <p className="text-sm text-slate-500">{t`${unprocessed.length} waiting to be processed`}</p>
                </div>
                <Button
                  onClick={reprocessComments}
                  disabled={!hasApiKey || processing != null || processable.length === 0}
                  className="gap-2 bg-blue-700 text-white hover:bg-blue-800"
                >
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {processing ? t`Reprocessing…` : t`Reprocess comments`}
                </Button>
              </div>
              {reprocessError && <p className="mt-3 text-sm font-bold text-red-700">{t`Some comments could not be processed.`}</p>}
              {!hasApiKey && <p className="mt-3 text-sm text-amber-700">{t`Add an API key to reprocess comments.`}</p>}
              <div className="mt-4 flex-1 space-y-3 overflow-y-auto">
                {snapshot?.comments.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 p-10 text-center text-slate-500">
                    {t`Comments will appear here as participants send them.`}
                  </div>
                ) : (
                  snapshot?.comments.map((comment) => (
                    <article key={comment.id} className={`relative rounded-2xl border p-4 pr-12 ${comment.processed ? "bg-emerald-50/60" : "bg-white"}`}>
                      <button
                        type="button"
                        onClick={() => send({
                          type: "host-action",
                          hostToken: session.hostToken,
                          action: "delete-comments",
                          commentIds: [comment.id],
                        })}
                        aria-label={t`Delete comment`}
                        className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-red-100 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-bold">{comment.participantName}</span>
                        <span className="text-slate-500">{comment.pageId ?? t`Unknown page`}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-slate-800">{comment.text}</p>
                      {comment.processed && <p className="mt-2 flex items-center gap-1 text-xs font-bold text-emerald-700"><Check className="h-3.5 w-3.5" /> {t`Processed`}</p>}
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
