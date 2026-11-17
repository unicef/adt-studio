import type { ReactNode } from "react"
import { useLingui } from "@lingui/react"
import { useLingui as useLinguiMacro } from "@lingui/react/macro"
import { READER_COLOR_TOKENS, type ReaderColorToken } from "@adt/types"
import type { ReaderUiDraft } from "../hooks/use-reader-ui-draft"
import { READER_TOKEN_GROUPS, READER_TOKEN_LABELS } from "../lib/token-groups"
import { SEARCH_WORDS, TOKEN_SEARCH_WORDS, type SearchWord } from "../lib/search"
import {
  ButtonStyleField,
  DockPositionField,
  DockSizeField,
  DockToolsField,
  DrawerBehaviorField,
  DrawerSideField,
  PanelStyleField,
} from "./LayoutControls"
import { ShapeControls } from "./ShapeControls"
import { ThemePresetGrid } from "./PresetGrids"

export type InspectorSection = "theme" | "layout" | "colours" | "shape"

export interface InspectorField {
  id: string
  section: InspectorSection
  /** Everything the search matches against: label, synonyms, token id. */
  searchText: string
  /** Set for colour fields; rendered as a token row in the current mode. */
  token?: ReaderColorToken
  render?: () => ReactNode
}

/**
 * Every setting of the inspector as a searchable field. The sections render
 * the same components in their usual arrangement; search renders the matching
 * ones on their own.
 */
export function useInspectorFields(draft: ReaderUiDraft): InspectorField[] {
  const { i18n } = useLingui()
  const { t } = useLinguiMacro()
  const words = (...keys: SearchWord[]) => keys.map((key) => i18n._(SEARCH_WORDS[key])).join(" ")
  const drawer = draft.layout.panel_style === "drawer"

  const layout: Array<{ id: string; label: string; keys: SearchWord[]; render: () => ReactNode; visible?: boolean }> = [
    { id: "dock_position", label: t`Dock position`, keys: ["dock", "toolbar", "position", "layout"], render: () => <DockPositionField draft={draft} /> },
    { id: "dock_width", label: t`Dock size`, keys: ["dock", "toolbar", "size"], render: () => <DockSizeField draft={draft} /> },
    { id: "dock_align", label: t`Tools`, keys: ["dock", "toolbar", "button"], render: () => <DockToolsField draft={draft} /> },
    { id: "button_style", label: t`Buttons`, keys: ["button", "icon", "label", "dock"], render: () => <ButtonStyleField draft={draft} /> },
    { id: "panel_style", label: t`Panels (contents, glossary, language, settings)`, keys: ["panel", "drawer", "sidebar", "menu"], render: () => <PanelStyleField draft={draft} /> },
    { id: "panel_side", label: t`Drawer side`, keys: ["panel", "drawer", "sidebar", "position"], render: () => <DrawerSideField draft={draft} />, visible: drawer },
    { id: "panel_behavior", label: t`When open`, keys: ["panel", "drawer", "sidebar"], render: () => <DrawerBehaviorField draft={draft} />, visible: drawer },
  ]

  const groupOf = (token: ReaderColorToken) => READER_TOKEN_GROUPS.find((group) => group.tokens.includes(token))

  return [
    {
      id: "theme",
      section: "theme",
      searchText: `${t`Theme`} ${words("theme", "palette", "colour", "color")}`,
      render: () => <ThemePresetGrid draft={draft} columns={3} size="sm" />,
    },
    ...layout
      .filter((field) => field.visible !== false)
      .map((field) => ({
        id: field.id,
        section: "layout" as const,
        searchText: `${field.label} ${words(...field.keys)}`,
        render: field.render,
      })),
    ...READER_COLOR_TOKENS.map((token) => {
      const group = groupOf(token)
      return {
        id: `colour:${token}`,
        section: "colours" as const,
        token,
        searchText: [
          i18n._(READER_TOKEN_LABELS[token]),
          token,
          group ? i18n._(group.label) : "",
          words("colour", "color", ...TOKEN_SEARCH_WORDS[token]),
        ].join(" "),
      }
    }),
    {
      id: "radius",
      section: "shape",
      searchText: `${t`Corner radius`} ${words("radius", "corner", "border", "button")}`,
      render: () => <ShapeControls draft={draft} part="radius" />,
    },
    {
      id: "font",
      section: "shape",
      searchText: `${t`Typeface`} ${words("font", "text")}`,
      render: () => <ShapeControls draft={draft} part="font" />,
    },
  ]
}
