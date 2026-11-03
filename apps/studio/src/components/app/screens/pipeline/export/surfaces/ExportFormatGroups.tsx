import { useId } from "react"
import { useLingui } from "@lingui/react/macro"
import type { ExportFormat } from "@/components/pipeline/stages/export/export-formats"
import { ExportFormatRows } from "./ExportParts"
import type { ExportFlow } from "./useExportFlow"

export function ExportFormatGroups({ flow }: { flow: ExportFlow }) {
  const { t } = useLingui()
  const id = useId()
  const groups: { title: string; formats: ExportFormat[] }[] = [
    { title: t`Share online`, formats: ["adt"] },
    { title: t`Reading apps and servers`, formats: ["epub", "webpub", "pnld"] },
    { title: t`Learning platforms`, formats: ["scorm"] },
    { title: flow.isPart ? t`Send back` : t`Keep a copy`, formats: ["project"] },
  ]
  return (
    <div className="flex flex-col gap-1">
      {groups.map((group, index) => (
        <section key={group.title} className="flex flex-col gap-0.5">
          <h4 id={`${id}-${index}`} className="px-2 pb-0.5 pt-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group.title}
          </h4>
          <ExportFormatRows flow={flow} formats={group.formats} labelledBy={`${id}-${index}`} />
        </section>
      ))}
    </div>
  )
}
