import { useLingui } from "@lingui/react/macro"
import { useNavigate } from "@tanstack/react-router"
import { ArrowRight, ArrowUpRight, FlaskConical } from "lucide-react"
import { cn } from "@/lib/utils"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { TEST_BOOKS } from "../testPlan/tests"
import { clearStageState, type StageStates } from "../stageStates"
import { VariantChips } from "./VariantChips"
import { TESTING_NOW, type TestingItem } from "./verifyLog"
import { useOpenTarget } from "./useOpenTarget"

export function TestingCard({ page, items, stageStates }: { page: string; items: TestingItem[]; stageStates: StageStates }) {
  const { t, i18n } = useLingui()
  const open = useOpenTarget(page, stageStates)
  if (items.length === 0) return null

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-violet-400/15 px-2.5 py-2 ring-1 ring-violet-300/40 animate-in fade-in duration-200 motion-reduce:animate-none">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.06em] text-violet-200 uppercase">
        <FlaskConical className="size-3.5" />
        {t`Testing now`}
      </span>
      {items.map((item) => (
        <div key={item.id} className="flex flex-col gap-1.5 border-t border-white/10 pt-2 first-of-type:border-t-0 first-of-type:pt-0">
          <span className="text-[12px] leading-snug text-white/80">{i18n._(item.text)}</span>
          {item.variants.map((variantKey) => (
            <VariantChips key={variantKey} variantKey={variantKey} />
          ))}
          <span className="flex flex-wrap gap-1">
            {item.links.map((link) => (
              <button
                key={i18n._(link.label)}
                type="button"
                onClick={() => open(link.target)}
                className="flex h-7 items-center gap-1 rounded-full bg-white/10 px-2.5 text-[11.5px] font-semibold text-white/85 transition-colors duration-150 hover:bg-white/20 hover:text-white"
              >
                {i18n._(link.label)}
                <ArrowUpRight className="size-3" />
              </button>
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}

export function TestingPointer({ page }: { page: string | null }) {
  const { t } = useLingui()
  const navigate = useNavigate()
  const stages = Object.keys(TESTING_NOW).filter((stage) => stage !== page && TESTING_NOW[stage].length > 0)
  if (stages.length === 0) return null
  const here = page ? (TESTING_NOW[page]?.length ?? 0) > 0 : false
  const go = (stage: string) => {
    clearStageState()
    const [, root, current] = window.location.pathname.split("/")
    void navigate({ to: "/pipeline/$label/$step", params: { label: root === "pipeline" && current ? decodeURIComponent(current) : TEST_BOOKS.done, step: stage } })
  }
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 rounded-xl px-2.5 py-2", here ? "bg-white/5" : "bg-violet-400/15 ring-1 ring-violet-300/40")}>
      <FlaskConical className={cn("size-3.5 shrink-0", here ? "text-white/45" : "text-violet-200")} />
      <span className={cn("mr-auto text-[12px] leading-snug", here ? "text-white/55" : "text-violet-100")}>
        {here ? t`The same tests are also in` : t`Testing now is in`}
      </span>
      {stages.map((stage) => (
        <button
          key={stage}
          type="button"
          onClick={() => go(stage)}
          className="flex h-7 items-center gap-1 rounded-full bg-white/10 px-2.5 text-[11.5px] font-semibold text-white/85 transition-colors duration-150 hover:bg-white/20 hover:text-white"
        >
          {t`Go to ${getStageLabelI18n(stage)}`}
          <ArrowRight className="size-3" />
        </button>
      ))}
    </div>
  )
}
