import { useCallback, useRef, useState } from "react"
import type { PageDetail } from "@/api/client"
import { PageDetailSheet } from "./PageDetailSheet"
import { PagePreview } from "./PagePreview"
import { FontsSection } from "./sections/FontsSection"
import { FullSection } from "./sections/FullSection"
import { ImagesSection } from "./sections/ImagesSection"
import { SectionTitle } from "./sections/sectionTitle"
import { TextSection } from "./sections/TextSection"
import type { SectionKind, SectionMore } from "./sections/types"
import { useBoxSelection } from "./useBoxSelection"
import type { PageDetailData } from "./usePageDetailData"

export function PageDetailLayout({ label, pageId, page, data }: { label: string; pageId: string; page: PageDetail; data: PageDetailData }) {
  const selection = useBoxSelection()
  const [openKind, setOpenKind] = useState<SectionKind | null>(null)
  const [shownKind, setShownKind] = useState<SectionKind>("images")
  const triggers = useRef<Record<SectionKind, HTMLButtonElement | null>>({ images: null, text: null, fonts: null })

  const close = useCallback(() => {
    if (openKind) {
      const trigger = triggers.current[openKind]
      requestAnimationFrame(() => trigger?.focus({ preventScroll: true }))
    }
    setOpenKind(null)
  }, [openKind])

  const more = (kind: SectionKind): SectionMore => ({
    open: openKind === kind,
    buttonRef: (element) => {
      triggers.current[kind] = element
    },
    onMore: () => {
      setShownKind(kind)
      setOpenKind(kind)
    },
  })

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(380px,26%)]">
      <div className="relative flex min-h-[420px] min-w-0 items-start justify-center [container-type:size] lg:min-h-0">
        <PagePreview
          src={data.pageSrc}
          pageNumber={page.pageNumber}
          size={data.pageSize}
          onSize={data.onPageImageSize}
          entries={data.entries}
          hoverId={selection.hoverId}
          selectedId={selection.selectedId}
          onHover={selection.hover}
          onSelect={selection.select}
        />
        <PageDetailSheet
          open={openKind != null}
          contentKey={shownKind}
          title={<SectionTitle kind={shownKind} data={data} />}
          pageSrc={data.pageSrc}
          pageNumber={page.pageNumber}
          onClose={close}
        >
          <FullSection kind={shownKind} label={label} page={page} data={data} selection={selection} />
        </PageDetailSheet>
      </div>
      <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain p-4 [scrollbar-width:thin]">
          <ImagesSection label={label} pageId={pageId} data={data} selection={selection} more={more("images")} />
          <TextSection page={page} metadataRunning={data.metadataRunning} more={more("text")} />
          <FontsSection page={page} reflowableFont={data.reflowableFont} more={more("fonts")} />
        </div>
      </aside>
    </div>
  )
}
