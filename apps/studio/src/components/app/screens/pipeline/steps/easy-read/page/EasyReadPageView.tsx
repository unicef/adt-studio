import { ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import type { EasyReadSectionBlock } from "@/api/client"
import { usePages } from "@/hooks/use-pages"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { lowResThumbnail, pageViewThumbnailUrl } from "@/components/app/screens/pipeline/shared/page-thumbnail/pageThumbnail"
import { DetailNavButton, StepBody } from "../../shared/ui"
import type { DescribedProblem } from "../../shared/problems/useDescribeProblem"
import type { ProblemRetry } from "../../shared/problems/FoldedProblem"
import { InspectorInfoLine, InspectorLayout } from "../../shared/page-inspector/layout"
import { PageDetailSheet } from "../../shared/page-inspector/PageDetailSheet"
import { PagePreview } from "../../shared/page-inspector/PagePreview"
import { PageProblemChip } from "../../shared/page-inspector/problem/PageProblemChip"
import { usePageProblem } from "../../shared/page-inspector/problem/usePageProblem"
import { useInspectorSheet } from "../../shared/page-inspector/useInspectorSheet"
import type { PageBox, PageSize } from "../../shared/page-inspector/types"
import { entryCount } from "../easyReadPages"
import { EasyReadSections, type EasyReadSectionsProps } from "../EasyReadSections"
import { EasyReadPanel } from "./EasyReadPanel"

const NO_BOXES: PageBox[] = []
const ignore = () => {}

export interface EasyReadPageViewProps {
  label: string
  pageId: string
  pageNumber: number
  hex: string
  blocks: readonly EasyReadSectionBlock[]
  locked: boolean
  saveError: Error | null
  isEdited: EasyReadSectionsProps["isEdited"]
  onUpdate: EasyReadSectionsProps["onUpdate"]
  prevPageId: string | null
  nextPageId: string | null
  onStep: (pageId: string) => void
  onClose: () => void
  problem?: DescribedProblem | null
  retry?: ProblemRetry
}

export function EasyReadPageView(props: EasyReadPageViewProps) {
  const { label, pageId, pageNumber, hex, blocks, prevPageId, nextPageId, onStep, onClose } = props
  const { t } = useLingui()
  const pageProblem = usePageProblem({ label, problem: props.problem ?? null, pageId, pageNumber, retry: props.retry })
  const summary = usePages(label, { enabled: false }).data?.find((page) => page.pageId === pageId)
  const size: PageSize | null = summary?.pageWidth && summary.pageHeight ? { w: summary.pageWidth, h: summary.pageHeight } : null
  const sheet = useInspectorSheet<"blocks">("blocks")
  const pageSrc = pageViewThumbnailUrl(label, pageId)
  const sections = blocks.length
  const entries = entryCount(blocks)

  return (
    <StepBody
      title={<Trans>Page {pageNumber}</Trans>}
      width="fluid"
      fill
      titleExtra={pageProblem ? <PageProblemChip problem={pageProblem} hex={hex} stageName={getStageLabelI18n("easy-read")} onAllPages={onClose} /> : undefined}
      actions={
        <>
          <DetailNavButton icon={ChevronLeft} label={t`Previous page`} onClick={() => prevPageId && onStep(prevPageId)} disabled={!prevPageId} />
          <DetailNavButton icon={ChevronRight} label={t`Next page`} onClick={() => nextPageId && onStep(nextPageId)} disabled={!nextPageId} />
          <DetailNavButton icon={LayoutGrid} label={t`All pages`} onClick={onClose}>
            <Trans>All pages</Trans>
          </DetailNavButton>
        </>
      }
    >
      <InspectorInfoLine>
        {t`${pageId} · ${plural(sections, { one: "# section", other: "# sections" })} · ${plural(entries, { one: "# block", other: "# blocks" })}`}
      </InspectorInfoLine>
      <InspectorLayout
        page={
          <PagePreview
            src={pageSrc}
            lowSrc={lowResThumbnail(label, pageId)}
            pageNumber={pageNumber}
            size={size}
            entries={NO_BOXES}
            hoverId={null}
            selectedId={null}
            onHover={ignore}
            onSelect={ignore}
          />
        }
        sheet={
          <PageDetailSheet
            open={sheet.open}
            contentKey={sheet.shownKind}
            title={<Trans>Blocks · {entries}</Trans>}
            pageSrc={pageSrc}
            pageNumber={pageNumber}
            onClose={sheet.close}
          >
            <EasyReadSections
              blocks={blocks}
              layout="columns"
              locked={props.locked}
              isEdited={props.isEdited}
              onUpdate={props.onUpdate}
              className="-mx-3.5 -mt-3.5"
            />
          </PageDetailSheet>
        }
        panel={
          <EasyReadPanel
            blocks={blocks}
            locked={props.locked}
            saveError={props.saveError}
            isEdited={props.isEdited}
            onUpdate={props.onUpdate}
            more={sheet.more("blocks")}
          />
        }
      />
    </StepBody>
  )
}
