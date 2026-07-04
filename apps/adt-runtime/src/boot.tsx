import "@/styles/globals.css"

import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { Provider as JotaiProvider, getDefaultStore } from "jotai"
import { ChromeRoot } from "@/app/ChromeRoot"
import { NavRoot } from "@/app/NavRoot"
import {
  bootRuntime,
  subscribeLanguageChanges,
  subscribePreviewSettings,
} from "@/app/lifecycle"
import { describeInitError, showErrorToast, showMainContent } from "@/shared/lib/errors"
import { subscribeChangeFeedback } from "@/shared/runtime/change-feedback"

const sharedStore = getDefaultStore()

declare global {
  interface Window {
    __adtRuntime?: {
      booted: boolean
      chromeRoot?: Root
      navRoot?: Root
      unsubscribe?: () => void
    }
  }
}

function ensureContainer(id: string): HTMLElement | null {
  const existing = document.getElementById(id)
  if (existing) return existing
  const el = document.createElement("div")
  el.id = id
  el.className = "relative z-10"
  document.body.appendChild(el)
  return el
}

function mount(): void {
  if (window.__adtRuntime?.booted) return
  const interfaceContainer = ensureContainer("interface-container")
  const navContainer = ensureContainer("nav-container")
  if (!interfaceContainer || !navContainer) return

  interfaceContainer.style.zIndex = "60"
  navContainer.style.zIndex = "50"

  const chromeRoot = createRoot(interfaceContainer)
  chromeRoot.render(
    <React.StrictMode>
      <JotaiProvider store={sharedStore}>
        <ChromeRoot />
      </JotaiProvider>
    </React.StrictMode>,
  )

  const navRoot = createRoot(navContainer)
  navRoot.render(
    <React.StrictMode>
      <JotaiProvider store={sharedStore}>
        <NavRoot />
      </JotaiProvider>
    </React.StrictMode>,
  )

  window.__adtRuntime = { booted: true, chromeRoot, navRoot }

  // Async boot — load config + translations + manifests, then signal
  // language-change subscription so the sidebar selector triggers reloads.
  void bootRuntime()
    .then(() => {
      const unsubLanguage = subscribeLanguageChanges()
      const unsubPreview = subscribePreviewSettings()
      const unsubFeedback = subscribeChangeFeedback()
      window.__adtRuntime!.unsubscribe = () => {
        unsubLanguage()
        unsubPreview()
        unsubFeedback()
      }
    })
    .catch((err) => {
      console.error("ADT runtime boot failed", err)
      showErrorToast(describeInitError(err))
      showMainContent()
    })
}

function teardown(): void {
  if (!window.__adtRuntime) return
  try {
    window.__adtRuntime.unsubscribe?.()
    window.__adtRuntime.chromeRoot?.unmount()
    window.__adtRuntime.navRoot?.unmount()
  } catch (err) {
    console.warn("ADT runtime teardown error", err)
  }
  window.__adtRuntime = undefined
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true })
  } else {
    mount()
  }
  window.addEventListener("beforeunload", teardown)
}
