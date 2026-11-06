import { Trans, useLingui } from "@lingui/react/macro"
import { TriangleAlert } from "lucide-react"
import type { AdtImportUnreadableDetails } from "@/api/client"
import { buildUnreadableRepairPrompt } from "../ImportProject/repair-prompt"
import { HeroBand } from "./HeroBand"
import { RepairRequest } from "./RepairRequest"
import { IssueList, Panel, StatusRow } from "./ReviewParts"
import { languageName, type Stat } from "./use-review-model"

/** The file an archive read error names, such as `manifest.json` or a page. */
function brokenFile(rawError: string): string | null {
  return rawError.match(/[\w./-]+\.(?:json|html|ya?ml)\b/)?.[0] ?? null
}

/**
 * An ADT export ADT Studio recognized but could not read. It looks like the
 * repair review: the book as far as it could be read, the problem, and the
 * repair request. Details that couldn't be read are marked. Nothing can be
 * imported from here; the next step is choosing the repaired ZIP.
 */
export function UnreadableReview({
  file,
  details,
  rawError,
  onReplace,
}: {
  file: File
  details: AdtImportUnreadableDetails
  rawError: string
  onReplace: () => void
}) {
  const { t, i18n } = useLingui()
  const outputs = details.outputLanguages?.length ?? 0
  const source = details.sourceLanguage ? languageName(details.sourceLanguage, i18n.locale) : null
  const count = (value: number | null) => (value === null ? null : String(value))
  const stats: Stat[] = [
    { value: count(details.pageCount), label: t`Pages` },
    // Counted from the image files: the exact number of images used needs the
    // full read that failed.
    { value: count(details.imageCount), label: t`Image files` },
    { value: count(details.tocEntryCount), label: t`Contents entries` },
    {
      value: details.sourceLanguage?.toUpperCase() ?? null,
      label: source === null
        ? t`Language`
        : outputs === 0
          ? t`${source} only`
          : t`${source} + ${outputs} {outputs, plural, one {translation} other {translations}}`,
    },
  ]
  const somethingMissing = details.title === null
    || details.coverBase64 === null
    || stats.some((stat) => stat.value === null)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
      <HeroBand
        kind="adt"
        cover={details.coverBase64}
        title={details.title}
        file={file}
        mode="repair"
        subtitle={null}
        stats={stats}
        replaceDisabled={false}
        onReplace={onReplace}
      />
      <div className="grid min-h-[320px] flex-1 gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Panel title={<Trans>To fix</Trans>}>
          <StatusRow
            status={{
              tone: "red",
              icon: TriangleAlert,
              title: t`This export can’t be read`,
              text: t`One of its files is broken, so ADT Studio stopped reading it. An AI assistant can fix it; nothing is imported until you choose the repaired ZIP.`,
            }}
          />
          <IssueList issues={[{ file: brokenFile(rawError) ?? file.name, code: "unreadable", text: rawError }]} />
          {somethingMissing ? (
            <p className="text-xs text-muted-foreground">
              <Trans>Details marked “—” couldn’t be read because of this problem.</Trans>
            </p>
          ) : null}
        </Panel>
        <Panel>
          <RepairRequest text={buildUnreadableRepairPrompt(file.name, rawError)} className="flex-1" />
        </Panel>
      </div>
    </div>
  )
}
