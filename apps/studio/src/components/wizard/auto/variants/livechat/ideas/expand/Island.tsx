import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { ArrowDown, BookOpen, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CreateRun } from "../../../chat/useCreateRun"
import "./expand.css"

export type IslandInput = {
  /** The engine's state for the PDF ("idle" before there is one). */
  engine: "idle" | "running" | "done" | "failed"
  /** The step of the newest message, and its id (to scroll to it). */
  step: string | undefined
  messageId: string | undefined
  /** The question being asked, if any: its number and how many there are. */
  ask: { index: number; total: number } | null
  create: CreateRun | undefined
  onOpen: (label: string) => void
}

type State = { key: string; size: "pill" | "card"; content: ReactNode }

function Pulse({ tone = "brand" }: { tone?: "brand" | "red" }) {
  return <span className={cn("ix-pulse size-2 shrink-0 rounded-full", tone === "red" ? "bg-red-400" : "bg-[#8b84ff]")} />
}

function GoButton({ onClick, children, light }: { onClick: () => void; children: ReactNode; light?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-transform active:scale-[0.97]", light ? "bg-white text-neutral-900" : "bg-white/10 text-white hover:bg-white/20")}>
      {children}
    </button>
  )
}

/**
 * b7 · Dynamic Island: one dark status object at the top of the thread that never leaves. A small
 * pill while the assistant works, a bigger card when it needs the user (with a way to get there),
 * a pill again when the book is created, with Open in it.
 */
export function Island({ engine, step, messageId, ask, create, onOpen }: IslandInput) {
  const inner = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  const go = () => document.getElementById(`msg-${messageId}`)?.scrollIntoView({ block: "center", behavior: "smooth" })

  const state = ((): State | null => {
    if (create?.status === "done")
      return {
        key: "done",
        size: "pill",
        content: (
          <>
            <span className="grid size-5 place-items-center rounded-full bg-emerald-400 text-neutral-900">
              <Check className="size-3 stroke-[3]" />
            </span>
            <span className="max-w-[260px] truncate">
              <Trans>{create.name} is ready</Trans>
            </span>
            <GoButton light onClick={() => onOpen(create.label!)}>
              <BookOpen className="size-3.5" />
              <Trans>Open</Trans>
            </GoButton>
          </>
        ),
      }
    if (create?.status === "failed")
      return {
        key: "create-failed",
        size: "pill",
        content: (
          <>
            <Pulse tone="red" />
            <Trans>Couldn&apos;t create it</Trans>
            <GoButton onClick={go}>
              <Trans>See why</Trans>
            </GoButton>
          </>
        ),
      }
    if (create)
      return {
        key: "creating",
        size: "pill",
        content: (
          <>
            <Pulse />
            <span className="max-w-[260px] truncate">
              <Trans>Creating {create.name}</Trans>
            </span>
          </>
        ),
      }
    if (engine === "running")
      return {
        key: "reading",
        size: "pill",
        content: (
          <>
            <Pulse />
            <Trans>Reading your book</Trans>
          </>
        ),
      }
    if (engine === "failed")
      return {
        key: "failed",
        size: "pill",
        content: (
          <>
            <Pulse tone="red" />
            <Trans>Couldn&apos;t read it</Trans>
          </>
        ),
      }
    if (ask)
      return {
        key: `ask-${step}`,
        size: "card",
        content: (
          <div className="flex flex-col gap-2.5">
            <span className="text-[12px] font-medium text-white/60">
              <Trans>
                Question {ask.index} of {ask.total}
              </Trans>
            </span>
            <span className="flex items-center gap-6">
              <b className="text-[15px] font-semibold">
                <Trans>I need you for one thing</Trans>
              </b>
              <GoButton light onClick={go}>
                <ArrowDown className="size-3.5" />
                <Trans>Answer</Trans>
              </GoButton>
            </span>
          </div>
        ),
      }
    if (step === "ready" || step === "skip")
      return {
        key: "ready",
        size: "card",
        content: (
          <div className="flex flex-col gap-2.5">
            <span className="text-[12px] font-medium text-white/60">
              <Trans>All set</Trans>
            </span>
            <span className="flex items-center gap-6">
              <b className="text-[15px] font-semibold">
                <Trans>Name it and create it</Trans>
              </b>
              <GoButton light onClick={go}>
                <ArrowDown className="size-3.5" />
                <Trans>Go</Trans>
              </GoButton>
            </span>
          </div>
        ),
      }
    if (engine === "done")
      return {
        key: "found",
        size: "pill",
        content: (
          <>
            <span className="grid size-5 place-items-center rounded-full bg-emerald-400 text-neutral-900">
              <Check className="size-3 stroke-[3]" />
            </span>
            <Trans>Read it</Trans>
          </>
        ),
      }
    return null
  })()

  useLayoutEffect(() => {
    const el = inner.current
    if (!el) return
    const measure = () => setBox({ w: el.offsetWidth, h: el.offsetHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [!!state])

  if (!state) return null
  const card = state.size === "card"
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[72px] z-20 flex justify-center">
      <div
        className="ix-island ix-island-drop pointer-events-auto relative overflow-hidden bg-neutral-950 text-white shadow-[0_18px_40px_-16px_rgba(15,23,42,0.7)] ring-1 ring-white/10"
        style={{ width: box?.w, height: box?.h, borderRadius: card ? 26 : 22 }}
      >
        <div ref={inner} className={cn("absolute left-0 top-0 w-max", card ? "px-5 py-3.5" : "px-4 py-2.5")}>
          <div key={state.key} className="ix-island-content flex items-center gap-2.5 whitespace-nowrap text-[14px] font-medium">
            {state.content}
          </div>
        </div>
      </div>
    </div>
  )
}
