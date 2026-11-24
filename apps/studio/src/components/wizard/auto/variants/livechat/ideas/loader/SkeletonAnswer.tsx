import { useLingui } from "@lingui/react/macro"
import type { SetupRecommendation, SetupSettingId } from "@adt/types"
import { SettingPill } from "../../../chat/bubbles"
import { SETTING_LABEL, valueTitle } from "../../../chat/words"
import { usePageThumb } from "../../../../../core/pdf/usePageThumb"
import { spreadPages } from "./shared"

// eslint-disable-next-line lingui/no-unlocalized-strings -- setting ids
const LEAD: SetupSettingId[] = ["preset", "renderStrategy", "pageGrouping"]
const PILL_WIDTHS = ["w-[150px]", "w-[190px]", "w-[170px]"]
const PAGES = 4

/**
 * c15: grey bars in the shape of the answer while it reads (three settings, four pages); when the
 * answer is in, the real settings and the pages that show them take their places.
 */
export function SkeletonAnswer({ file, pageCount, rec }: { file: File; pageCount: number; rec: SetupRecommendation | null }) {
  const { i18n } = useLingui()
  const evidence = rec ? [...new Set(LEAD.flatMap((id) => rec.settingEvidence[id] ?? []))] : []
  const pages = (evidence.length >= PAGES ? evidence : [...new Set([...evidence, ...spreadPages(pageCount, PAGES)])]).slice(0, PAGES)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {LEAD.map((id, i) => {
          const bar = <span aria-hidden className={`lcl-sk h-[27px] rounded-full [grid-area:1/1] ${PILL_WIDTHS[i]} ${rec ? "lcl-gone" : ""}`} />
          if (!rec) return <span key={id} className="inline-grid">{bar}</span>
          const value = rec.settings[id]?.value
          const title = valueTitle(id, value)
          return (
            <span key={id} className="inline-grid">
              {bar}
              <span className="lcl-real [grid-area:1/1]" style={{ animationDelay: `${i * 70}ms` }}>
                <SettingPill label={i18n._(SETTING_LABEL[id])} value={title ? i18n._(title) : String(value)} />
              </span>
            </span>
          )
        })}
      </div>
      <div aria-hidden className="flex gap-2">
        {pages.map((page, i) => (rec ? <PageSlot key={`p-${page}`} file={file} page={page} delay={210 + i * 60} /> : <span key={`s-${i}`} className="lcl-sk h-[72px] w-[54px] rounded-[5px]" />))}
      </div>
    </div>
  )
}

/** A page square: grey until its real page is drawn, then the page comes in from a blur. */
function PageSlot({ file, page, delay }: { file: File; page: number; delay: number }) {
  const src = usePageThumb(file, page, 64)
  return (
    <span className="grid">
      <span className={`lcl-sk h-[72px] w-[54px] rounded-[5px] [grid-area:1/1] ${src ? "lcl-gone" : ""}`} />
      {src && <img src={src} alt="" className="lcl-real h-[72px] w-[54px] rounded-[5px] object-cover ring-1 ring-border [grid-area:1/1]" style={{ animationDelay: `${delay}ms` }} />}
    </span>
  )
}
