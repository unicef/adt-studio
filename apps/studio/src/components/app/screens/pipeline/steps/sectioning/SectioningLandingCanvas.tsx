import { useBook } from "@/hooks/use-books"
import { useBookConfig } from "@/hooks/use-book-config"
import { usePages } from "@/hooks/use-pages"
import { useSourcePdfInfo } from "@/hooks/use-source-pdf-info"
import { STAGES } from "@/components/pipeline/stage-config"
import { LandingBookCanvas } from "../landing/book-canvas/LandingBookCanvas"
import { SectioningPagesWall, type SectioningWallMode } from "./SectioningPagesWall"

const FALLBACK_HEX = "#0284c7"

export function SectioningLandingCanvas({
  bookLabel,
  mode,
}: {
  bookLabel: string
  mode: SectioningWallMode
}) {
  const { data: pages } = usePages(bookLabel)
  const { data: bookConfigData } = useBookConfig(bookLabel)
  const { data: book } = useBook(bookLabel)
  const { data: sourcePdfInfo, isError: sourcePdfFailed } = useSourcePdfInfo(bookLabel)
  const hex = STAGES.find((stage) => stage.slug === "sectioning")?.hex ?? FALLBACK_HEX

  if (pages && pages.length > 0) return <SectioningPagesWall bookLabel={bookLabel} pages={pages} mode={mode} hex={hex} />

  const totalPages = sourcePdfInfo?.pageCount ?? book?.pageCount ?? 0
  const config = bookConfigData?.config
  const start = config?.start_page != null ? Number(config.start_page) : 1
  const end = config?.end_page != null ? Number(config.end_page) : Math.max(start, totalPages || 1)
  return <LandingBookCanvas bookLabel={bookLabel} range={[start, end]} spread={config?.spread_mode === true} totalPages={totalPages} failed={sourcePdfFailed} />
}
