import { useEffect, useRef, useState, type FormEvent } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useLingui } from "@lingui/react/macro"
import { Check, Loader2, MessageSquarePlus, Send, Trash2, WifiOff, X } from "lucide-react"
import { usePreviewLiveSocket } from "@/hooks/use-preview-live-socket"

export const Route = createFileRoute("/review/$code")({
  component: PreviewReviewPage,
})

function participantIdFor(code: string): string {
  const key = `adt-preview-review-id-${code}`
  const existing = sessionStorage.getItem(key)
  if (existing) return existing
  const bytes = new Uint8Array(12)
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  const id = `reviewer-${Date.now().toString(36)}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`
  sessionStorage.setItem(key, id)
  return id
}

function PreviewReviewPage() {
  const { t } = useLingui()
  const { code: rawCode } = Route.useParams()
  const code = rawCode.toUpperCase()
  const nameKey = `adt-preview-review-name-${code}`
  const [name, setName] = useState(() => sessionStorage.getItem(nameKey) ?? "")
  const [joined, setJoined] = useState(() => !!sessionStorage.getItem(nameKey))
  const [participantId] = useState(() => participantIdFor(code))
  const [commentOpen, setCommentOpen] = useState(false)
  const [comment, setComment] = useState("")
  const [commentSent, setCommentSent] = useState(false)
  const [page, setPage] = useState<{
    pageId: string | null
    href: string | null
    sectionIndex: number | null
  }>({ pageId: null, href: null, sectionIndex: null })
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const lastRefreshTokenRef = useRef<number | null>(null)
  const { snapshot, connectionState, error, send } = usePreviewLiveSocket(code)

  useEffect(() => {
    if (connectionState !== "connected" || !joined || !name.trim()) return
    send({ type: "join", participantId, name: name.trim() })
  }, [connectionState, joined, name, participantId, send])

  useEffect(() => {
    if (!snapshot) return
    if (lastRefreshTokenRef.current == null) {
      lastRefreshTokenRef.current = snapshot.refreshToken
      return
    }
    if (lastRefreshTokenRef.current === snapshot.refreshToken) return
    lastRefreshTokenRef.current = snapshot.refreshToken

    const frame = iframeRef.current
    if (!frame) return
    try {
      const currentHref = frame.contentWindow?.location.href
      const currentUrl = currentHref && currentHref !== "about:blank"
        ? new URL(currentHref)
        : null
      const currentPagePath = currentUrl?.pathname.match(/\/adt\/v-[^/]+\/(.*)$/)?.[1] ?? ""
      const refreshedUrl = new URL(currentPagePath, new URL(snapshot.previewPath, window.location.origin))
      refreshedUrl.searchParams.set("review-refresh", String(snapshot.refreshToken))
      frame.src = refreshedUrl.toString()
    } catch {
      frame.src = snapshot.previewPath
    }
  }, [snapshot])

  const join = (event: FormEvent) => {
    event.preventDefault()
    const cleanName = name.replace(/\s+/g, " ").trim()
    if (!cleanName || connectionState !== "connected") return
    sessionStorage.setItem(nameKey, cleanName)
    setName(cleanName)
    setJoined(true)
    send({ type: "join", participantId, name: cleanName })
  }

  const syncPage = () => {
    try {
      const frame = iframeRef.current
      const sectionId = frame?.contentDocument
        ?.querySelector('meta[name="title-id"]')
        ?.getAttribute("content")
      const pageId = sectionId?.replace(/_sec\d+$/, "") ?? null
      const sectionMatch = sectionId?.match(/_sec(\d+)$/)
      const sectionIndex = sectionMatch ? Number(sectionMatch[1]) - 1 : null
      const href = frame?.contentWindow?.location.pathname.split("/").pop() ?? null
      setPage({
        pageId,
        href,
        sectionIndex:
          sectionIndex != null && Number.isInteger(sectionIndex) && sectionIndex >= 0
            ? sectionIndex
            : null,
      })
    } catch {
      setPage({ pageId: null, href: null, sectionIndex: null })
    }
  }

  const submitComment = (event: FormEvent) => {
    event.preventDefault()
    const text = comment.trim()
    if (!text) return
    if (
      send({
        type: "comment",
        text,
        pageId: page.pageId,
        pageHref: page.href,
        sectionIndex: page.sectionIndex,
      })
    ) {
      setComment("")
      setCommentSent(true)
      window.setTimeout(() => {
        setCommentSent(false)
        setCommentOpen(false)
      }, 1_200)
    }
  }

  const ownComments = (snapshot?.comments ?? []).filter(
    (item) => item.participantId === participantId,
  )

  if (error === "not-found" || error === "removed" || error === "host-ended") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-5 text-center">
        <section className="max-w-md rounded-3xl bg-white p-8 shadow-lg">
          <WifiOff className="mx-auto h-14 w-14 text-slate-500" />
          <h1 className="mt-4 text-2xl font-black text-slate-950">
            {error === "removed"
              ? t`You left the review room`
              : error === "host-ended"
                ? t`The teacher ended the review`
                : t`Review room not found`}
          </h1>
          <p className="mt-2 text-slate-600">{t`You can close this page now.`}</p>
        </section>
      </main>
    )
  }

  if (!snapshot) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <Loader2 className="h-12 w-12 animate-spin text-blue-700 motion-reduce:animate-none" />
      </main>
    )
  }

  if (!joined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-5">
        <section className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-xl">
          <MessageSquarePlus className="mx-auto h-14 w-14 text-blue-700" />
          <h1 className="mt-4 text-center text-3xl font-black text-slate-950">
            {t`Review the book together`}
          </h1>
          <p className="mt-2 text-center text-slate-600">
            {t`Explore the preview and leave helpful comments for your teacher.`}
          </p>
          <form onSubmit={join} className="mt-7">
            <label htmlFor="reviewer-name" className="font-bold text-slate-900">
              {t`Your name`}
            </label>
            <input
              id="reviewer-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={30}
              autoComplete="nickname"
              className="mt-2 min-h-14 w-full rounded-2xl border-2 border-slate-300 px-4 text-lg outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            />
            <button
              type="submit"
              disabled={!name.trim() || connectionState !== "connected"}
              className="mt-4 min-h-14 w-full rounded-2xl bg-blue-700 text-lg font-black text-white disabled:bg-slate-300"
            >
              {t`Open preview`}
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="relative h-[100dvh] overflow-hidden bg-white">
      <iframe
        ref={iframeRef}
        src={snapshot.previewPath}
        onLoad={syncPage}
        title={t`Book preview`}
        className="block h-full w-full border-0"
      />

      {commentOpen ? (
        <form
          onSubmit={submitComment}
          className="fixed inset-x-3 bottom-3 z-50 max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-3xl border bg-white p-4 shadow-2xl sm:left-auto sm:w-[420px]"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-black text-slate-950">{t`Leave a comment`}</h2>
              {page.pageId && <p className="text-xs text-slate-500">{page.pageId}</p>}
            </div>
            <button
              type="button"
              onClick={() => setCommentOpen(false)}
              aria-label={t`Close comment box`}
              className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={1000}
            rows={4}
            placeholder={t`What should be improved on this page?`}
            className="mt-3 w-full resize-none rounded-2xl border-2 border-slate-300 p-3 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
          />
          {ownComments.length > 0 && (
            <div className="mt-3 max-h-32 space-y-2 overflow-y-auto border-t pt-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {t`Your comments`}
              </p>
              {ownComments.map((item) => (
                <div key={item.id} className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2">
                  <p className="line-clamp-2 min-w-0 flex-1 text-sm text-slate-700">{item.text}</p>
                  <button
                    type="button"
                    onClick={() => send({ type: "delete-comment", commentId: item.id })}
                    aria-label={t`Delete comment`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-red-100 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="submit"
            disabled={!comment.trim() || commentSent}
            className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 font-bold text-white disabled:bg-slate-300"
          >
            {commentSent ? <Check className="h-5 w-5" /> : <Send className="h-5 w-5" />}
            {commentSent ? t`Comment sent` : t`Send comment`}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setCommentOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex min-h-14 items-center gap-2 rounded-full bg-blue-700 px-5 font-black text-white shadow-xl"
        >
          <MessageSquarePlus className="h-5 w-5" />
          {t`Comment`}
        </button>
      )}
    </main>
  )
}
