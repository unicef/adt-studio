/* eslint-disable lingui/no-unlocalized-strings */
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Cover } from "./MockCover"

const BACK = "bg-[color-mix(in_oklab,var(--accent)_38%,var(--card))]"

function StickerFolder({ src }: { src: string | null }) {
  return (
    <div className="relative h-[214px] w-[250px]">
      <div className={cn("absolute left-[14px] top-[18px] h-9 w-[104px] rounded-t-2xl", BACK)} />
      <div className={cn("absolute inset-x-[14px] bottom-0 top-[38px] rounded-[22px] rounded-tl-none", BACK)} />
      <div className="absolute inset-x-[14px] bottom-0 top-[52px] overflow-hidden rounded-[22px] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent)_58%,var(--card)),color-mix(in_oklab,var(--accent)_72%,var(--card)))] shadow-[0_-8px_20px_-14px_rgba(0,0,0,0.35)]">
        <span className="absolute inset-x-0 top-0 h-px bg-white/40" />
        <Cover
          src={src}
          className="absolute left-1/2 top-[14px] h-[118px] w-[86px] -translate-x-1/2 rotate-[4deg] rounded-[6px] shadow-[0_8px_18px_-8px_rgba(0,0,0,0.45)] ring-[3px] ring-white"
        />
      </div>
    </div>
  )
}

export function ArchiveMock({ src, fileName }: { src: string | null; fileName: string }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <StickerFolder src={src} />
      <div className="flex max-w-[260px] items-center gap-2 rounded-full bg-card py-1.5 pl-1.5 pr-3 shadow-[0_8px_20px_-12px_rgba(0,0,0,0.35)] ring-1 ring-foreground/10">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-(--accent-solid) text-white">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
        <span className="truncate font-mono text-[11.5px] font-medium">{`${fileName}-project.zip`}</span>
      </div>
    </div>
  )
}
