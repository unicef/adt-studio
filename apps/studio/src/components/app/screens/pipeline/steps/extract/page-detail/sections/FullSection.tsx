import type { PageDetail } from "@/api/client"
import { cn } from "@/lib/utils"
import { noTextLine } from "../emptyCopy"
import { ImagesSegmentError } from "../ImageGroups"
import { ImageThumbGrid } from "../ImageThumbGrid"
import { PageFontList } from "../PageFontList"
import { SelectedImage } from "../SelectedImage"
import type { BoxSelection } from "@/components/app/screens/pipeline/steps/shared/page-inspector/useBoxSelection"
import type { PageDetailData } from "../usePageDetailData"
import { READING_TEXT } from "./TextSection"
import type { SectionKind } from "./types"

export function FullSection({ kind, label, page, data, selection }: { kind: SectionKind; label: string; page: PageDetail; data: PageDetailData; selection: BoxSelection }) {
  if (kind === "images")
    return (
      <div className="flex flex-col gap-4">
        <ImagesSegmentError data={data} />
        <SelectedImage label={label} data={data} selection={selection} hint />
        <ImageThumbGrid label={label} data={data} selection={selection} />
      </div>
    )
  if (kind === "text")
    return page.text ? (
      <p className={cn(READING_TEXT, "mx-auto text-[15px] leading-[1.7]")}>{page.text.trim()}</p>
    ) : (
      <p className="text-[12.5px] text-muted-foreground">{noTextLine(page)}</p>
    )
  return <PageFontList page={page} reflowableFont={data.reflowableFont} />
}
