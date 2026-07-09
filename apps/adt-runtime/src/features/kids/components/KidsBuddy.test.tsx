// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, describe, expect, it, vi } from "vitest"
import { audioSpeedAtom } from "@/features/audio/state/audio.atoms"
import {
  currentPageNumberAtom,
  currentSectionIdAtom,
  pagesAtom,
  tocAtom,
} from "@/features/navigation/state/nav.atoms"
import {
  buddySpeechAtom,
  kidsBuddyAtom,
  kidsLastSpotAtom,
  kidsModeAtom,
  kidsPlayerNameAtom,
} from "@/features/kids/state/kids.atoms"
import {
  currentLanguageAtom,
  translationsAtom,
} from "@/features/language/state/language.atoms"
import { appConfigAtom, type AppFeatures } from "@/shared/state/config.atoms"
import {
  easyReadModeAtom,
  glossaryModeAtom,
  reduceMotionAtom,
  signLanguageModeAtom,
} from "@/shared/state/ui.atoms"
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

const navMock = vi.hoisted(() => ({
  navigateToHref: vi.fn(),
}))

vi.mock("@/features/audio/hooks/AudioPlayerContext", () => ({
  useAudioPlayerContext: () => audioMock.player,
}))

vi.mock("@/features/navigation/lib/page-navigation", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/navigation/lib/page-navigation")>()
  return {
    ...actual,
    navigateToHref: navMock.navigateToHref,
  }
})

vi.mock("@/shared/lib/analytics", () => ({
  trackToggleEvent: vi.fn(),
}))

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  vi.clearAllMocks()
  audioMock.player.isPlaying = false
  audioMock.player.hasItems = true
})

const allBuddyFeatures: AppFeatures = {
  readAloud: true,
  signLanguage: true,
  easyRead: true,
  glossary: true,
  eli5: true,
  notepad: true,
}

function createKidsStore({
  kidsMode = true,
  playerName = "",
  reduceMotion = false,
  features = allBuddyFeatures,
  languages = ["en"],
  currentSectionId = "s1",
}: {
  kidsMode?: boolean
  playerName?: string
  reduceMotion?: boolean
  features?: AppFeatures
  languages?: string[]
  currentSectionId?: string
} = {}) {
  const store = createStore()
  store.set(appConfigAtom, {
    languages: { available: languages, default: languages[0] ?? "en" },
    features,
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
  store.set(pagesAtom, [
    { section_id: "s1", href: "one.html", page_number: 1 },
    { section_id: "s2", href: "two.html", page_number: 2 },
    { section_id: "s3", href: "three.html", page_number: 3 },
  ])
  store.set(tocAtom, [
    {
      section_id: "s1",
      href: "one.html",
      title: "Start",
      chapter_id: "c1",
      level: 1,
    },
    {
      section_id: "s2",
      href: "two.html",
      title: "Middle",
      chapter_id: "c1",
      level: 1,
    },
  ])
  store.set(currentSectionIdAtom, currentSectionId)
  store.set(currentPageNumberAtom, currentSectionId === "s3" ? 3 : 1)
  return store
}

function renderKidsChrome(store = createKidsStore()) {
  return render(
    <Provider store={store}>
      <KidsChrome />
    </Provider>,
  )
}

function openBuddy() {
  fireEvent.click(screen.getByTestId("kids-buddy-fab"))
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

    const bubble = first.queryByTestId("kids-speech-bubble")
    expect(bubble?.textContent).toBe("Hi Mina! Tap me if you need help.")
    expect(bubble?.className).toContain("bottom-[7.25rem]")

    fireEvent.click(first.getByTestId("kids-buddy-fab"))

    expect(store.get(buddySpeechAtom)).toBeNull()

    first.unmount()

    const second = renderKidsChrome(
      createKidsStore({ kidsMode: true, playerName: "Mina" }),
    )

    expect(second.queryByTestId("kids-speech-bubble")).toBeNull()
  })

  it("shows the default open-panel prompt with the player name", () => {
    renderKidsChrome(createKidsStore({ playerName: "Mina" }))
    openBuddy()

    expect(screen.queryByTestId("kids-speech-bubble")).toBeNull()
    expect(screen.getByTestId("kids-buddy-panel-message").textContent).toBe(
      "Hi Mina! What would you like me to do?",
    )
  })

  it("shows the generic open-panel prompt when the player name is missing", () => {
    renderKidsChrome(createKidsStore({ playerName: "" }))
    openBuddy()

    expect(screen.getByTestId("kids-buddy-panel-message").textContent).toBe(
      "What would you like me to do?",
    )
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

  it("closes the action panel from the header close button", () => {
    const { getByLabelText, getByTestId, queryByTestId } = renderKidsChrome()

    openBuddy()
    fireEvent.click(getByLabelText("Close"))

    expect(getByTestId("kids-buddy-fab").getAttribute("aria-expanded")).toBe(
      "false",
    )
    expect(queryByTestId("kids-buddy-panel")).toBeNull()
  })

  it("renders all enabled buddy actions", () => {
    renderKidsChrome(createKidsStore({ languages: ["en", "es"] }))
    openBuddy()

    expect(screen.queryByTestId("kids-action-read")).not.toBeNull()
    expect(screen.queryByTestId("kids-action-speed")).not.toBeNull()
    expect(screen.queryByTestId("kids-action-sign-language")).not.toBeNull()
    expect(screen.queryByTestId("kids-action-easy-read")).not.toBeNull()
    expect(screen.queryByTestId("kids-action-glossary")).not.toBeNull()
    expect(screen.queryByTestId("kids-action-eli5")).not.toBeNull()
    expect(screen.queryByTestId("kids-action-notes")).not.toBeNull()
    expect(screen.queryByTestId("kids-action-language")).not.toBeNull()
    expect(screen.queryByTestId("kids-action-story-map")).not.toBeNull()
  })

  it("omits flag-disabled buddy actions and hides language when only one language exists", () => {
    renderKidsChrome(
      createKidsStore({
        features: { readAloud: true, glossary: false, signLanguage: false },
        languages: ["en"],
      }),
    )
    openBuddy()

    expect(screen.queryByTestId("kids-action-read")).not.toBeNull()
    expect(screen.queryByTestId("kids-action-speed")).not.toBeNull()
    expect(screen.queryByTestId("kids-action-sign-language")).toBeNull()
    expect(screen.queryByTestId("kids-action-easy-read")).toBeNull()
    expect(screen.queryByTestId("kids-action-glossary")).toBeNull()
    expect(screen.queryByTestId("kids-action-eli5")).toBeNull()
    expect(screen.queryByTestId("kids-action-notes")).toBeNull()
    expect(screen.queryByTestId("kids-action-language")).toBeNull()
    expect(screen.queryByTestId("kids-action-story-map")).not.toBeNull()
  })

  it("reflects and controls the shared read-aloud player state", () => {
    const store = createKidsStore()
    const view = renderKidsChrome(store)
    openBuddy()

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

  it("cycles reading speed and says confirmations", () => {
    const store = createKidsStore()
    store.set(audioSpeedAtom, 0.75)
    renderKidsChrome(store)
    openBuddy()

    const speedButton = screen.getByTestId("kids-action-speed")
    fireEvent.click(speedButton)
    expect(store.get(audioSpeedAtom)).toBe(1)
    expect(store.get(buddySpeechAtom)).toBe("Okay! Now I read at normal speed.")

    fireEvent.click(speedButton)
    expect(store.get(audioSpeedAtom)).toBe(1.3)
    expect(store.get(buddySpeechAtom)).toBe(
      "Okay! Now I read quickly, like a rabbit.",
    )

    fireEvent.click(speedButton)
    expect(store.get(audioSpeedAtom)).toBe(0.75)
    expect(store.get(buddySpeechAtom)).toBe(
      "Okay! Now I read slowly, like a turtle.",
    )
  })

  it("toggles shared mode atoms and says confirmations", () => {
    const store = createKidsStore()
    renderKidsChrome(store)
    openBuddy()

    fireEvent.click(screen.getByTestId("kids-action-sign-language"))
    expect(store.get(signLanguageModeAtom)).toBe(true)
    expect(store.get(buddySpeechAtom)).toBe("Sign language is on!")

    fireEvent.click(screen.getByTestId("kids-action-easy-read"))
    expect(store.get(easyReadModeAtom)).toBe(true)
    expect(store.get(buddySpeechAtom)).toBe("Big letters are on!")

    fireEvent.click(screen.getByTestId("kids-action-glossary"))
    expect(store.get(glossaryModeAtom)).toBe(true)
    expect(store.get(buddySpeechAtom)).toBe("Word helper is on!")
  })

  it("shows confirmation speech in the open panel header without a separate bubble", () => {
    const store = createKidsStore()
    renderKidsChrome(store)
    openBuddy()

    fireEvent.click(screen.getByTestId("kids-action-easy-read"))

    expect(screen.getByTestId("kids-buddy-panel-message").textContent).toBe(
      "Big letters are on!",
    )
    expect(screen.queryByTestId("kids-speech-bubble")).toBeNull()
    expect(screen.queryByTestId("kids-buddy-panel")).not.toBeNull()
    expect(
      screen.getByTestId("kids-action-easy-read").getAttribute("aria-pressed"),
    ).toBe("true")
  })

  it("lists story sections and navigates when a section is tapped", async () => {
    renderKidsChrome()
    openBuddy()

    fireEvent.click(screen.getByTestId("kids-action-story-map"))

    expect(await screen.findByText("Start")).not.toBeNull()
    fireEvent.click(await screen.findByText("Middle"))

    expect(navMock.navigateToHref).toHaveBeenCalledWith("two.html")
  })

  it("lists configured languages and switches through the shared language atom", async () => {
    const store = createKidsStore({ languages: ["en", "es"] })
    renderKidsChrome(store)
    openBuddy()

    fireEvent.click(screen.getByTestId("kids-action-language"))
    fireEvent.click(await screen.findByText("Español"))

    expect(store.get(currentLanguageAtom)).toBe("es")
    expect(store.get(buddySpeechAtom)).toBe("Okay, Español is on!")
  })

  it("shows the resume chip when the saved spot differs and navigates back", () => {
    const store = createKidsStore({ currentSectionId: "s1" })
    store.set(kidsLastSpotAtom, {
      sectionId: "s2",
      href: "two.html",
      page: 2,
    })
    renderKidsChrome(store)

    expect(screen.queryByTestId("kids-resume-chip")).not.toBeNull()
    fireEvent.click(screen.getByText("Take me back to where I was"))

    expect(navMock.navigateToHref).toHaveBeenCalledWith("two.html")
  })

  it("hides previous and next arrows at the first and last page", () => {
    const first = renderKidsChrome(createKidsStore({ currentSectionId: "s1" }))
    expect(first.queryByTestId("kids-page-arrow-left")).toBeNull()
    expect(first.queryByTestId("kids-page-arrow-right")).not.toBeNull()

    first.unmount()

    const last = renderKidsChrome(createKidsStore({ currentSectionId: "s3" }))
    expect(last.queryByTestId("kids-page-arrow-left")).not.toBeNull()
    expect(last.queryByTestId("kids-page-arrow-right")).toBeNull()
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
