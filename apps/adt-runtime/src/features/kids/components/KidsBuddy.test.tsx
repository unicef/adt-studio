// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  buddySpeechAtom,
  kidsBuddyAtom,
  kidsModeAtom,
  kidsPlayerNameAtom,
} from "@/features/kids/state/kids.atoms"
import { translationsAtom } from "@/features/language/state/language.atoms"
import { appConfigAtom } from "@/shared/state/config.atoms"
import { reduceMotionAtom } from "@/shared/state/ui.atoms"
import { KidsChrome } from "./KidsChrome"

const audioMock = vi.hoisted(() => ({
  player: {
    isPlaying: false,
    hasItems: true,
    play: vi.fn(),
    pause: vi.fn(),
    togglePlayPause: vi.fn(),
    playNext: vi.fn(),
    playPrevious: vi.fn(),
    stop: vi.fn(),
    playAtIndex: vi.fn(),
  },
}))

vi.mock("@/features/audio/hooks/AudioPlayerContext", () => ({
  useAudioPlayerContext: () => audioMock.player,
}))

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  vi.clearAllMocks()
  audioMock.player.isPlaying = false
  audioMock.player.hasItems = true
})

function createKidsStore({
  kidsMode = true,
  playerName = "",
  reduceMotion = false,
}: {
  kidsMode?: boolean
  playerName?: string
  reduceMotion?: boolean
} = {}) {
  const store = createStore()
  store.set(appConfigAtom, {
    languages: { available: ["en"], default: "en" },
    features: {},
  })
  store.set(kidsModeAtom, kidsMode)
  store.set(kidsPlayerNameAtom, playerName)
  store.set(reduceMotionAtom, reduceMotion)
  store.set(kidsBuddyAtom, {
    character: "robot",
    palette: "strawberry",
    backgroundColor: "#DBEAFE",
    name: "",
  })
  store.set(translationsAtom, {})
  return store
}

function renderKidsChrome(store = createKidsStore()) {
  return render(
    <Provider store={store}>
      <KidsChrome />
    </Provider>,
  )
}

describe("KidsBuddy", () => {
  it("renders the FAB when kids mode is on and hides it when kids mode is off", () => {
    const active = renderKidsChrome(createKidsStore({ kidsMode: true }))
    expect(active.queryByTestId("kids-buddy-fab")).not.toBeNull()

    active.unmount()

    const inactive = renderKidsChrome(createKidsStore({ kidsMode: false }))
    expect(inactive.queryByTestId("kids-buddy-fab")).toBeNull()
  })

  it("greets the player once per browser tab with the interpolated name", () => {
    const store = createKidsStore({ kidsMode: true, playerName: "Mina" })
    const first = renderKidsChrome(store)

    expect(first.queryByTestId("kids-speech-bubble")?.textContent).toBe(
      "Hi Mina! Tap me if you need help.",
    )

    fireEvent.click(first.getByTestId("kids-buddy-fab"))

    expect(store.get(buddySpeechAtom)).toBeNull()

    first.unmount()

    const second = renderKidsChrome(
      createKidsStore({ kidsMode: true, playerName: "Mina" }),
    )

    expect(second.queryByTestId("kids-speech-bubble")).toBeNull()
  })

  it("opens and closes the action panel from the FAB and Escape", () => {
    const { getByTestId, queryByTestId } = renderKidsChrome()
    const fab = getByTestId("kids-buddy-fab")

    expect(fab.getAttribute("aria-expanded")).toBe("false")
    expect(queryByTestId("kids-buddy-panel")).toBeNull()

    fireEvent.click(fab)

    expect(fab.getAttribute("aria-expanded")).toBe("true")
    expect(queryByTestId("kids-buddy-panel")).not.toBeNull()

    fireEvent.click(fab)

    expect(fab.getAttribute("aria-expanded")).toBe("false")
    expect(queryByTestId("kids-buddy-panel")).toBeNull()

    fireEvent.click(fab)
    fireEvent.keyDown(window, { key: "Escape" })

    expect(fab.getAttribute("aria-expanded")).toBe("false")
    expect(queryByTestId("kids-buddy-panel")).toBeNull()
  })

  it("reflects and controls the shared read-aloud player state", () => {
    const store = createKidsStore()
    const view = renderKidsChrome(store)
    fireEvent.click(view.getByTestId("kids-buddy-fab"))

    let action = view.getByText("Read to me").closest("button")
    expect(action?.hasAttribute("disabled")).toBe(false)
    fireEvent.click(action as HTMLButtonElement)
    expect(audioMock.player.togglePlayPause).toHaveBeenCalledTimes(1)

    audioMock.player.isPlaying = true
    view.rerender(
      <Provider store={store}>
        <KidsChrome />
      </Provider>,
    )

    action = view.getByText("Take a break").closest("button")
    expect(action?.hasAttribute("disabled")).toBe(false)

    audioMock.player.hasItems = false
    view.rerender(
      <Provider store={store}>
        <KidsChrome />
      </Provider>,
    )

    action = view.getByText("Take a break").closest("button")
    expect(action?.hasAttribute("disabled")).toBe(true)
  })

  it("omits the idle animation class when reduce motion is enabled", () => {
    const { getByTestId } = renderKidsChrome(
      createKidsStore({ reduceMotion: true }),
    )

    expect(getByTestId("kids-buddy-fab").className).not.toContain(
      "kids-buddy-idle",
    )
  })

  it("applies the selected buddy palette", () => {
    const { getByLabelText } = renderKidsChrome()
    const art = getByLabelText("Bolt")

    expect(art.parentElement?.getAttribute("style")).toContain(
      "--buddy-primary: #FF8BA7",
    )
  })
})
