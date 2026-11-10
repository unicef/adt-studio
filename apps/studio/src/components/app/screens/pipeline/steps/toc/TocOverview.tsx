import type { ReactNode } from "react"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { List, Plus } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import type { TocEntry } from "@/api/client"
import type { PageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { ListToolbar } from "../shared/list/ListToolbar"
import { useListView } from "../shared/list/useListView"
import { ListPagesGrid } from "../shared/list/variants/ListPagesGrid"
import { ListPagesSwitch } from "../shared/list/variants/ListPagesSwitch"
import { StepActionButton } from "../shared/StepActionButton"
import { StepFilterTabs } from "../shared/StepFilterTabs"
import { StepSearch } from "../shared/StepSearch"
import { SaveError, StepBody, StepEmptyHint } from "../shared/ui"
import { cn } from "@/lib/utils"
import { TocEntryRow, type TocRowContext } from "./TocEntryRow"
import { TocReaderMenu } from "./TocReaderMenu"

export function TocOverview({
  label,
  hex,
  meta,
  top,
  help,
  entries,
  shown,
  levels,
  level,
  onLevel,
  search,
  onSearch,
  saveError,
  dirty,
  ctx,
  addDisabledReason,
  onAddEnd,
  navPages,
  aspect,
  entriesOn,
  onOpenPage,
  showRows,
  onShowRows,
}: {
  label: string
  hex: string
  meta: string
  top: ReactNode
  help: ReactNode
  entries: TocEntry[]
  shown: TocEntry[]
  levels: number[]
  level: string
  onLevel: (value: string) => void
  search: string
  onSearch: (value: string) => void
  saveError: Error | null
  dirty: boolean
  ctx: TocRowContext
  addDisabledReason?: string
  onAddEnd: () => void
  navPages: readonly PipelinePage[]
  aspect: PageAspect
  entriesOn: (pageId: string) => TocEntry[]
  onOpenPage: (pageId: string) => void
  showRows: boolean
  onShowRows: () => void
}) {
  const { t } = useLingui()
  const view = useListView("toc")
  const byPage = view === "pages" && !showRows
  const searching = search.trim().length > 0
  const countAt = (value: number) => entries.filter((entry) => entry.level === value).length

  return (
    <StepBody
      width="reading"
      title={getStageLabelI18n("toc")}
      meta={meta}
      titleExtra={help}
      actions={
        <>
          {!byPage && (
            <StepSearch
              value={search}
              onChange={onSearch}
              placeholder={t`Search entries…`}
              ariaLabel={t`Search table of contents entries`}
              matches={{ shown: shown.length, total: entries.length }}
            />
          )}
          <StepActionButton look="header" icon={Plus} onClick={onAddEnd} disabled={!!addDisabledReason} disabledReason={addDisabledReason}>
            <Trans>Add entry</Trans>
          </StepActionButton>
        </>
      }
    >
      {top}
      <ListToolbar
        left={
          byPage ? null : (
            <StepFilterTabs
              ariaLabel={t`Show levels`}
              accent={hex}
              value={level}
              onChange={onLevel}
              options={[
                { value: "", label: t`All`, count: entries.length },
                ...levels.map((value) => ({ value: String(value), label: t`Level ${value}`, count: countAt(value) })),
              ]}
            />
          )
        }
        right={byPage ? <ListPagesSwitch label={t`All entries`} onClick={onShowRows} /> : null}
      />
      <SaveError error={saveError} />
      {byPage ? (
        <ListPagesGrid
          label={label}
          pages={navPages}
          aspect={aspect}
          onOpen={onOpenPage}
          cardOf={(page) => {
            const list = entriesOn(page.pageId)
            return {
              stats: [{ key: "e", icon: List, value: list.length, label: t`${plural(list.length, { one: "# entry", other: "# entries" })}` }],
              preview: list.slice(0, 2).map((entry) => entry.title).join(" · "),
            }
          }}
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
          <div className="flex min-w-0 flex-col gap-1.5">
            {shown.length === 0 ? (
              <StepEmptyHint>
                <span className="flex flex-col items-center gap-2">
                  {searching ? <Trans>No entries match “{search.trim()}”</Trans> : <Trans>No entries at this level</Trans>}
                  {searching && (
                    <button type="button" onClick={() => onSearch("")} className="font-medium text-foreground underline-offset-4 hover:underline">
                      <Trans>Clear search</Trans>
                    </button>
                  )}
                </span>
              </StepEmptyHint>
            ) : (
              shown.map((entry) => <TocEntryRow key={entry.id} entry={entry} ctx={ctx} />)
            )}
          </div>
          <TocReaderMenu entries={entries} hex={hex} />
        </div>
      )}
      <div
        aria-hidden
        className={cn("shrink-0 transition-[height] duration-200 ease-out motion-reduce:transition-none", dirty ? "h-20" : "h-0")}
      />
    </StepBody>
  )
}
