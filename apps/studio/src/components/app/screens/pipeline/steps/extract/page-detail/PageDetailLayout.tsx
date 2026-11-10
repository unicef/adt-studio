import type { PageDetail } from "@/api/client"
import { InspectorLayout } from "@/components/app/screens/pipeline/steps/shared/page-inspector/layout"
import { PageDetailSheet } from "@/components/app/screens/pipeline/steps/shared/page-inspector/PageDetailSheet"
import { PagePreview } from "@/components/app/screens/pipeline/steps/shared/page-inspector/PagePreview"
import { FontsSection } from "./sections/FontsSection"
import { FullSection } from "./sections/FullSection"
import { ImagesSection } from "./sections/ImagesSection"
import { SectionTitle } from "./sections/sectionTitle"
import { TextSection } from "./sections/TextSection"
import type { SectionKind } from "./sections/types"
import { useInspectorSheet } from "@/components/app/screens/pipeline/steps/shared/page-inspector/useInspectorSheet"
import { useBoxSelection } from "@/components/app/screens/pipeline/steps/shared/page-inspector/useBoxSelection"
import type { PageDetailData } from "./usePageDetailData"
import { useLeftOutLayer } from "../prune-review/marks/useLeftOutLayer"
import { useLeftOutPage } from "../prune-review/LeftOutContext"
import { PanelTabs, usePanelTab } from "./PanelTabs"

const NO_BOXES: PageDetailData["entries"] = []

export function PageDetailLayout({ label, pageId, page, data }: { label: string; pageId: string; page: PageDetail; data: PageDetailData }) {
  const selection = useBoxSelection()
  const sheet = useInspectorSheet<SectionKind>("images")
  const { more } = sheet
  const leftOutPage = useLeftOutPage()
  const reviewTab = leftOutPage?.reviewTab ?? null
  const panelTab = usePanelTab(reviewTab, pageId)
  const reviewing = panelTab.tab === "review"
  const leftOut = useLeftOutLayer({ pageId, data, selection, reviewing })

  const details = (
    <>
      <ImagesSection label={label} pageId={pageId} data={data} selection={selection} more={more("images")} />
      <TextSection page={page} metadataRunning={data.metadataRunning} more={more("text")} />
      <FontsSection page={page} reflowableFont={data.reflowableFont} more={more("fonts")} />
    </>
  )

  return (
    <InspectorLayout
      page={
        <>
          <PagePreview
            src={data.pageSrc}
            lowSrc={data.lowSrc}
            pageNumber={page.pageNumber}
            size={data.pageSize}
            entries={reviewing ? NO_BOXES : data.entries}
            hoverId={reviewing ? null : selection.hoverId}
            selectedId={reviewing ? null : selection.selectedId}
            onHover={selection.hover}
            onSelect={selection.select}
            overlay={leftOut.overlay}
          />
        </>
      }
      sheet={
        <PageDetailSheet
          open={sheet.open}
          contentKey={sheet.shownKind}
          title={<SectionTitle kind={sheet.shownKind} data={data} />}
          pageSrc={data.pageSrc}
          pageNumber={page.pageNumber}
          onClose={sheet.close}
        >
          <FullSection kind={sheet.shownKind} label={label} page={page} data={data} selection={selection} />
        </PageDetailSheet>
      }
      panel={
        reviewTab && leftOutPage ? (
          <PanelTabs pageId={pageId} hex={leftOutPage.hex} review={reviewTab} details={details} tab={panelTab.tab ?? "details"} onChoose={panelTab.choose} />
        ) : (
          details
        )
      }
    />
  )
}
