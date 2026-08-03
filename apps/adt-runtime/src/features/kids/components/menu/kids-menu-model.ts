/**
 * Shared data model for the responsive buddy menu.
 *
 * Desktop list and mobile bottom-sheet presentations use the same actions,
 * labels and state. Presentation components never reach for jotai directly.
 */
import type { BuddyImageSet } from "@/features/kids/assets/buddy-images"

export type KidsMenuGroup = "reading" | "look" | "mine" | "footer"

export interface KidsMenuAction {
  /** Stable identity, independent of label/translation. */
  id:
    | "read"
    | "comfort"
    | "sign-language"
    | "easy-read"
    | "glossary"
    | "avatar"
    | "story-map"
    | "eli5"
    | "notes"
    | "language"
    | "meet-again"
  testId: string
  label: string
  /** Short label for space-constrained layouts (tiles, dials). */
  shortLabel: string
  icon: React.ReactNode
  group: KidsMenuGroup
  onSelect: () => void
  /** Toggles show an explicit On/Off state; plain actions do not. */
  toggle: boolean
  active: boolean
  disabled: boolean
}

export interface KidsMenuGroupInfo {
  id: KidsMenuGroup
  title: string
}

export interface KidsMenuModel {
  /** What the buddy is currently saying (confirmation or the idle prompt). */
  message: string
  buddyName: string
  buddyBackground: string
  buddyImages: BuddyImageSet
  actions: KidsMenuAction[]
  groups: KidsMenuGroupInfo[]
  speed: number
  setSpeed: (speed: number) => void
  speedLabels: { slow: string; normal: string; fast: string; group: string }
  showSpeed: boolean
  onLabel: string
  offLabel: string
  closeLabel: string
  regionLabel: string
  close: () => void
}

export interface KidsMenuProps {
  model: KidsMenuModel
  panelRef: React.RefObject<HTMLDivElement | null>
  panelCloseRef: React.RefObject<HTMLButtonElement | null>
  reduceMotion: boolean
}

export function actionsInGroup(model: KidsMenuModel, group: KidsMenuGroup) {
  return model.actions.filter((action) => action.group === group)
}
