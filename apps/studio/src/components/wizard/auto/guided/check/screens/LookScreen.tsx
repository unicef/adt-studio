/* eslint-disable lingui/no-unlocalized-strings -- setting ids and values, never shown */
import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Lock, Smartphone, ThumbsUp } from "lucide-react"
import type { SetupRecommendation } from "@adt/types"
import { cn } from "@/lib/utils"
import { strategiesFor } from "../../../engine/answers"
import { RULE_WHY, SETTING_NAME, SETTING_VALUE } from "../../../engine/words"
import { LookChoices, type LookOption } from "../../shared/PreviewChoices"
import { lookOf } from "../../shared/screens/look"
import { layoutArt } from "../../shared/art/ConceptArt"
import { MethodTag, usesAI } from "../../shared/MethodTag"
import { LAYOUT_AT_A_GLANCE, LAYOUT_GUIDE } from "../../shared/optionGuide"
import { Citation } from "../../shared/Citation"
import type { Answers } from "../../shared/useAnswers"
import { plainTitle, SETTING_OPTIONS } from "../../shared/words"
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
  const derived = chat.derived!
  const [open, setOpen] = useState(false)
  const value = String(derived.effective.renderStrategy?.value)
  const shown = new Set(SETTING_OPTIONS.renderStrategy.map((o) => String(o.value)))
  const allowed = strategiesFor(derived.effective.preset?.value).filter((s) => shown.has(s))
  const name = (v: string) => {
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
      // The card: its name, one line on what you get, and how it's made.
      line: LAYOUT_AT_A_GLANCE[v] ? i18n._(LAYOUT_AT_A_GLANCE[v]!.line) : "",
      more: SETTING_VALUE.renderStrategy[v] ? i18n._(SETTING_VALUE.renderStrategy[v]!.means) : undefined,
      guide: LAYOUT_GUIDE[v],
      phone: LAYOUT_AT_A_GLANCE[v] ? i18n._(LAYOUT_AT_A_GLANCE[v]!.phone) : undefined,
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
    }),
  )
  const labelId = "gd-layout"
  const means = SETTING_VALUE.renderStrategy[value]?.means
  const choices = <LookChoices rec={rec} options={options} page={rec.previewPage} chosen={value} onPick={(v) => chat.override("renderStrategy", v)} file={file} labelId={labelId} />
  // Asked: the options are the question, side by side, as on any asked fact.
  if (asked)
    return (
      <div className="flex flex-col gap-2">
        <p id={labelId} className="px-1 text-[15px] font-medium">
          <Trans>How the pages look on screen</Trans>
        </p>
        {choices}
      </div>
    )
  return (
    <SurePick
      picture={<span className={`grid shrink-0 place-items-center p-3 ${PICTURE}`}>{layoutArt(value)}</span>}
      label={<Trans>How the pages look on screen</Trans>}
      title={name(value)}
      hint={means ? i18n._(means) : undefined}
      result={<AtAGlance strategy={value} />}
      badge={!asked}
      changed={derived.source("renderStrategy") === "changed"}
      labelId={labelId}
      open={open}
      onToggle={() => setOpen((o) => !o)}
      others={options.length > 1}
    >
      {choices}
    </SurePick>
  )
}

/** Under the picked layout: the books it suits, how it reads on a phone, and how it's made. */
function AtAGlance({ strategy }: { strategy: string }) {
  const { i18n } = useLingui()
  const at = LAYOUT_AT_A_GLANCE[strategy]
  return (
    <span className="mt-1 flex flex-col gap-1.5">
      {at && (
        <>
          <span className="flex items-start gap-2">
            <ThumbsUp aria-hidden className="mt-[3px] size-4 shrink-0 text-brand-500" />
            <span>
              <span className="font-medium">
                <Trans>Best for:</Trans>
              </span>{" "}
              <span className="text-muted-foreground">{i18n._(at.best)}</span>
            </span>
          </span>
          <span className="flex items-start gap-2">
            <Smartphone aria-hidden className="mt-[3px] size-4 shrink-0 text-brand-500" />
            <span>
              <span className="font-medium">
                <Trans>On a phone:</Trans>
              </span>{" "}
              <span className="text-muted-foreground">{i18n._(at.phone)}</span>
            </span>
          </span>
        </>
      )}
      <MethodTag strategy={strategy} long className="mt-1" />
    </span>
  )
}

/** Screen 3 · How the pages look: the page layout (its options shown at once when the engine asked). Joining facing pages has its own screen (SpreadsScreen). */
export function LookScreen({ rec, chat, file }: Props) {
  const fact = screenFacts(rec, chat.derived!.current, "look")[0]
  return (
    <LayoutPick rec={rec} chat={chat} file={file} asked={!!fact?.ask} />
  )
}
