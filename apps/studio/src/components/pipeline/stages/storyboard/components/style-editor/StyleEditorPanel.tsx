import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  Box,
  Construction,
  Eye,
  EyeOff,
  Film,
  Image as ImageIcon,
  List,
  MousePointerClick,
  Trash2,
  Type,
  X,
  type LucideIcon,
} from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import type { StyleEditorElementProps } from "./ElementActions"
import {
  type ElementType,
  getVisibleSections,
  inferElementType,
} from "./element-types"
import { SECTION_COMPONENTS } from "./sections"
import { AdvancedSection } from "./sections/Advanced"
import { ImageActionsSection } from "./sections/ImageActions"
import { TextRoleSection } from "./sections/TextRole"
import { ElementProvider } from "./element-context"
import type { DeviceView } from "./device-breakpoint"
import type { ComputedTypographyStyles } from "../BookPreviewFrame"

// eslint-disable-next-line lingui/no-unlocalized-strings -- HTML attribute identifier shown verbatim
const DATA_ID_PREFIX = `data-id="`
const DATA_ID_SUFFIX = `"`

interface StyleEditorPanelProps {
  open: boolean
  onClose: () => void
  selectedDataId: string | null
  selectedTagName: string | null
  elementClasses: string[] | null
  elementProps: StyleEditorElementProps | null
  onClassesChange: (dataId: string, classes: string[]) => void
  deviceView: DeviceView
  /** Snapshot of the iframe element's getComputedStyle for the inheritable
   *  typography properties — used as inspector defaults so the fields show
   *  the actually-rendered value when no explicit class is set. */
  computedTypography?: ComputedTypographyStyles | null
  /** Fixed-layout pages style elements via inline CSS, not Tailwind classes,
   *  so the class-based controls have no effect. When true, the class sections
   *  (and Advanced) are hidden; image actions and prune/delete remain. */
  isFixedLayout?: boolean
}

export function StyleEditorPanel({
  open,
  onClose,
  selectedDataId,
  selectedTagName,
  elementClasses,
  elementProps,
  onClassesChange,
  deviceView,
  computedTypography,
  isFixedLayout = false,
}: StyleEditorPanelProps) {
  const { t } = useLingui()

  // Retain the last selection while sliding out, so content doesn't blank
  // during the closing animation.
  const [retained, setRetained] = useState({
    dataId: selectedDataId,
    tagName: selectedTagName,
    classes: elementClasses,
    elementProps,
  })

  useEffect(() => {
    if (selectedDataId) {
      setRetained({
        dataId: selectedDataId,
        tagName: selectedTagName,
        classes: elementClasses,
        elementProps,
      })
    }
  }, [selectedDataId, selectedTagName, elementClasses, elementProps])

  const displayDataId = selectedDataId ?? retained.dataId
  const displayTagName = selectedDataId ? selectedTagName : retained.tagName
  const displayClasses = selectedDataId ? elementClasses : retained.classes
  const displayElementProps = selectedDataId ? elementProps : retained.elementProps

  const elementType = useMemo<ElementType | null>(() => {
    if (!displayElementProps) return null
    return inferElementType({
      isImage: displayElementProps.isImage,
      isContainer: displayElementProps.isContainer,
      tagName: displayTagName ?? undefined,
    })
  }, [displayElementProps, displayTagName])

  return (
    <aside
      aria-label={t`Element style editor`}
      aria-hidden={!open}
      className={cn(
        "h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out",
        open ? "w-[300px]" : "w-0"
      )}
    >
      <div className="w-[300px] h-full flex flex-col bg-background border-l">
      <header className="flex items-center gap-3 px-4 py-3 border-b">
        <ElementIconBadge elementType={elementType} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground truncate leading-tight">
            <ElementLabel elementType={elementType} tagName={displayTagName} />
          </div>
          {displayDataId ? (
            <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
              <span className="text-[11px] font-mono text-muted-foreground/80 truncate leading-tight">
                {DATA_ID_PREFIX}
                {displayDataId}
                {DATA_ID_SUFFIX}
              </span>
              {deviceView !== "desktop" ? (
                <span
                  className="shrink-0 inline-flex items-center rounded bg-violet-100/70 px-1 py-0 text-[9px] font-mono font-medium text-violet-700 leading-[14px]"
                  title={t`Edits go to this Tailwind variant prefix`}
                >
                  {deviceView === "tablet" ? "max-lg:" : "max-sm:"}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {displayElementProps?.onTogglePrune && displayDataId ? (
            <button
              type="button"
              onClick={() => displayElementProps.onTogglePrune?.(displayDataId)}
              className="p-1.5 rounded hover:bg-accent transition-colors cursor-pointer"
              aria-label={displayElementProps.isPruned ? t`Restore element` : t`Prune element`}
              title={displayElementProps.isPruned ? t`Restore element` : t`Prune element`}
              tabIndex={open ? 0 : -1}
            >
              {displayElementProps.isPruned ? (
                <EyeOff className="h-3.5 w-3.5 text-destructive" />
              ) : (
                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          ) : null}
          {displayElementProps?.onDelete && displayDataId ? (
            <button
              type="button"
              onClick={() => displayElementProps.onDelete?.(displayDataId)}
              className="p-1.5 rounded hover:bg-red-50 transition-colors cursor-pointer group"
              aria-label={t`Delete element`}
              title={t`Delete element`}
              tabIndex={open ? 0 : -1}
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground group-hover:text-red-600" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-accent transition-colors cursor-pointer"
            aria-label={t`Close style editor`}
            tabIndex={open ? 0 : -1}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-4 scrollbar-hide">
        {displayDataId ? (
          <StyleEditorBody
            dataId={displayDataId}
            classes={displayClasses ?? []}
            elementType={elementType}
            elementProps={displayElementProps}
            onClassesChange={onClassesChange}
            deviceView={deviceView}
            computedTypography={computedTypography ?? null}
            isFixedLayout={isFixedLayout}
          />
        ) : null}
      </div>
      </div>
    </aside>
  )
}

const ELEMENT_ICONS: Record<ElementType, LucideIcon> = {
  text: Type,
  image: ImageIcon,
  container: Box,
  interactive: MousePointerClick,
  list: List,
  media: Film,
}

function ElementIconBadge({ elementType }: { elementType: ElementType | null }) {
  const Icon = elementType ? ELEMENT_ICONS[elementType] : Box
  return (
    <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
      <Icon className="h-[18px] w-[18px] text-violet-600" />
    </div>
  )
}

function ElementLabel({
  elementType,
  tagName,
}: {
  elementType: ElementType | null
  tagName: string | null
}): ReactNode {
  if (elementType === "image") return <Trans>Image</Trans>
  if (elementType === "list") return <Trans>List</Trans>
  if (elementType === "media") return <Trans>Media</Trans>
  if (elementType === "interactive") {
    if (tagName === "a") return <Trans>Link</Trans>
    if (tagName === "button") return <Trans>Button</Trans>
    if (tagName === "input" || tagName === "textarea") return <Trans>Input</Trans>
    return <Trans>Interactive</Trans>
  }
  if (elementType === "container") {
    if (tagName === "section") return <Trans>Section</Trans>
    if (tagName === "article") return <Trans>Article</Trans>
    if (tagName === "aside") return <Trans>Aside</Trans>
    if (tagName === "nav") return <Trans>Nav</Trans>
    return <Trans>Container</Trans>
  }
  // text
  if (tagName) {
    if (/^h[1-6]$/.test(tagName)) return <Trans>Heading</Trans>
    if (tagName === "p") return <Trans>Paragraph</Trans>
    if (tagName === "blockquote") return <Trans>Quote</Trans>
    if (tagName === "figcaption") return <Trans>Caption</Trans>
  }
  return <Trans>Text</Trans>
}

interface StyleEditorBodyProps {
  dataId: string
  classes: string[]
  elementType: ElementType | null
  elementProps: StyleEditorElementProps | null
  onClassesChange: (dataId: string, classes: string[]) => void
  deviceView: DeviceView
  computedTypography: ComputedTypographyStyles | null
  isFixedLayout: boolean
}

function StyleEditorBody({
  dataId,
  classes,
  elementType,
  elementProps,
  onClassesChange,
  deviceView,
  computedTypography,
  isFixedLayout,
}: StyleEditorBodyProps) {
  const visibleSections = useMemo(
    () => (elementType ? getVisibleSections(elementType) : []),
    [elementType]
  )

  return (
    <ElementProvider
      value={{
        dataId,
        classes,
        onClassesChange,
        deviceView,
        computedStyles: computedTypography ?? undefined,
      }}
    >
      <div className="flex flex-col min-h-full">
        {elementProps?.isImage ? (
          <ImageActionsSection dataId={dataId} elementProps={elementProps} />
        ) : null}
        {elementType === "text" ? (
          <TextRoleSection dataId={dataId} elementProps={elementProps} />
        ) : null}
        {isFixedLayout ? (
          <div className="flex flex-1 items-center justify-center">
            <FixedLayoutNotice />
          </div>
        ) : (
          <>
            {visibleSections.map((key) => {
              const SectionComponent = SECTION_COMPONENTS[key]
              return <SectionComponent key={key} />
            })}
            <AdvancedSection />
          </>
        )}
      </div>
    </ElementProvider>
  )
}

/** Centered placeholder shown in place of the class-based style controls on
 *  fixed-layout pages, where styling is driven by inline CSS rather than
 *  Tailwind classes. Signals the feature is in development. */
function FixedLayoutNotice() {
  return (
    <div className="flex flex-col items-center gap-3 px-2 py-4 text-center animate-in fade-in slide-in-from-bottom-1 duration-300">
      <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-violet-50">
        <Construction className="h-6 w-6 text-violet-500" />
        <span className="absolute inset-0 rounded-full ring-1 ring-inset ring-violet-200/70" />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold text-foreground">
          <Trans>Style editing coming soon</Trans>
        </p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          <Trans>
            Visual style editing isn't available for fixed-layout pages yet. You
            can still edit text inline, swap or crop images, and prune elements.
          </Trans>
        </p>
      </div>
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
        <Trans>In development</Trans>
      </span>
    </div>
  )
}

