import { useEffect, useMemo, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import {
  ArrowRight,
  Check,
  Copy,
  Eye,
  Loader2,
  Play,
  Radio,
  Trophy,
  UserMinus,
  Users,
  X,
} from "lucide-react"
import QRCode from "qrcode"
import { api } from "@/api/client"
import { useQuizLiveSocket } from "@/hooks/use-quiz-live-socket"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function LiveQuizHostDialog({
  open,
  onOpenChange,
  bookLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookLabel: string
}) {
  const { t, i18n } = useLingui()
  const [session, setSession] = useState<{
    code: string
    hostToken: string
    joinUrls: string[]
  } | null>(null)
  const [createError, setCreateError] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const { snapshot, connectionState, error, send } = useQuizLiveSocket(
    open ? (session?.code ?? null) : null,
  )

  useEffect(() => {
    if (connectionState !== "connected" || !session) return
    send({ type: "host-join", hostToken: session.hostToken })
  }, [connectionState, send, session])

  useEffect(() => {
    if (!open || session) return
    let active = true
    setCreateError(false)
    api
      .createQuizLiveSession(bookLabel)
      .then((created) => {
        if (active) setSession(created)
      })
      .catch(() => {
        if (active) setCreateError(true)
      })
    return () => {
      active = false
    }
  }, [bookLabel, open, session])

  const joinUrl = useMemo(() => {
    if (!session) return null
    const url = new URL(
      session.joinUrls[0] ?? `/play/${session.code}`,
      window.location.origin,
    )
    url.searchParams.set("lang", i18n.locale)
    return url.toString()
  }, [i18n.locale, session])

  useEffect(() => {
    if (!joinUrl) return
    QRCode.toDataURL(joinUrl, {
      width: 256,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#111827", light: "#ffffff" },
    }).then(setQrDataUrl)
  }, [joinUrl])

  const hostAction = (
    action: "start" | "reveal" | "next" | "kick" | "end",
    participantId?: string,
  ) => {
    if (!session) return
    send({
      type: "host-action",
      hostToken: session.hostToken,
      action,
      participantId,
    })
  }

  const copyLink = async () => {
    if (!joinUrl) return
    await navigator.clipboard.writeText(joinUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2_000)
  }

  const closeAndReset = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setSession(null)
      setQrDataUrl(null)
    }
  }

  const answeredCount =
    snapshot?.participants.filter((participant) => participant.answered).length ?? 0
  const current = snapshot?.question
  const isLast = snapshot
    ? snapshot.questionIndex === snapshot.questionCount - 1
    : false

  return (
    <Dialog open={open} onOpenChange={closeAndReset}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,980px)] max-w-none flex-col overflow-hidden p-0">
        <DialogHeader className="border-b bg-orange-600 px-6 py-4 text-left text-white">
          <DialogTitle className="flex items-center gap-2 text-xl text-white">
            <Radio className="h-5 w-5" />
            {t`Live quiz`}
          </DialogTitle>
          <DialogDescription className="text-orange-50">
            {t`Everyone plays together. You decide when each question moves on.`}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-6">
          {!session && !createError ? (
            <div className="flex min-h-80 flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
              <p className="text-sm text-slate-600">{t`Preparing the live room…`}</p>
            </div>
          ) : createError ? (
            <div className="flex min-h-80 flex-col items-center justify-center gap-4 text-center">
              <p className="font-semibold text-slate-900">{t`The live room could not be created.`}</p>
              <Button onClick={() => { setCreateError(false); setSession(null) }}>
                {t`Try again`}
              </Button>
            </div>
          ) : !snapshot ? (
            <div className="flex min-h-80 flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
              <p className="text-sm text-slate-600">
                {connectionState === "disconnected"
                  ? t`Reconnecting to the live room…`
                  : t`Opening the live room…`}
              </p>
            </div>
          ) : snapshot.status === "lobby" ? (
            <div className="grid gap-6 md:grid-cols-[320px_1fr]">
              <section className="rounded-3xl border bg-white p-5 text-center shadow-sm">
                <p className="text-sm font-semibold text-slate-600">{t`Scan to join`}</p>
                {qrDataUrl && (
                  <img
                    src={qrDataUrl}
                    alt={t`QR code to join live quiz`}
                    className="mx-auto my-4 h-64 w-64 max-w-full"
                  />
                )}
                <p className="text-sm text-slate-500">{t`Room code`}</p>
                <p className="mt-1 text-4xl font-black tracking-[0.18em] text-slate-900">
                  {snapshot.code}
                </p>
                <Button variant="outline" className="mt-4 min-h-11 w-full gap-2" onClick={copyLink}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? t`Link copied` : t`Copy join link`}
                </Button>
              </section>

              <section className="flex min-h-96 flex-col rounded-3xl border bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-blue-100 p-3 text-blue-700">
                    <Users className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">{t`Players`}</h3>
                    <p className="text-sm text-slate-500">
                      {t`${snapshot.participantCount} joined`}
                    </p>
                  </div>
                </div>
                <div className="my-5 flex flex-1 flex-wrap content-start gap-3" aria-live="polite">
                  {snapshot.participants.length === 0 ? (
                    <p className="w-full rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
                      {t`Waiting for players to join…`}
                    </p>
                  ) : (
                    snapshot.participants.map((participant) => (
                      <span
                        key={participant.id}
                        className="inline-flex items-center gap-2 rounded-full border-2 border-blue-200 bg-blue-50 py-2 pl-4 pr-2 text-base font-bold text-blue-900"
                      >
                        {participant.name}
                        <button
                          type="button"
                          onClick={() => hostAction("kick", participant.id)}
                          aria-label={t`Remove ${participant.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-blue-700 hover:bg-red-100 hover:text-red-700"
                        >
                          <UserMinus className="h-4 w-4" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <Button
                  className="min-h-14 gap-2 bg-orange-600 text-lg text-white hover:bg-orange-700"
                  disabled={snapshot.participantCount === 0}
                  onClick={() => hostAction("start")}
                >
                  <Play className="h-5 w-5 fill-current" />
                  {t`Start the first question`}
                </Button>
              </section>
            </div>
          ) : snapshot.status === "finished" ? (
            <section className="mx-auto max-w-2xl rounded-3xl border bg-white p-8 text-center shadow-sm">
              <Trophy className="mx-auto h-16 w-16 text-amber-500" />
              <h3 className="mt-4 text-3xl font-black text-slate-900">{t`Great playing!`}</h3>
              <p className="mt-2 text-slate-600">{t`The live quiz is finished.`}</p>
              <div className="mt-6 space-y-3 text-left">
                {snapshot.participants.map((participant) => (
                  <div key={participant.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-5 py-3">
                    <span className="font-bold text-slate-900">{participant.name}</span>
                    <span className="font-black text-orange-700">{t`${participant.score} points`}</span>
                  </div>
                ))}
              </div>
              <Button className="mt-7 min-h-12 px-8" onClick={() => closeAndReset(false)}>
                {t`Close`}
              </Button>
            </section>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
              <section className="rounded-3xl border bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <span className="rounded-full bg-orange-100 px-4 py-2 text-sm font-bold text-orange-800">
                    {t`Question ${snapshot.questionIndex + 1} of ${snapshot.questionCount}`}
                  </span>
                  <span className="text-sm font-semibold text-slate-600">
                    {t`${answeredCount} of ${snapshot.participantCount} answered`}
                  </span>
                </div>
                <h3 className="text-2xl font-black leading-snug text-slate-950">{current?.question}</h3>
                <div className="mt-6 space-y-3">
                  {current?.options.map((option, index) => {
                    const isCorrect = snapshot.reveal?.answerIndex === index
                    return (
                      <div
                        key={index}
                        className={`flex min-h-16 items-center gap-4 rounded-2xl border-2 px-5 py-3 ${
                          isCorrect
                            ? "border-emerald-500 bg-emerald-50 text-emerald-950"
                            : "border-slate-200 bg-white text-slate-900"
                        }`}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 font-black text-white">
                          {String.fromCharCode(65 + index)}
                        </span>
                        <span className="flex-1 text-lg font-bold">{option}</span>
                        {snapshot.reveal && (
                          <span className="font-bold text-slate-600">
                            {t`${snapshot.reveal.answerCounts[index]} answers`}
                          </span>
                        )}
                        {isCorrect && <Check className="h-6 w-6 text-emerald-700" />}
                      </div>
                    )
                  })}
                </div>
                {snapshot.reveal && (
                  <div className="mt-5 rounded-2xl bg-emerald-50 p-5 text-emerald-950">
                    <p className="font-bold">{t`Why this answer is right`}</p>
                    <p className="mt-1 leading-relaxed">{snapshot.reveal.explanation}</p>
                  </div>
                )}
              </section>

              <aside className="flex flex-col rounded-3xl border bg-white p-5 shadow-sm">
                <h3 className="flex items-center gap-2 font-bold text-slate-900">
                  <Users className="h-5 w-5 text-blue-700" /> {t`Players`}
                </h3>
                <div className="mt-4 flex-1 space-y-2">
                  {snapshot.participants.map((participant) => (
                    <div key={participant.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full ${participant.answered ? "bg-emerald-600 text-white" : "border-2 border-slate-300"}`}
                      >
                        {participant.answered && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{participant.name}</span>
                      <span className="text-xs font-bold text-slate-500">{participant.score}</span>
                      <button
                        type="button"
                        onClick={() => hostAction("kick", participant.id)}
                        aria-label={t`Remove ${participant.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-red-100 hover:text-red-700"
                      >
                        <UserMinus className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                {snapshot.status === "question" ? (
                  <Button className="mt-5 min-h-14 gap-2 bg-emerald-600 text-base text-white hover:bg-emerald-700" onClick={() => hostAction("reveal")}>
                    <Eye className="h-5 w-5" /> {t`Show the answer`}
                  </Button>
                ) : (
                  <Button className="mt-5 min-h-14 gap-2 bg-orange-600 text-base text-white hover:bg-orange-700" onClick={() => hostAction("next")}>
                    {isLast ? <Trophy className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
                    {isLast ? t`Finish the quiz` : t`Next question`}
                  </Button>
                )}
                <Button variant="ghost" className="mt-2 gap-2 text-slate-500" onClick={() => hostAction("end")}>
                  <X className="h-4 w-4" /> {t`End session`}
                </Button>
              </aside>
            </div>
          )}
          {error && (
            <p className="mt-4 text-center text-sm font-medium text-red-700" role="alert">
              {t`The live connection had a problem. Reconnecting…`}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
