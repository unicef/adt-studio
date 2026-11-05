import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { GripVertical } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { getDisplayName } from "@/lib/languages"
import { ACCENT_SWITCH } from "./optionMeta"
import type { ExportOptions } from "./useExportOptions"

const ROW_STEP = 44

function useFlip(order: string) {
  const container = useRef<HTMLDivElement>(null)
  const rects = useRef(new Map<string, number>())
  const capture = () => {
    const node = container.current
    if (!node) return
    for (const element of node.querySelectorAll<HTMLElement>("[data-lang-row]")) {
      const visual = element.firstElementChild?.getBoundingClientRect().top
      if (visual !== undefined) rects.current.set(element.dataset.langRow ?? "", visual)
    }
  }
  useLayoutEffect(() => {
    const node = container.current
    if (!node) return
    // eslint-disable-next-line lingui/no-unlocalized-strings
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const next = new Map<string, number>()
    for (const element of node.querySelectorAll<HTMLElement>("[data-lang-row]")) {
      const key = element.dataset.langRow ?? ""
      const top = element.getBoundingClientRect().top
      next.set(key, top)
      const before = rects.current.get(key)
      if (reduce || before === undefined || Math.abs(before - top) < 1) continue
      element.style.transition = "none"
      element.style.transform = `translateY(${before - top}px)`
      void element.offsetHeight
      element.style.transition = "transform 170ms cubic-bezier(0.2, 0, 0, 1)"
      element.style.transform = ""
    }
    rects.current = next
  }, [order])
  return { container, capture }
}

interface Drag {
  lang: string
  from: number
  startY: number
  dy: number
}

export function LanguageList({ options, disabled }: { options: ExportOptions; disabled: boolean }) {
  const { t } = useLingui()
  const { included, excluded, opensIn, bookLanguage } = options.languages
  const { container, capture } = useFlip(`${included.join(",")}|${excluded.join(",")}`)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [returning, setReturning] = useState<string | null>(null)
  const hintId = useId()

  useEffect(() => {
    if (!returning) return
    const id = window.setTimeout(() => setReturning(null), 200)
    return () => window.clearTimeout(id)
  }, [returning])

  const target = drag ? Math.max(0, Math.min(included.length - 1, drag.from + Math.round(drag.dy / ROW_STEP))) : -1
  const shiftOf = (index: number) => {
    if (!drag || index === drag.from) return 0
    if (drag.from < target && index > drag.from && index <= target) return -ROW_STEP
    if (drag.from > target && index < drag.from && index >= target) return ROW_STEP
    return 0
  }

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>, lang: string, from: number) => {
    if (disabled) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ lang, from, startY: event.clientY, dy: 0 })
  }
  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    setDrag((current) => (current ? { ...current, dy: event.clientY - current.startY } : current))
  }
  const endDrag = () => {
    if (!drag) return
    if (target !== drag.from) {
      capture()
      options.moveLanguage(drag.lang, target)
    } else {
      setReturning(drag.lang)
    }
    setDrag(null)
  }

  const opensName = opensIn ? getDisplayName(opensIn) : ""
  const bookName = bookLanguage ? getDisplayName(bookLanguage) : ""

  return (
    <div className={cn("flex flex-col gap-2", ACCENT_SWITCH)}>
      <p id={hintId} className="text-[11.5px] leading-relaxed text-muted-foreground">
        {opensIn !== bookLanguage ? (
          <Trans>
            {bookName} is left out, so the book opens in <span className="font-medium text-foreground">{opensName}</span>.
            At least one language is needed.
          </Trans>
        ) : included.length === 1 ? (
          <Trans>
            The book opens in <span className="font-medium text-foreground">{opensName}</span>. At least one language is
            needed.
          </Trans>
        ) : (
          <Trans>
            The book opens in <span className="font-medium text-foreground">{opensName}</span>. Readers switch languages
            from a menu in this order.
          </Trans>
        )}
      </p>
      <div ref={container} className="relative flex flex-col gap-1" aria-describedby={hintId}>
        {included.map((lang, index) => {
          const dragging = drag?.lang === lang
          return (
            <div key={lang} data-lang-row={lang} className={cn("relative", dragging && "z-10")}>
              <div
                style={{ transform: `translateY(${dragging ? drag.dy : shiftOf(index)}px)` }}
                className={cn(
                  "flex h-10 items-center gap-2 rounded-lg border bg-card pl-1.5 pr-2 transition-[box-shadow,border-color] duration-200 ease-out",
                  dragging && "border-(--accent)/30 shadow-[0_8px_20px_-12px_rgba(0,0,0,0.35)]",
                  drag && !dragging && "transition-[transform,box-shadow,border-color] duration-150",
                  returning === lang && "transition-[transform,box-shadow,border-color] duration-150",
                )}
              >
                <button
                    type="button"
                    aria-label={t`Move ${getDisplayName(lang)}`}
                    disabled={disabled || included.length < 2}
                    onPointerDown={(event) => startDrag(event, lang, index)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={() => setDrag(null)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowUp") {
                        event.preventDefault()
                        options.moveLanguage(lang, index - 1)
                      }
                      if (event.key === "ArrowDown") {
                        event.preventDefault()
                        options.moveLanguage(lang, index + 1)
                      }
                    }}
                    className="grid h-8 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
                  >
                    <GripVertical className="size-4" />
                  </button>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{getDisplayName(lang)}</span>
                {lang === opensIn && (
                  <span className="shrink-0 rounded-full bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] px-2 py-0.5 text-[10.5px] font-medium text-(--accent-solid) dark:text-[color-mix(in_oklab,var(--accent)_60%,white)]">
                    <Trans>Opens in</Trans>
                  </span>
                )}
                <Switch
                  checked
                  aria-label={t`Include ${getDisplayName(lang)}`}
                  disabled={disabled || included.length <= 1}
                  onCheckedChange={() => options.includeLanguage(lang, false)}
                  className="ml-1"
                />
              </div>
            </div>
          )
        })}
        {excluded.map((lang) => (
          <div key={lang} data-lang-row={lang}>
            <div className="flex h-10 items-center gap-2 rounded-lg border border-dashed pl-1.5 pr-2 text-muted-foreground">
              <span className="w-6 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-[13px]">{getDisplayName(lang)}</span>
              <span className="shrink-0 text-[11px]">
                <Trans>Left out</Trans>
              </span>
              <Switch
                checked={false}
                aria-label={t`Include ${getDisplayName(lang)}`}
                disabled={disabled}
                onCheckedChange={() => options.includeLanguage(lang, true)}
                className="ml-1"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ResetLanguageOrder({ options }: { options: ExportOptions }) {
  const customized = options.languages.customized
  return (
    <button
      type="button"
      onClick={options.resetLanguages}
      disabled={!customized}
      aria-hidden={!customized}
      tabIndex={customized ? 0 : -1}
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[11.5px] font-medium text-(--accent-solid) dark:text-[color-mix(in_oklab,var(--accent)_60%,white)] transition-opacity duration-200 hover:bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]",
        !customized && "pointer-events-none opacity-0",
      )}
    >
      <Trans>Use the book's order</Trans>
    </button>
  )
}
