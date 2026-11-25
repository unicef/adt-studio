import { Fragment } from "react"
import { useLingui } from "@lingui/react/macro"
import type { SetupRecommendation, SetupSettingId } from "@adt/types"
import { usePageThumb } from "../../../../../../core/pdf/usePageThumb"
import { plainTitle } from "../../words"
import { spreadPages } from "./parts"

// eslint-disable-next-line lingui/no-unlocalized-strings -- setting ids
const LEAD: SetupSettingId[] = ["preset", "renderStrategy", "pageGrouping"]
const PAGES = 4

/**
 * c15: the answer's shape first (two grey text lines and four grey pages, a light sweeping over
 * them); when the answer is in, the real words and the pages that show them replace the bars in
 * the same place, coming in from a blur. Nothing moves when it lands.
 */
export function SkeletonAnswer({ file, pageCount, rec }: { file: File; pageCount: number; rec: SetupRecommendation | null }) {
  const { i18n } = useLingui()
  const evidence = rec ? [...new Set(LEAD.flatMap((id) => rec.settingEvidence[id] ?? []))] : []
  const pages = (evidence.length >= PAGES ? evidence : [...new Set([...evidence, ...spreadPages(pageCount, PAGES)])]).slice(0, PAGES)
  const values = rec
    ? LEAD.map((id) => {
        const value = rec.settings[id]?.value
        const title = plainTitle(id, value)
        return title ? i18n._(title) : String(value ?? "")
      }).filter(Boolean)
    : []
  return (
    <div className="grid w-[360px] max-w-full">
      <div aria-hidden className={`flex flex-col [grid-area:1/1] ${rec ? "lcl-gone" : ""}`}>
        <span className="lcl-sk mt-[7px] h-[12px] w-[85%] rounded-[6px]" />
        <span className="lcl-sk mt-[14px] h-[12px] w-[60%] rounded-[6px]" />
        <div className="mt-[20px] flex gap-2">
          {Array.from({ length: PAGES }, (_, i) => (
            <span key={i} className="lcl-sk h-[72px] w-[54px] rounded-[5px]" />
          ))}
        </div>
      </div>
      {rec && (
        <div className="flex flex-col [grid-area:1/1]">
          <p className="lcl-real min-h-[52px] text-[15.5px] leading-[26px]">
            {values.map((v, i) => (
              <Fragment key={v}>
                {i > 0 && <span className="text-muted-foreground"> · </span>}
                <b className="font-semibold">{v}</b>
              </Fragment>
            ))}
          </p>
          <div aria-hidden className="mt-[13px] flex gap-2">
            {pages.map((page, i) => (
              <PageSlot key={page} file={file} page={page} delay={90 + i * 60} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** A page square: grey until its real page is drawn, then the page comes in from a blur. */
function PageSlot({ file, page, delay }: { file: File; page: number; delay: number }) {
  const src = usePageThumb(file, page, 64)
  return (
    <span className="grid">
      <span className={`lcl-sk h-[72px] w-[54px] rounded-[5px] [grid-area:1/1] ${src ? "lcl-gone" : ""}`} />
      {src && <img src={src} alt="" className="lcl-real lcl-page h-[72px] w-[54px] rounded-[5px] object-cover [grid-area:1/1]" style={{ animationDelay: `${delay}ms` }} />}
    </span>
  )
}
