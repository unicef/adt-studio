import { useEffect, useId, useState } from "react"
import { createPortal } from "react-dom"
import { Trans, useLingui } from "@lingui/react/macro"
import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import {
  AudioLines,
  Columns2,
  Component,
  Grid2x2,
  Heading,
  Image as ImageIcon,
  Link2,
  List,
  ListChecks,
  Minus,
  MousePointerClick,
  PanelTop,
  Puzzle,
  Quote,
  RectangleVertical,
  Rows3,
  Smile,
  Square,
  Text,
  Type,
  Video,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { SegmentedTabs, tabPanelProps } from "@/components/app/screens/pipeline/shared/SegmentedTabs"

interface ElementKind {
  key: string
  icon: LucideIcon
  label: MessageDescriptor
}

const SECTIONS: { key: string; label: MessageDescriptor; items: ElementKind[] }[] = [
  {
    key: "structure",
    label: msg`Structure`,
    items: [
      { key: "section", icon: PanelTop, label: msg`Section` },
      { key: "container", icon: RectangleVertical, label: msg`Container` },
      { key: "block", icon: Square, label: msg`Block` },
      { key: "separator", icon: Minus, label: msg`Separator` },
      { key: "columns", icon: Columns2, label: msg`Columns` },
      { key: "rows", icon: Rows3, label: msg`Rows` },
      { key: "grid", icon: Grid2x2, label: msg`Grid` },
    ],
  },
  {
    key: "content",
    label: msg`Content`,
    items: [
      { key: "heading", icon: Heading, label: msg`Heading` },
      { key: "text", icon: Type, label: msg`Text` },
      { key: "rich", icon: Text, label: msg`Rich text` },
      { key: "list", icon: List, label: msg`List` },
      { key: "quote", icon: Quote, label: msg`Quote` },
    ],
  },
  {
    key: "actions",
    label: msg`Actions`,
    items: [
      { key: "button", icon: MousePointerClick, label: msg`Button` },
      { key: "link", icon: Link2, label: msg`Link` },
    ],
  },
  {
    key: "media",
    label: msg`Media`,
    items: [
      { key: "image", icon: ImageIcon, label: msg`Image` },
      { key: "icon", icon: Smile, label: msg`Icon` },
      { key: "video", icon: Video, label: msg`Video` },
      { key: "audio", icon: AudioLines, label: msg`Audio` },
    ],
  },
  {
    key: "activities",
    label: msg`Activities`,
    items: [
      { key: "quiz", icon: ListChecks, label: msg`Quiz` },
      { key: "activity", icon: Puzzle, label: msg`Activity` },
    ],
  },
]

type AddTab = "elements" | "components"

export function AddElementsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useLingui()
  const idBase = useId()
  const [tab, setTab] = useState<AddTab>("elements")
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [shown, setShown] = useState(open)

  useEffect(() => {
    setHost(document.querySelector<HTMLElement>('[data-chrome="row"]'))
  }, [])

  useEffect(() => {
    if (open) {
      setShown(true)
      return
    }
    const timer = window.setTimeout(() => setShown(false), 260)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!host || !shown) return null

  return createPortal(
    <div className={cn("absolute top-0 bottom-0 left-64 z-30 w-[328px] overflow-hidden", !open && "pointer-events-none")}>
    <aside
      aria-label={t`Add to the page`}
      inert={!open}
      className={cn(
        "flex h-full w-[288px] flex-col border-r bg-card shadow-[14px_0_32px_-22px_rgba(15,23,42,0.4)] will-change-transform motion-reduce:animate-none",
        open
          ? "animate-in slide-in-from-left fill-mode-both duration-[320ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
          : "animate-out slide-out-to-left fill-mode-forwards duration-[240ms] ease-[cubic-bezier(0.4,0,1,1)]",
      )}
    >
      <div data-chrome="railhead" className="flex h-11 shrink-0 items-center border-b px-2.5">
        <SegmentedTabs
          idBase={idBase}
          label={t`Add`}
          value={tab}
          onChange={setTab}
          className="flex-1 h-8! text-[12.5px]!"
          tabs={[
            { value: "elements", label: <Trans>Elements</Trans> },
            { value: "components", label: <Trans>Components</Trans> },
          ]}
        />
      </div>
      {tab === "elements" ? (
        <div {...tabPanelProps(idBase, "elements")} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-1 pb-4 outline-none [scrollbar-width:thin]">
          {SECTIONS.map((section, index) => (
            <section
              key={section.key}
              className={cn(
                "flex flex-col gap-2.5 py-3.5 animate-in fade-in slide-in-from-left-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none",
                index > 0 && "border-t",
              )}
              style={{ animationDelay: `${90 + index * 35}ms` }}
            >
              <h3 className="text-[12.5px] font-semibold">{i18n._(section.label)}</h3>
              <div className="grid grid-cols-2 gap-1.5">
                {section.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    draggable
                    className={cn(
                      "flex h-9 cursor-grab items-center gap-2 rounded-[10px] bg-muted/70 px-2.5 text-left text-[12.5px] font-medium text-foreground/80 outline-none",
                      "transition-[background-color,color,scale] duration-150 ease-out hover:bg-muted hover:text-foreground active:scale-[0.97] active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                    )}
                  >
                    <item.icon aria-hidden className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                    <span className="truncate">{i18n._(item.label)}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div {...tabPanelProps(idBase, "components")} className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-8 text-center outline-none animate-in fade-in duration-200">
          <span className="mb-1 grid size-10 place-items-center rounded-[12px] bg-muted text-muted-foreground">
            <Component aria-hidden className="size-5" strokeWidth={1.75} />
          </span>
          <p className="text-[13px] font-semibold">
            <Trans>No components yet</Trans>
          </p>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            <Trans>Soon you'll be able to save a group of layers as a component and reuse it on any page.</Trans>
          </p>
        </div>
      )}
    </aside>
    </div>,
    host,
  )
}
