import { atom } from "jotai"
import {
  resolveReaderUiLayout,
  type ReaderUi,
} from "@adt/types/reader-ui"
import {
  ephemeralAtom,
  persistedBoolAtom,
  persistedJsonAtom,
  persistedStringAtom,
} from "@/shared/state/persist"

export const easyReadModeAtom = persistedBoolAtom("easyReadMode", false)
export const eli5ModeAtom = persistedBoolAtom("eli5Mode", false)
export const signLanguageModeAtom = persistedBoolAtom("signLanguageMode", false)
export const glossaryModeAtom = persistedBoolAtom("glossaryMode", false)
export const syllablesModeAtom = persistedBoolAtom("syllablesMode", false)
export const stateModeAtom = persistedBoolAtom("stateMode", false) // "Auto-hide menus" master switch

export type DockWidth = "full" | "compact"
export type DockPosition = "top" | "bottom" | "left" | "right"
export type DockAlign = "spread" | "center"

export const dockWidthAtom = persistedStringAtom("dockWidth", "full")
export const dockPositionAtom = persistedStringAtom("dockPosition", "bottom")
export const dockAlignAtom = persistedStringAtom("dockAlign", "spread")

/**
 * The reader UI in effect: `config.json`'s `readerUi` on boot, replaced live by
 * the Studio Reader step while the book is previewed there.
 */
export const readerUiAtom = ephemeralAtom<ReaderUi | null>(null)

/** Panel (drawer vs popover) layout, every field resolved to a value. */
export const readerLayoutAtom = atom((get) => resolveReaderUiLayout(get(readerUiAtom)?.layout))

/**
 * The dock layout the reader actually gets. A book with a designed reader
 * layout uses it outright — the persisted picker values are ignored rather
 * than overwritten, so previewing a design in Studio never leaks into the
 * reader's own preferences for other books on the same origin.
 */
export const effectiveDockLayoutAtom = atom((get) => {
  const ui = get(readerUiAtom)
  if (ui?.layout) {
    const layout = resolveReaderUiLayout(ui.layout)
    return {
      position: layout.dock_position as DockPosition,
      width: layout.dock_width as DockWidth,
      align: layout.dock_align as DockAlign,
    }
  }
  return {
    position: get(dockPositionAtom) as DockPosition,
    width: get(dockWidthAtom) as DockWidth,
    align: get(dockAlignAtom) as DockAlign,
  }
})

export type IconSize = "sm" | "md" | "lg"
export const iconSizeAtom = persistedStringAtom("iconSize", "md")
export const reduceMotionAtom = persistedBoolAtom("reduceMotion", false)

export type Theme = "light" | "dark" | "system"
export const themeAtom = persistedStringAtom("theme", "dark")

/**
 * Reading the book at a narrower width, to see what a pupil on a phone sees.
 *
 * A reviewing tool, not a reading one: it exists so somebody on a laptop can check a layout
 * they do not own the device for. The control is desktop-only and the clamp never *widens*
 * the book, so a real phone is unaffected whatever this is set to.
 */
export type DevicePreview = "full" | "tablet" | "phone"

/** The Studio's own `DEVICE_WIDTHS`, restated: a reviewer checking a layout in the published
 *  book and an author checking it in the storyboard must be looking at the same width. */
export const DEVICE_PREVIEW_WIDTHS: Record<Exclude<DevicePreview, "full">, number> = {
  tablet: 768,
  phone: 375,
}

export const devicePreviewAtom = persistedStringAtom("devicePreview", "full")

export const dockReadyAtom = ephemeralAtom(false)
export const dockHiddenAtom = ephemeralAtom(false)

function readEmbedModeFromUrl(): boolean {
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).get("embed") === "1"
}

export const embedModeAtom = ephemeralAtom(readEmbedModeFromUrl())
export const sidebarOpenAtom = ephemeralAtom(false)
export const navOpenAtom = ephemeralAtom(false)
export const navScrollPositionAtom = ephemeralAtom(0)
export const notepadOpenAtom = ephemeralAtom(false)
export const eli5PopupOpenAtom = ephemeralAtom(false)
export const adminPopupOpenAtom = ephemeralAtom(false)
export const glossaryListOpenAtom = ephemeralAtom(false)
export const activeSidebarTabAtom = ephemeralAtom<"assistant" | "settings">("assistant")
export const activeGlossaryTabAtom = ephemeralAtom<"page" | "book">("page")
export const activeNavTabAtom = persistedStringAtom("navActiveTab", "toc")
/**
 * The Contents panel's search text. Kept outside the panel so it survives the
 * panel re-mounting after a page turn (#1135); cleared when the panel closes.
 */
export const tocSearchTermAtom = ephemeralAtom("")

export type DockMenuValue =
  | "toc"
  | "glossary"
  | "audio"
  | "language"
  | "settings"
  | "activities"
  | ""
export const dockMenuValueAtom = persistedStringAtom("dockMenuValue", "")
export const selectedGlossaryTermAtom = ephemeralAtom<string | null>(null)

export interface SlVideoPosition {
  x: number
  y: number
}
export const slVideoPositionAtom = persistedJsonAtom<SlVideoPosition | null>(
  "slVideoPosition",
  null
)
