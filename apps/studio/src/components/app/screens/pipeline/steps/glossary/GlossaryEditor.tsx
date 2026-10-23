import { useId } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { SignLanguageVideo } from "@/api/client"
import type { TermOccurrence } from "@/components/pipeline/stages/glossary/lib/occurrences"
import { DraftField } from "../shared/list/DraftField"
import { QUIET_CHIP } from "../shared/ui"
import { EmojiInput } from "./EmojiInput"
import { GlossaryItemPicture } from "./GlossaryItemPicture"
import { GlossarySignVideo } from "./GlossarySignVideo"
import { OccurrenceList, type OccurrencePage } from "./TermOccurrences"
import type { GlossaryRow, GlossaryTextPatch } from "./glossaryRows"

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </label>
  )
}

export function GlossaryEditor({
  label,
  row,
  textId,
  video,
  videos,
  occurrence,
  occurrencePages,
  locked,
  videoBlockedReason,
  onText,
  onPicture,
  onOpenPage,
}: {
  label: string
  row: GlossaryRow
  textId: string
  video: SignLanguageVideo | null
  videos: SignLanguageVideo[]
  occurrence: TermOccurrence | undefined
  occurrencePages: OccurrencePage[]
  locked: boolean
  videoBlockedReason?: string
  onText: (patch: GlossaryTextPatch) => void
  onPicture: (imageId: string | undefined) => void
  onOpenPage: (pageId: string) => void
}) {
  const { t } = useLingui()
  const ids = useId()
  const muted = row.pruned === true
  return (
    <div className="@container">
      <div className="grid gap-4 @[760px]:grid-cols-[minmax(0,1fr)_220px]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor={`${ids}-word`}>
              <Trans>Word</Trans>
            </FieldLabel>
            <DraftField id={`${ids}-word`} value={row.word} disabled={locked} ariaLabel={t`Word`} onCommit={(word) => onText({ word })} />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor={`${ids}-definition`}>
              <Trans>Definition</Trans>
            </FieldLabel>
            <DraftField
              id={`${ids}-definition`}
              multiline
              value={row.definition}
              disabled={locked}
              ariaLabel={t`Definition of ${row.word}`}
              placeholder={t`Add a definition…`}
              onCommit={(definition) => onText({ definition })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor={`${ids}-emojis`}>
              <Trans>Emojis</Trans>
            </FieldLabel>
            <EmojiInput
              id={`${ids}-emojis`}
              value={row.emojis}
              disabled={locked}
              ariaLabel={t`Emojis for ${row.word}`}
              placeholder={t`Add emojis`}
              onChange={(emojis) => onText({ emojis })}
            />
          </div>
          {row.variations.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] text-muted-foreground">
                <Trans>Also matches</Trans>
              </span>
              {row.variations.map((variation) => (
                <span key={variation} className={QUIET_CHIP}>
                  {variation}
                </span>
              ))}
            </div>
          )}
          <OccurrenceList occurrence={occurrence} pages={occurrencePages} onOpenPage={onOpenPage} />
        </div>
        <div className="flex flex-col gap-4">
          <GlossaryItemPicture label={label} imageId={row.imageId} word={row.word} muted={muted} disabled={locked} onChange={onPicture} />
          <GlossarySignVideo label={label} textId={textId} video={video} videos={videos} muted={muted} blockedReason={videoBlockedReason} />
        </div>
      </div>
    </div>
  )
}
