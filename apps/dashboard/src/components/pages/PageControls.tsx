import { MetricPicker } from "../compare/MatrixTable"
import { pageDiffers, pageLabel, VIEWPORTS, type MergedPage, type ViewportKey } from "./helpers"

interface PageControlsProps {
  pages: MergedPage[]
  index: number
  onIndex: (index: number) => void
  viewport: ViewportKey
  onViewport: (viewport: ViewportKey) => void
  showOriginal: boolean
  onShowOriginal: (show: boolean) => void
  canShowOriginal: boolean
  sync: boolean
  onSync: (sync: boolean) => void
}

const NAV_BUTTON =
  "press grid size-8 place-items-center rounded-md border border-line bg-surface text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"

export function PageControls(props: PageControlsProps) {
  const { pages, index, onIndex } = props
  return (
    <div className="sticky top-14 z-10 -mx-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-page/90 px-4 py-2.5 backdrop-blur-md lg:mx-0 lg:px-0">
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label="Previous page" disabled={index <= 0} onClick={() => onIndex(index - 1)} className={NAV_BUTTON}>
          <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5">
            <path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <select
          aria-label="Page"
          value={index}
          onChange={(event) => onIndex(Number(event.target.value))}
          className="h-8 max-w-[16rem] rounded-md border border-line bg-surface px-2 text-sm text-ink tabular-nums focus-visible:outline-2 focus-visible:outline-accent"
        >
          {pages.map((page, i) => (
            <option key={page.pageNumber} value={i}>
              {pageLabel(page)}
              {pageDiffers(page) ? " · differs" : ""}
            </option>
          ))}
        </select>
        <button type="button" aria-label="Next page" disabled={index >= pages.length - 1} onClick={() => onIndex(index + 1)} className={NAV_BUTTON}>
          <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5">
            <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="pl-1 text-xs text-muted tabular-nums">
          {index + 1} of {pages.length}
        </span>
      </div>
      <MetricPicker label="Viewport" options={VIEWPORTS} value={props.viewport} onChange={props.onViewport} />
      <div className="flex flex-wrap items-center gap-4 text-sm text-ink-2">
        {props.canShowOriginal && (
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={props.showOriginal} onChange={(event) => props.onShowOriginal(event.target.checked)} className="accent-accent" />
            Original page
          </label>
        )}
        <label className="inline-flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={props.sync} onChange={(event) => props.onSync(event.target.checked)} className="accent-accent" />
          Sync scroll
        </label>
      </div>
      <span className="text-xs text-muted max-xl:hidden">← → to change page</span>
    </div>
  )
}
