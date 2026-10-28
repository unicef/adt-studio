import type { AriaRole, ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { TONE_BORDER, TONE_ICON, type NoticeTone } from "./notice-tone"

export type NoticePresentation = "strip" | "inline"

interface NoticeFrame {
  box: string
  row: string
  lead: string
  icon: (tone: NoticeTone) => string
  badge: string | null
  title: string
  body: string
}

const FRAMES: Record<NoticePresentation, NoticeFrame> = {
  strip: {
    box: cn("rounded-xl border bg-card"),
    row: cn("flex min-h-11 flex-wrap items-center gap-x-2.5 gap-y-1.5 py-2 pr-2 pl-3"),
    lead: cn("gap-2.5"),
    icon: (tone) => cn("mt-px size-4 shrink-0", TONE_ICON[tone]),
    badge: null,
    title: cn("font-semibold text-foreground"),
    body: cn("text-muted-foreground"),
  },
  inline: {
    box: cn("w-full"),
    row: cn("flex flex-wrap items-center gap-x-2 gap-y-1.5"),
    lead: cn("gap-2"),
    icon: () => cn("size-3.5 text-white"),
    badge: cn("grid size-5 shrink-0 place-items-center rounded-full bg-white/20"),
    title: cn("font-medium text-white"),
    body: cn("text-white/80"),
  },
}

export function NoticeStrip({
  tone,
  presentation = "strip",
  hex,
  icon: Icon,
  title,
  body,
  role,
  children,
  footer,
}: {
  tone: NoticeTone
  presentation?: NoticePresentation
  hex?: string
  icon: LucideIcon
  title: ReactNode
  body: ReactNode
  role?: AriaRole
  children?: ReactNode
  footer?: ReactNode
}) {
  const frame = FRAMES[presentation]
  const strip = presentation === "strip"
  const icon = <Icon className={frame.icon(tone)} strokeWidth={2.3} />
  return (
    <section
      role={role}
      data-tone={tone}
      style={hex ? { ["--tint" as string]: hex } : undefined}
      className={cn(
        "relative shrink-0 overflow-hidden animate-in fade-in duration-300 motion-reduce:animate-none",
        strip && "slide-in-from-top-1",
        strip && TONE_BORDER[tone],
        frame.box,
      )}
    >
      <div className={frame.row}>
        <div className={cn("flex min-w-[200px] flex-1 items-start", frame.lead)}>
          {frame.badge ? <span className={frame.badge}>{icon}</span> : icon}
          <p className="min-w-0 flex-1 text-[13px] leading-snug">
            <span className={frame.title}>{title}</span>
            <span className={frame.body}> · {body}</span>
          </p>
        </div>
        {children}
      </div>
      {footer}
    </section>
  )
}
