import { describe, expect, it } from "vitest"

import { importedReaderSettings } from "../reader-settings.js"

// #1198: the reader's default and locked settings travel in assets/config.json
// and must survive a re-import, so the next export keeps them.
describe("importedReaderSettings", () => {
  it("carries defaultSettings and lockedSettings into the book config's fields", () => {
    expect(importedReaderSettings({
      defaultSettings: {
        dockLayout: { width: "full", position: "bottom", align: "spread" },
        theme: "dark",
        iconSize: "md",
        reduceMotion: false,
      },
      lockedSettings: ["dockLayout", "theme", "iconSize", "reduceMotion"],
    })).toEqual({
      default_settings: {
        dock_layout: { width: "full", position: "bottom", align: "spread" },
        theme: "dark",
        icon_size: "md",
        reduce_motion: false,
      },
      locked_settings: ["dockLayout", "theme", "iconSize", "reduceMotion"],
    })
  })

  it("drops values the config doesn't accept instead of guessing or failing", () => {
    expect(importedReaderSettings({
      defaultSettings: {
        dockLayout: { width: "huge", position: "bottom" },
        theme: "sepia",
        iconSize: "lg",
        reduceMotion: "yes",
      },
      lockedSettings: ["theme", "fontSize", 3],
    })).toEqual({
      default_settings: { dock_layout: { position: "bottom" }, icon_size: "lg" },
      locked_settings: ["theme"],
    })
  })

  it("adds nothing when the export has no reader settings", () => {
    expect(importedReaderSettings({})).toEqual({})
    expect(importedReaderSettings(null)).toEqual({})
    expect(importedReaderSettings({ defaultSettings: "dark", lockedSettings: {} })).toEqual({})
  })
})
