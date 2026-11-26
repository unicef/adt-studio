/* eslint-disable lingui/no-unlocalized-strings -- setting ids and values, never shown */
import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Lock } from "lucide-react"
import type { SetupRecommendation } from "@adt/types"
import { cn } from "@/lib/utils"
import { strategiesFor } from "../../../engine/answers"
import { RULE_WHY, SETTING_NAME, SETTING_VALUE } from "../../../engine/words"
import { LookChoices, type LookOption } from "../../shared/PreviewChoices"
import { lookOf } from "../../shared/screens/look"
import { layoutArt } from "../../shared/art/ConceptArt"
import { MethodTag, usesAI } from "../../shared/MethodTag"
import { LAYOUT_GUIDE } from "../../shared/optionGuide"
import { Citation } from "../../shared/Citation"
import type { Answers } from "../../shared/useAnswers"
import { plainTitle, SETTING_OPTIONS } from "../../shared/words"
import { RENDER_STRATEGIES } from "../../../../core/constants"
import { WizardSettings } from "../../shared/WizardSettings"
import { useWizardNames, WIZARD_SETTING, wizardValue } from "../../shared/wizardNames"
import { screenFacts } from "../screens"
import { PICTURE, SurePick } from "../SurePick"

type Props = { rec: SetupRecommendation; chat: Answers; file: File | null | undefined }

/**
 * The page layout itself: how each page comes out on screen. The layout is the pick (where the
 * words sit only explains the guess), each shown as an illustration of a printed page becoming the
 * screen, and tagged with how it's made: by the AI (slower, uses credits) or from a template.
 * When the engine asked (its readings disagree on where the words sit), the options start open.
 */
function LayoutPick({ rec, chat, file, asked }: Props & { asked: boolean }) {
  const { i18n } = useLingui()
  const names = useWizardNames()
  const derived = chat.derived!
  const [open, setOpen] = useState(asked)
  const value = String(derived.effective.renderStrategy?.value)
  const shown = new Set(SETTING_OPTIONS.renderStrategy.map((o) => String(o.value)))
  const allowed = strategiesFor(derived.effective.preset?.value).filter((s) => shown.has(s))
  const name = (v: string) => {
    if (names) {
      const w = wizardValue("renderStrategy", v)
      return typeof w === "string" ? w : i18n._(w)
    }
    const words = plainTitle("renderStrategy", v)
    return words ? i18n._(words) : v
  }
  // The engine's pick first; the order stays put while the user tries the others.
  const first = String(derived.fromAnswers.renderStrategy?.value ?? value)
  // The guess first, then the template layouts, then the AI ones.
  const rest = allowed.filter((v) => v !== first).sort((a, b) => Number(usesAI(a)) - Number(usesAI(b)))
  const options = [...(allowed.includes(first) ? [first] : []), ...rest].map(
    (v): LookOption => ({
      value: v,
      label: name(v),
      // The card says only its name and how it's made; what it means is in "What do these options mean?".
      line: "",
      more: (() => {
        const d = RENDER_STRATEGIES.find((r) => r.id === v)?.description
        return d ? i18n._(d) : undefined
      })(),
      guide: LAYOUT_GUIDE[v],
      why:
        v === first && RULE_WHY[derived.fromAnswers.renderStrategy?.rule ?? ""] ? (
          <>
            {i18n._(RULE_WHY[derived.fromAnswers.renderStrategy!.rule]!)}
            {(rec.settingEvidence.renderStrategy ?? []).length > 0 && (
              <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Trans>Where I read it:</Trans> <Citation file={file} pages={rec.settingEvidence.renderStrategy ?? []} />
              </span>
            )}
          </>
        ) : undefined,
      art: layoutArt(v) ?? undefined,
      tag: <MethodTag strategy={v} />,
      look: lookOf({ ...derived.effective, renderStrategy: { value: v, rule: "user" } }),
      guess: v === derived.fromAnswers.renderStrategy?.value,
      settings: { ...derived.effective, renderStrategy: { value: v, rule: "user" } },
      only: ["renderStrategy"],
    }),
  )
  const labelId = "gd-layout"
  const means = SETTING_VALUE.renderStrategy[value]?.means
  return (
    <SurePick
      picture={<span className={`qd18-pv grid shrink-0 place-items-center rounded-[12px] p-3 ${PICTURE}`}>{layoutArt(value)}</span>}
      label={<Trans>How the pages look on screen</Trans>}
      title={name(value)}
      hint={means ? i18n._(means) : undefined}
      result={names ? <WizardSettings settings={derived.effective} only={["preset", "renderStrategy", "pageGrouping"]} /> : <MethodTag strategy={value} long className="mt-1" />}
      badge={!asked}
      changed={derived.source("renderStrategy") === "changed"}
      labelId={labelId}
      open={open}
      onToggle={() => setOpen((o) => !o)}
      others={options.length > 1}
    >
      <LookChoices
        rec={rec}
        options={options}
        page={rec.previewPage}
        chosen={value}
        onPick={(v) => chat.override("renderStrategy", v)}
        file={file}
        labelId={labelId}
      />
    </SurePick>
  )
}

/**
 * Pictures across two pages (Page Grouping): measured from the PDF and fixed once the book is
 * created, so it's a quiet line with a switch under the layout, not a question.
 */
function GroupingLine({ rec, chat }: Omit<Props, "file">) {
  const { i18n } = useLingui()
  const derived = chat.derived!
  const joined = derived.effective.pageGrouping?.value === "spread"
  const words = plainTitle("pageGrouping", joined ? "spread" : "single")
  const why = RULE_WHY[rec.settings.pageGrouping?.rule ?? ""]
  const changed = derived.source("pageGrouping") === "changed"
  const names = useWizardNames()
  const wizard = wizardValue("pageGrouping", joined ? "spread" : "single")
  return (
    <div className="flex items-start gap-3 rounded-[16px] bg-[var(--lc-bubble)] px-4 py-3 shadow-[var(--lc-shadow)]">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span id="gd-grouping" className="inline-flex items-center gap-1.5 text-[14.5px] font-medium">
          {names ? `${i18n._(WIZARD_SETTING.pageGrouping)}: ${typeof wizard === "string" ? wizard : i18n._(wizard)}` : i18n._(SETTING_NAME.pageGrouping)}
          <Lock aria-hidden className="size-3 text-muted-foreground" />
        </span>
        <span className="text-[13.5px] leading-snug text-muted-foreground">
          {words && i18n._(words)}
          {". "}
          {changed ? <Trans>Changed by you.</Trans> : why && i18n._(why)} <Trans>Fixed once the book is set up.</Trans>
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={joined}
        aria-labelledby="gd-grouping"
        onClick={() => chat.override("pageGrouping", joined ? "single" : "spread")}
        className={cn("relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500", joined ? "bg-[var(--lc-accent)]" : "bg-muted-foreground/30")}
      >
        <span className={cn("absolute left-1 size-5 rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none", joined && "translate-x-5")} />
      </button>
    </div>
  )
}

/** Screen 3 · How the pages look: the page layout (its options start open when the engine asked), and the two-page line. */
export function LookScreen({ rec, chat, file }: Props) {
  const fact = screenFacts(rec, chat.derived!.current, "look")[0]
  return (
    <div className="flex flex-col gap-3">
      <LayoutPick rec={rec} chat={chat} file={file} asked={!!fact?.ask} />
      <GroupingLine rec={rec} chat={chat} />
    </div>
  )
}
