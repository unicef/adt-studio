import { Trans } from "@lingui/react/macro"
import { UsersRound } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DockItem } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { Status } from "./parts"
import { StepArt } from "./StepArt"
import { useStepFacts } from "./stepFacts"
import { SKIN, toneTextClassName } from "./style"

export interface StepDetailProps {
  item: DockItem
  here: boolean
  inBook: boolean
  notice: string | undefined
}

const ART_SLUGS = ["extract", "sectioning", "storyboard", "captions", "toc", "easy-read", "sign-language", "quizzes", "glossary", "translate", "speech"]

export type ArtShape = "card"

export function artSrc(slug: string, _shape: ArtShape, dark = false): string | undefined {
  if (!ART_SLUGS.includes(slug)) return undefined
  return `/lab/step-art/card/${slug}-${dark ? "dark" : "light"}.jpg`
}

export const ALL_ART: string[] = ART_SLUGS.flatMap((slug) => [artSrc(slug, "card") ?? "", artSrc(slug, "card", true) ?? ""])

export function ArtImage({ slug, shape, className }: { slug: string; shape: ArtShape; className?: string }) {
  const light = artSrc(slug, shape)
  const dark = artSrc(slug, shape, true)
  if (!light || !dark) return null
  return (
    <>
      <img src={light} alt="" decoding="async" className={cn("absolute inset-0 h-full w-full object-cover dark:hidden", className)} />
      <img src={dark} alt="" decoding="async" className={cn("absolute inset-0 hidden h-full w-full object-cover dark:block", className)} />
    </>
  )
}

function StatusLine({ item, here, inBook, notice, idle }: Pick<StepDetailProps, "item" | "here" | "inBook" | "notice"> & { idle: React.ReactNode }) {
  if (notice) return <span className="text-[11.5px] font-medium text-amber-700 dark:text-amber-300">{notice}</span>
  if (here)
    return (
      <span className={cn("text-[11.5px] font-medium", toneTextClassName)} style={{ ["--tone" as string]: item.hex }}>
        <Trans>You're here</Trans>
      </span>
    )
  if (inBook) return <Status item={item} />
  return idle
}

function Art({ item, className, shape }: { item: DockItem; className?: string; shape: ArtShape }) {
  if (artSrc(item.slug, shape)) {
    return (
      <div className={cn("relative overflow-hidden rounded-[14px] bg-zinc-100 dark:bg-zinc-800", className)}>
        <ArtImage slug={item.slug} shape={shape} />
      </div>
    )
  }
  return (
    <div
      className={cn("relative overflow-hidden rounded-[14px] p-2", className)}
      style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${item.hex} 14%, transparent), color-mix(in srgb, ${item.hex} 4%, transparent))` }}
    >
      <StepArt slug={item.slug} hex={item.hex} />
      <span
        className="absolute top-2 left-2 grid size-7 place-items-center rounded-[9px] bg-white shadow-[0_2px_6px_-2px_rgba(15,23,42,0.25)] dark:bg-zinc-900"
      >
        <item.icon className="size-3.5" strokeWidth={2} style={{ color: item.hex }} />
      </span>
    </div>
  )
}

const neighbourClassName = "font-semibold text-zinc-700 dark:text-white/80"

function FlowLine({ before, after }: { before: string; after: string | null }) {
  return (
    <p className={cn("text-[11.5px] leading-snug", SKIN.muted)}>
      {after ? (
        <Trans>
          Comes after <span className={neighbourClassName}>{before}</span>, before <span className={neighbourClassName}>{after}</span>.
        </Trans>
      ) : (
        <Trans>
          Comes after <span className={neighbourClassName}>{before}</span>.
        </Trans>
      )}
    </p>
  )
}

export function StepDetail({ item, here, inBook, notice }: StepDetailProps) {
  const facts = useStepFacts()(item.slug)
  const name = facts.label

  return (
    <div className="grid h-full grid-cols-[208px_minmax(0,1fr)] items-center gap-4 p-1">
      <Art item={item} shape="card" className="aspect-[4/3] w-full" />
      <div className="flex min-w-0 flex-col justify-center py-1">
        <div className="flex items-center justify-between gap-3">
          <span className={cn("truncate text-[16px] leading-6 font-semibold tracking-[-0.015em]", SKIN.strong)}>{name}</span>
          <span className="shrink-0">
            <StatusLine item={item} here={here} inBook={inBook} notice={undefined} idle={null} />
          </span>
        </div>
        {facts.description && <p className={cn("mt-1.5 text-[12.5px] leading-snug", SKIN.strong)}>{facts.description}</p>}
        {facts.helps && (
          <p className={cn("mt-2 flex items-start gap-1.5 text-[11.5px] leading-snug", SKIN.muted)}>
            <UsersRound aria-hidden className="mt-px size-3.5 shrink-0 opacity-70" strokeWidth={2} />
            <span>
              <span className="font-semibold">
                <Trans>Who it helps:</Trans>
              </span>{" "}
              {facts.helps}
            </span>
          </p>
        )}
        <div className="mt-2.5">
          <FlowLine before={facts.before} after={facts.after} />
        </div>
        {notice && <p className="mt-2 text-[11.5px] leading-snug font-medium text-amber-700 dark:text-amber-300">{notice}</p>}
      </div>
    </div>
  )
}
