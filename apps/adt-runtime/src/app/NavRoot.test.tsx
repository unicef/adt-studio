// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { translationsAtom } from "@/features/language/state/language.atoms"
import { SettingsTab } from "@/features/settings/components/SettingsTab"
import { appConfigAtom, type AppFeatures } from "@/shared/state/config.atoms"
import { NavRoot } from "./NavRoot"

vi.mock("@/features/audio/hooks/AudioPlayerContext", () => ({
  useAudioPlayerContext: () => ({
    isPlaying: false,
    hasItems: true,
    play: () => undefined,
    pause: () => undefined,
    togglePlayPause: () => undefined,
    playNext: () => undefined,
    playPrevious: () => undefined,
    stop: () => undefined,
    playAtIndex: () => undefined,
  }),
}))

vi.mock("@/features/dock/components/BottomDock", () => ({
  BottomDock: () => <div data-testid="bottom-dock" />,
}))

vi.mock("@/features/activity/components/ActivityDock", () => ({
  ActivityDock: () => <div data-testid="activity-dock" />,
}))

vi.mock("@/features/activity/components/ActivityConfetti", () => ({
  ActivityConfetti: () => <div data-testid="activity-confetti" />,
}))

vi.mock("@/features/dock/components/Dock", () => ({
  Dock: ({ children }: { children: ReactNode }) => (
    <div data-testid="dock">{children}</div>
  ),
}))

vi.mock("@/shared/lib/analytics", () => ({
  trackToggleEvent: vi.fn(),
}))

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})

function createRuntimeStore({
  kidsMode,
  features = {},
}: {
  kidsMode: boolean
  features?: AppFeatures
}) {
  const store = createStore()
  store.set(appConfigAtom, {
    languages: { available: ["en"], default: "en" },
    features: { ...features, kidsMode },
  })
  store.set(translationsAtom, {
    "settings-section-kids": "Kids",
    "kids-mode-label": "Kids mode",
  })
  return store
}

describe("NavRoot kids mode", () => {
  it("renders the bottom dock when kids mode is off", () => {
    const store = createRuntimeStore({ kidsMode: false })

    const { queryByTestId } = render(
      <Provider store={store}>
        <NavRoot />
      </Provider>,
    )

    expect(queryByTestId("bottom-dock")).not.toBeNull()
    expect(queryByTestId("kids-chrome")).toBeNull()
  })

  it("renders kids chrome instead of the bottom dock when kids mode is on", () => {
    const store = createRuntimeStore({ kidsMode: true })

    const { queryByTestId } = render(
      <Provider store={store}>
        <NavRoot />
      </Provider>,
    )

    expect(queryByTestId("kids-chrome")).not.toBeNull()
    expect(queryByTestId("bottom-dock")).toBeNull()
  })

  it("offers no reader-facing kids mode toggle in Settings", () => {
    const store = createRuntimeStore({ kidsMode: false })

    const { queryByTestId, queryByText } = render(
      <Provider store={store}>
        <NavRoot />
        <SettingsTab />
      </Provider>,
    )

    expect(queryByTestId("bottom-dock")).not.toBeNull()
    expect(queryByTestId("kids-chrome")).toBeNull()
    expect(queryByText("Kids")).toBeNull()
    expect(queryByText("Kids mode")).toBeNull()
  })
})
