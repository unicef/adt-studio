import { useEffect, useState, type FormEvent } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useLingui } from "@lingui/react/macro"
import {
  Check,
  CircleCheck,
  Loader2,
  Sparkles,
  Trophy,
  Users,
  WifiOff,
  X,
} from "lucide-react"
import { useQuizLiveSocket } from "@/hooks/use-quiz-live-socket"

export const Route = createFileRoute("/play/$code")({
  component: QuizPlayerPage,
})

const OPTION_STYLES = [
  "border-blue-300 bg-blue-50 text-blue-950 hover:bg-blue-100",
  "border-violet-300 bg-violet-50 text-violet-950 hover:bg-violet-100",
  "border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100",
] as const

function getParticipantId(code: string): string {
  const key = `adt-live-quiz-id-${code}`
  const existing = sessionStorage.getItem(key)
  if (existing) return existing
  const randomBytes = new Uint8Array(12)
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(randomBytes)
  } else {
    for (let index = 0; index < randomBytes.length; index += 1) {
      randomBytes[index] = Math.floor(Math.random() * 256)
    }
  }
  const randomPart = Array.from(randomBytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
  const id = `player-${Date.now().toString(36)}-${randomPart}`
  sessionStorage.setItem(key, id)
  return id
}

function QuizPlayerPage() {
  const { t } = useLingui()
  const { code: rawCode } = Route.useParams()
  const code = rawCode.toUpperCase()
  const nameKey = `adt-live-quiz-name-${code}`
  const [name, setName] = useState(() => sessionStorage.getItem(nameKey) ?? "")
  const [joined, setJoined] = useState(() => !!sessionStorage.getItem(nameKey))
  const [participantId] = useState(() => getParticipantId(code))
  const [pendingAnswer, setPendingAnswer] = useState<number | null>(null)
  const { snapshot, connectionState, error, send } = useQuizLiveSocket(code)

  useEffect(() => {
    if (connectionState !== "connected" || !joined || !name.trim()) return
    send({ type: "join", participantId, name: name.trim() })
  }, [connectionState, joined, name, participantId, send])

  useEffect(() => {
    setPendingAnswer(null)
  }, [snapshot?.questionIndex])

  const join = (event: FormEvent) => {
    event.preventDefault()
    const cleanName = name.replace(/\s+/g, " ").trim()
    if (!cleanName || connectionState !== "connected") return
    setName(cleanName)
    setJoined(true)
    sessionStorage.setItem(nameKey, cleanName)
    send({ type: "join", participantId, name: cleanName })
  }

  const answer = (answerIndex: number) => {
    if (snapshot?.status !== "question" || snapshot.myAnswerIndex != null) return
    setPendingAnswer(answerIndex)
    send({ type: "answer", answerIndex })
  }

  if (error === "not-found") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-sky-50 p-5 text-center">
        <section className="w-full max-w-md rounded-[2rem] border-2 border-sky-200 bg-white p-8 shadow-lg">
          <WifiOff className="mx-auto h-14 w-14 text-slate-500" />
          <h1 className="mt-5 text-2xl font-black text-slate-950">{t`Room not found`}</h1>
          <p className="mt-2 text-lg leading-relaxed text-slate-600">
            {t`Check the room code with your teacher and try the link again.`}
          </p>
        </section>
      </main>
    )
  }

  if (error === "removed" || error === "host-ended") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-sky-50 p-5 text-center">
        <section className="w-full max-w-md rounded-[2rem] border-2 border-sky-200 bg-white p-8 shadow-lg">
          <WifiOff className="mx-auto h-14 w-14 text-slate-500" />
          <h1 className="mt-5 text-2xl font-black text-slate-950">
            {error === "removed" ? t`You left the room` : t`The teacher ended the session`}
          </h1>
          <p className="mt-2 text-lg leading-relaxed text-slate-600">
            {t`You can close this page now.`}
          </p>
        </section>
      </main>
    )
  }

  if (!snapshot) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-sky-50 p-5 text-center">
        <div role="status">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-blue-700 motion-reduce:animate-none" />
          <p className="mt-4 text-lg font-bold text-slate-700">
            {connectionState === "disconnected"
              ? t`Trying to reconnect…`
              : t`Joining the room…`}
          </p>
        </div>
      </main>
    )
  }

  if (!joined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-sky-100 to-white p-5">
        <section className="w-full max-w-lg rounded-[2rem] border-2 border-sky-200 bg-white p-7 shadow-xl sm:p-10">
          <div className="text-center">
            <Sparkles className="mx-auto h-14 w-14 text-orange-500" />
            <p className="mt-4 text-base font-bold uppercase tracking-wide text-blue-700">
              {t`Room ${snapshot.code}`}
            </p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">{t`Let's play together!`}</h1>
            <p className="mt-3 text-lg leading-relaxed text-slate-600">
              {t`Type the name you want your group to see.`}
            </p>
          </div>
          <form onSubmit={join} className="mt-8">
            <label htmlFor="player-name" className="text-lg font-bold text-slate-900">
              {t`Your name`}
            </label>
            <input
              id="player-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={30}
              autoComplete="nickname"
              autoFocus
              className="mt-3 min-h-16 w-full rounded-2xl border-2 border-slate-300 px-5 text-xl font-semibold outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            />
            <button
              type="submit"
              disabled={!name.trim() || connectionState !== "connected"}
              className="mt-5 min-h-16 w-full rounded-2xl bg-blue-700 px-6 text-xl font-black text-white shadow-md transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {t`Join the game`}
            </button>
          </form>
        </section>
      </main>
    )
  }

  const selectedAnswer = snapshot.myAnswerIndex ?? pendingAnswer
  const participant = snapshot.participants.find((item) => item.id === participantId)

  return (
    <main className="min-h-screen bg-sky-50 p-4 sm:p-7">
      <div className="mx-auto max-w-3xl">
        <header className="mb-5 hidden flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-5 py-3 shadow-sm sm:flex">
          <div>
            <p className="text-sm font-bold text-blue-700">{t`Live quiz`}</p>
            <p className="font-black text-slate-950">{name}</p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 font-bold text-slate-700">
            <Users className="h-5 w-5" />
            {snapshot.participantCount}
          </div>
        </header>

        {connectionState !== "connected" && (
          <div className="mb-5 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-center font-bold text-amber-950" role="status">
            {t`Connection paused. We are trying again…`}
          </div>
        )}

        {snapshot.status === "lobby" ? (
          <section className="rounded-[2rem] border-2 border-blue-200 bg-white p-8 text-center shadow-lg sm:p-12">
            <CircleCheck className="mx-auto h-16 w-16 text-emerald-600" />
            <h1 className="mt-5 text-3xl font-black text-slate-950">{t`You are in!`}</h1>
            <p className="mt-3 text-xl leading-relaxed text-slate-600">
              {t`Wait here. Your teacher will start the first question.`}
            </p>
            <div className="mx-auto mt-8 h-3 max-w-xs overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-blue-600 motion-reduce:animate-none" />
            </div>
          </section>
        ) : snapshot.status === "finished" ? (
          <section className="rounded-[2rem] border-2 border-amber-200 bg-white p-8 text-center shadow-lg sm:p-12">
            <Trophy className="mx-auto h-20 w-20 text-amber-500" />
            <h1 className="mt-5 text-4xl font-black text-slate-950">{t`Great playing!`}</h1>
            <p className="mt-3 text-xl text-slate-600">{t`You finished the quiz together.`}</p>
            <div className="mx-auto mt-7 max-w-sm rounded-3xl bg-orange-50 p-6">
              <p className="text-base font-bold text-orange-800">{t`Your points`}</p>
              <p className="mt-1 text-5xl font-black text-orange-700">{participant?.score ?? 0}</p>
            </div>
          </section>
        ) : (
          <section className="rounded-[2rem] border-2 border-sky-200 bg-white p-5 shadow-lg sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="rounded-full bg-blue-100 px-4 py-2 font-bold text-blue-900">
                {t`Question ${snapshot.questionIndex + 1} of ${snapshot.questionCount}`}
              </span>
              <span className="font-black text-orange-700">{t`${participant?.score ?? 0} points`}</span>
            </div>
            <h1 className="mt-6 text-2xl font-black leading-snug text-slate-950 sm:text-3xl">
              {snapshot.question?.question}
            </h1>
            <div className="mt-7 grid gap-4">
              {snapshot.question?.options.map((option, index) => {
                const isSelected = selectedAnswer === index
                const isCorrect = snapshot.reveal?.answerIndex === index
                const isIncorrectSelection = !!snapshot.reveal && isSelected && !isCorrect
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => answer(index)}
                    disabled={snapshot.status !== "question" || selectedAnswer != null}
                    aria-pressed={isSelected}
                    className={`flex min-h-20 w-full items-center gap-4 rounded-2xl border-2 p-4 text-left text-lg font-black shadow-sm outline-none transition focus:ring-4 focus:ring-blue-300 disabled:cursor-default sm:text-xl ${
                      isCorrect
                        ? "border-emerald-600 bg-emerald-100 text-emerald-950"
                        : isIncorrectSelection
                          ? "border-slate-400 bg-slate-100 text-slate-700"
                          : isSelected
                            ? "border-blue-700 bg-blue-100 ring-4 ring-blue-200"
                            : OPTION_STYLES[index]
                    }`}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-xl text-white">
                      {String.fromCharCode(65 + index)}
                    </span>
                    <span className="flex-1">{option}</span>
                    {isCorrect ? (
                      <Check className="h-7 w-7 shrink-0" />
                    ) : isIncorrectSelection ? (
                      <X className="h-7 w-7 shrink-0" />
                    ) : isSelected ? (
                      <CircleCheck className="h-7 w-7 shrink-0" />
                    ) : null}
                  </button>
                )
              })}
            </div>

            {snapshot.status === "question" && selectedAnswer != null && (
              <div className="mt-6 rounded-2xl bg-blue-50 p-5 text-center text-lg font-bold text-blue-950" aria-live="polite">
                {t`Answer saved. Take your time and wait for the group.`}
              </div>
            )}
            {snapshot.status === "reveal" && snapshot.reveal && (
              <div className="mt-6 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-5" aria-live="polite">
                <p className="text-xl font-black text-emerald-950">
                  {selectedAnswer === snapshot.reveal.answerIndex
                    ? t`Yes — well done!`
                    : t`Good try! Here is the answer.`}
                </p>
                <p className="mt-2 text-lg leading-relaxed text-emerald-950">
                  {snapshot.reveal.explanation}
                </p>
                <p className="mt-4 font-bold text-emerald-800">{t`Wait for the next question.`}</p>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  )
}
