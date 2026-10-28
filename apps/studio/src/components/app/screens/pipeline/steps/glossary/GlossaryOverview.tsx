import type { ReactNode } from "react"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { BookOpen, Plus } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { useVariant } from "@/components/app/lab/variants"
import type { PageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { ListToolbar } from "../shared/list/ListToolbar"
import { useListView } from "../shared/list/useListView"
import { ListPagesGrid } from "../shared/list/variants/ListPagesGrid"
import { ListPagesSwitch } from "../shared/list/variants/ListPagesSwitch"
import { StepActionButton } from "../shared/StepActionButton"
import { StepSearch } from "../shared/StepSearch"
import { SaveError, StepBody, StepEmptyHint } from "../shared/ui"
import { GlossaryTermRow, type GlossaryRowContext } from "./GlossaryTermRow"
import { SortMenu, type GlossarySort } from "./SortMenu"
import type { GlossaryFilter, GlossaryListResult } from "./glossaryList"
import type { GlossaryRow } from "./glossaryRows"
import { GlossaryFiltersInline } from "./variants/GlossaryFiltersInline"
import { GlossaryFiltersTray } from "./variants/GlossaryFiltersTray"
import { GlossaryPrunedTray } from "./variants/GlossaryPrunedTray"

export interface GlossaryOverviewProps {
  label: string
  hex: string
  meta: string
  top: ReactNode
  help: ReactNode
  list: GlossaryListResult
  search: string
  onSearch: (value: string) => void
  filter: GlossaryFilter
  onFilter: (value: GlossaryFilter) => void
  mineOnly: boolean
  onMineOnly: (value: boolean) => void
  sort: GlossarySort
  onSort: (value: GlossarySort) => void
  saveError: Error | null
  ctx: GlossaryRowContext
  expanded: ReadonlySet<string>
  onToggle: (key: string) => void
  flashKey: string | null
  addDisabledReason?: string
  onAdd: () => void
  navPages: readonly PipelinePage[]
  aspect: PageAspect
  rowsOn: (pageId: string) => GlossaryRow[]
  onOpenPage: (pageId: string) => void
  showRows: boolean
  onShowRows: () => void
}

export function GlossaryOverview(props: GlossaryOverviewProps) {
  const { t } = useLingui()
  const prunedMode = useVariant("pruned")
  const view = useListView("glossary")
  const { list, ctx, expanded, onToggle, flashKey } = props
  const byPage = view === "pages" && !props.showRows
  const toggleFor = (row: GlossaryRow) => (view === "cards" ? undefined : () => onToggle(row._key))
  const renderRow = (row: GlossaryRow) => (
    <GlossaryTermRow
      key={row._key}
      row={row}
      ctx={ctx}
      expanded={view === "cards" || expanded.has(row._key)}
      onToggle={toggleFor(row)}
      flash={flashKey === row._key}
    />
  )
  const searching = props.search.trim().length > 0

  return (
    <StepBody
      width="reading"
      title={getStageLabelI18n("glossary")}
      meta={props.meta}
      titleExtra={props.help}
      actions={
        <>
          {!byPage && (
            <StepSearch
              value={props.search}
              onChange={props.onSearch}
              placeholder={t`Search terms…`}
              ariaLabel={t`Search terms, definitions and variations`}
              matches={list.matches}
            />
          )}
          <StepActionButton look="header" icon={Plus} onClick={props.onAdd} disabled={!!props.addDisabledReason} disabledReason={props.addDisabledReason}>
            <Trans>Add term</Trans>
          </StepActionButton>
        </>
      }
    >
      {props.top}
      <ListToolbar
        left={
          byPage ? null : prunedMode === "tray" ? (
            <GlossaryFiltersTray counts={list.counts} mineOnly={props.mineOnly} onMineOnly={props.onMineOnly} hex={props.hex} />
          ) : (
            <GlossaryFiltersInline
              counts={list.counts}
              filter={props.filter}
              onFilter={props.onFilter}
              mineOnly={props.mineOnly}
              onMineOnly={props.onMineOnly}
              hex={props.hex}
            />
          )
        }
        right={
          byPage ? (
            <ListPagesSwitch label={t`All terms`} onClick={props.onShowRows} />
          ) : (
            <>
              <SortMenu value={props.sort} onChange={props.onSort} />
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {t`${plural(list.counts.active, { one: "# term", other: "# terms" })}`}
              </span>
            </>
          )
        }
      />
      <SaveError error={props.saveError} />
      {byPage ? (
        <ListPagesGrid
          label={props.label}
          pages={props.navPages}
          aspect={props.aspect}
          onOpen={props.onOpenPage}
          cardOf={(page) => {
            const rows = props.rowsOn(page.pageId)
            return {
              stats: [{ key: "terms", icon: BookOpen, value: rows.length, label: t`${plural(rows.length, { one: "# term", other: "# terms" })}` }],
              preview: rows.slice(0, 2).map((row) => row.word).join(" · "),
            }
          }}
        />
      ) : list.main.length === 0 && list.tray.length === 0 ? (
        <StepEmptyHint>
          <span className="flex flex-col items-center gap-2">
            {searching ? <Trans>No terms match “{props.search.trim()}”</Trans> : <Trans>No terms to show</Trans>}
            {searching && (
              <button type="button" onClick={() => props.onSearch("")} className="font-medium text-foreground underline-offset-4 hover:underline">
                <Trans>Clear search</Trans>
              </button>
            )}
          </span>
        </StepEmptyHint>
      ) : (
        <div className="flex flex-col gap-1.5">
          {list.main.map(renderRow)}
          {prunedMode === "tray" && (
            <GlossaryPrunedTray count={list.tray.length} forceOpen={searching}>
              {list.tray.map(renderRow)}
            </GlossaryPrunedTray>
          )}
        </div>
      )}
    </StepBody>
  )
}
