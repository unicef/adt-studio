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
export type DockPosition = "top" | "bottom"
export type DockAlign = "spread" | "center"

export const dockWidthAtom = persistedStringAtom("dockWidth", "full")
export const dockPositionAtom = persistedStringAtom("dockPosition", "bottom")
export const dockAlignAtom = persistedStringAtom("dockAlign", "spread")

export type IconSize = "sm" | "md" | "lg"
export const iconSizeAtom = persistedStringAtom("iconSize", "md")
export const reduceMotionAtom = persistedBoolAtom("reduceMotion", false)

export type Theme = "light" | "dark" | "system"
export const themeAtom = persistedStringAtom("theme", "dark")

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
