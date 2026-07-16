// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import { createStore, Provider } from "jotai"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readAloudModeAtom } from "@/features/audio/state/audio.atoms"
import {
  kidsBuddyAtom,
  kidsOnboardingDoneAtom,
  kidsPlayerNameAtom,
} from "@/features/kids/state/kids.atoms"
import { currentLanguageAtom, translationsAtom } from "@/features/language/state/language.atoms"
import { appConfigAtom, type AppFeatures } from "@/shared/state/config.atoms"
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

const buddyVoiceMock = vi.hoisted(() => ({
  playBuddyLine: vi.fn().mockResolvedValue(true),
  playBuddyLineSequence: vi.fn().mockResolvedValue(undefined),
  stopBuddyLine: vi.fn(),
}))

vi.mock("@/features/audio/hooks/AudioPlayerContext", () => ({
  useAudioPlayerContext: () => audioMock.player,
}))

vi.mock("@/shared/lib/analytics", () => ({
  trackToggleEvent: vi.fn(),
}))

vi.mock("@/features/kids/lib/buddy-voice", () => ({
  playBuddyLine: buddyVoiceMock.playBuddyLine,
  playBuddyLineSequence: buddyVoiceMock.playBuddyLineSequence,
  stopBuddyLine: buddyVoiceMock.stopBuddyLine,
}))

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.clearAllTimers()
  vi.useRealTimers()
  localStorage.clear()
  sessionStorage.clear()
  vi.clearAllMocks()
})

const features: AppFeatures = {
  readAloud: true,
  signLanguage: true,
  easyRead: true,
  glossary: true,
  eli5: true,
  notepad: true,
  kidsMode: true,
}

function createKidsStore({
  kidsMode = true,
  onboardingDone = false,
  reduceMotion = false,
  featureOverrides = {},
}: {
  kidsMode?: boolean
  onboardingDone?: boolean
  reduceMotion?: boolean
  featureOverrides?: AppFeatures
} = {}) {
  const store = createStore()
  store.set(appConfigAtom, {
    languages: { available: ["en"], default: "en" },
    features: { ...features, ...featureOverrides, kidsMode },
  })
  store.set(kidsOnboardingDoneAtom, onboardingDone)
  store.set(kidsPlayerNameAtom, "")
  store.set(kidsBuddyAtom, {
    character: "dino",
    palette: "classic",
    backgroundColor: "#FEF3C7",
  })
  store.set(reduceMotionAtom, reduceMotion)
  store.set(translationsAtom, {})
  return store
}

function renderWithStore(ui: ReactNode, store = createKidsStore()) {
  return render(<Provider store={store}>{ui}</Provider>)
}

/** welcome -> reading-mode (first step after welcome, per the reference flow). */
function goToReadingModePage() {
  fireEvent.click(screen.getByText("Let's go!"))
}

/**
 * welcome -> [reading-mode] -> name. The "Keep going" click only applies
 * when the reading-mode step exists (readAloud feature on) — when the book
 * has no read-aloud feature, "Let's go!" lands directly on the name step.
 */
function goToNamePage() {
  goToReadingModePage()
  const keepGoing = screen.queryByText("Keep going")
  if (keepGoing) fireEvent.click(keepGoing)
}

function goToBuddyPage() {
  goToNamePage()
  fireEvent.click(screen.getByText("That's me!"))
}

function goToPickPage() {
  goToBuddyPage()
}

function goToFeaturePagesPage() {
  goToPickPage()
  fireEvent.click(screen.getByTestId("kids-onboarding-character-dino"))
  fireEvent.click(screen.getByText("This is my buddy"))
  act(() => vi.advanceTimersByTime(180))
}

describe("KidsOnboarding", () => {
  it("shows onboarding when kids mode is on and onboarding is not done", () => {
    renderWithStore(<KidsChrome />)

    expect(screen.queryByTestId("kids-onboarding")).not.toBeNull()
    expect(screen.queryByTestId("kids-buddy-fab")).toBeNull()
  })

  it("shows the buddy instead of onboarding when onboarding is done", () => {
    renderWithStore(<KidsChrome />, createKidsStore({ onboardingDone: true }))

    expect(screen.queryByTestId("kids-onboarding")).toBeNull()
    expect(screen.queryByTestId("kids-buddy-fab")).not.toBeNull()
  })

  it("keeps character art hidden until the pick page, then shows all 5 choices", () => {
    renderWithStore(<KidsChrome />)

    expect(screen.getByTestId("kids-onboarding-neutral-visual")).not.toBeNull()
    expect(screen.queryByTestId("kids-onboarding-character-dino")).toBeNull()
    expect(screen.queryByLabelText("Rex")).toBeNull()

    fireEvent.click(screen.getByText("Let's go!"))

    expect(screen.getByText("How do you want to read?")).not.toBeNull()
    expect(screen.getByTestId("kids-onboarding-neutral-visual")).not.toBeNull()
    expect(screen.queryByTestId("kids-onboarding-character-dino")).toBeNull()
    expect(screen.queryByLabelText("Rex")).toBeNull()

    fireEvent.click(screen.getByText("Keep going"))

    expect(screen.getByText("What should I call you?")).not.toBeNull()
    expect(screen.getByTestId("kids-onboarding-neutral-visual")).not.toBeNull()
    expect(screen.queryByTestId("kids-onboarding-character-dino")).toBeNull()
    expect(screen.queryByLabelText("Rex")).toBeNull()

    fireEvent.click(screen.getByText("That's me!"))

    expect(screen.getByText("Pick a reading buddy")).not.toBeNull()
    expect(screen.getByTestId("kids-onboarding-neutral-visual")).not.toBeNull()
    expect(screen.queryByTestId("kids-onboarding-buddy-hero")).toBeNull()
    expect(screen.getByTestId("kids-onboarding-character-dino")).not.toBeNull()
    expect(screen.getByTestId("kids-onboarding-character-robot")).not.toBeNull()
    expect(screen.getByTestId("kids-onboarding-character-bunny")).not.toBeNull()
    expect(screen.getByTestId("kids-onboarding-character-cat")).not.toBeNull()
    expect(screen.getByTestId("kids-onboarding-character-alien")).not.toBeNull()
  })

  it("shows the neutral visual in the pick hero before a buddy is selected", () => {
    renderWithStore(<KidsChrome />)
    goToPickPage()

    expect(screen.getByTestId("kids-onboarding-neutral-visual")).not.toBeNull()
    expect(screen.queryByTestId("kids-onboarding-buddy-hero")).toBeNull()
    expect(
      screen
        .getByTestId("kids-onboarding-character-dino")
        .getAttribute("aria-pressed"),
    ).toBe("false")
  })

  it("shows the clicked buddy in the pick hero preview", () => {
    renderWithStore(<KidsChrome />)
    goToPickPage()

    fireEvent.click(screen.getByTestId("kids-onboarding-character-robot"))

    const hero = screen.getByTestId("kids-onboarding-buddy-hero")
    expect(screen.queryByTestId("kids-onboarding-neutral-visual")).toBeNull()
    expect(within(hero).getByRole("img", { name: "Bolt" })).not.toBeNull()
    expect(
      screen
        .getByTestId("kids-onboarding-character-robot")
        .getAttribute("aria-pressed"),
    ).toBe("true")
  })

  it("advances from the buddy pick page after a brief confirm delay", () => {
    renderWithStore(<KidsChrome />)
    goToPickPage()

    fireEvent.click(screen.getByTestId("kids-onboarding-character-dino"))
    fireEvent.click(screen.getByText("This is my buddy"))

    expect(screen.queryByText("Turn the pages")).toBeNull()

    act(() => vi.advanceTimersByTime(179))
    expect(screen.queryByText("Turn the pages")).toBeNull()

    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByText("Turn the pages")).not.toBeNull()
  })

  it("steps through all 8 onboarding pages, writes the chosen buddy, and shows it in the reading view", () => {
    const store = createKidsStore()
    renderWithStore(<KidsChrome />, store)

    fireEvent.click(screen.getByText("Let's go!"))
    expect(screen.getByText("How do you want to read?")).not.toBeNull()
    fireEvent.click(screen.getByText("Keep going"))

    fireEvent.change(screen.getByTestId("kids-onboarding-player-name"), {
      target: { value: "Mina" },
    })
    fireEvent.click(screen.getByText("That's me!"))

    fireEvent.click(screen.getByTestId("kids-onboarding-character-cat"))
    fireEvent.click(screen.getByText("This is my buddy"))
    act(() => vi.advanceTimersByTime(180))

    expect(store.get(kidsPlayerNameAtom)).toBe("Mina")

    expect(screen.getByText("Turn the pages")).not.toBeNull()
    fireEvent.click(screen.getByText("Got it"))
    expect(screen.getByText("Ask me anytime")).not.toBeNull()
    fireEvent.click(screen.getByText("Got it"))
    expect(screen.getByText("Here's what I can do")).not.toBeNull()
    fireEvent.click(screen.getByText("Got it"))
    expect(screen.getByText("Ready to read, Mina?")).not.toBeNull()
    expect(screen.queryByTestId("kids-onboarding-neutral-visual")).toBeNull()
    expect(screen.getByRole("img", { name: "Luna" })).not.toBeNull()
    fireEvent.click(screen.getByTestId("kids-onboarding-finish"))

    expect(store.get(kidsBuddyAtom)).toEqual({
      character: "cat",
      backgroundColor: "#FEF3C7",
    })
    expect(store.get(kidsOnboardingDoneAtom)).toBe(true)
    expect(screen.queryByTestId("kids-onboarding")).toBeNull()

    const fab = screen.getByTestId("kids-buddy-fab")
    expect(fab.getAttribute("aria-label")).toBe("Talk to Luna")
    expect(fab.getAttribute("style")).toContain("background-color")
  })

  it("uses arrow keys for onboarding pages and intercepts them before book navigation", () => {
    const downstreamPageNav = vi.fn()
    renderWithStore(<KidsChrome />)
    document.addEventListener("keydown", downstreamPageNav)

    fireEvent.keyDown(document.body, { key: "ArrowRight" })

    expect(screen.getByText("How do you want to read?")).not.toBeNull()
    expect(downstreamPageNav).not.toHaveBeenCalled()

    fireEvent.keyDown(document.body, { key: "ArrowLeft" })

    expect(screen.getByText("Hi! Welcome to your reading adventure.")).not.toBeNull()

    document.removeEventListener("keydown", downstreamPageNav)
  })

  it("does not advance with arrow keys while focus is in the player name input", () => {
    renderWithStore(<KidsChrome />)
    goToNamePage()

    const input = screen.getByTestId("kids-onboarding-player-name")
    input.focus()
    fireEvent.keyDown(input, { key: "ArrowRight" })

    expect(screen.getByText("What should I call you?")).not.toBeNull()

    fireEvent.keyDown(input, { key: "Enter" })

    expect(screen.getByText("Pick a reading buddy")).not.toBeNull()
  })

  it("sets read-aloud mode from the reading mode page", () => {
    const store = createKidsStore()
    renderWithStore(<KidsChrome />, store)
    goToReadingModePage()

    fireEvent.click(screen.getByText("Read it to me"))

    expect(store.get(readAloudModeAtom)).toBe(true)
  })

  it("keeps the reading-mode choice even when the book has no read-aloud audio", () => {
    // The intro narrator rides the kids-voice track, so the read-to-me choice
    // is offered regardless of the book's own speech (readAloud) feature.
    const store = createKidsStore({
      featureOverrides: { readAloud: false },
    })
    renderWithStore(<KidsChrome />, store)
    fireEvent.click(screen.getByText("Let's go!"))

    expect(screen.getByText("How do you want to read?")).not.toBeNull()
  })

  it("lists only enabled abilities on the abilities page", () => {
    const store = createKidsStore({
      featureOverrides: {
        readAloud: false,
        easyRead: false,
        eli5: false,
        glossary: true,
      },
    })
    renderWithStore(<KidsChrome />, store)

    goToPickPage()
    fireEvent.click(screen.getByTestId("kids-onboarding-character-dino"))
    fireEvent.click(screen.getByText("This is my buddy"))
    act(() => vi.advanceTimersByTime(180))
    fireEvent.click(screen.getByText("Got it"))
    fireEvent.click(screen.getByText("Got it"))

    expect(screen.getByText("Here's what I can do")).not.toBeNull()
    expect(screen.getByText("Word helper")).not.toBeNull()
    expect(screen.getByText("Story map")).not.toBeNull()
    expect(screen.queryByText("Read to me")).toBeNull()
    expect(screen.queryByText("Reading speed")).toBeNull()
    expect(screen.queryByText("Easy read")).toBeNull()
    expect(screen.queryByText("Explain it")).toBeNull()
  })

  it("makes the abilities scroll region keyboard focusable with a label", () => {
    renderWithStore(<KidsChrome />)

    goToPickPage()
    fireEvent.click(screen.getByTestId("kids-onboarding-character-dino"))
    fireEvent.click(screen.getByText("This is my buddy"))
    act(() => vi.advanceTimersByTime(180))
    fireEvent.click(screen.getByText("Got it"))
    fireEvent.click(screen.getByText("Got it"))

    const region = screen.getByRole("region", {
      name: "What your buddy can do",
    })
    expect(region.getAttribute("tabindex")).toBe("0")
  })

  it("renders feature page keycap hints", () => {
    renderWithStore(<KidsChrome />)

    goToFeaturePagesPage()

    expect(screen.getByText("←")).not.toBeNull()
    expect(screen.getByText("→")).not.toBeNull()

    fireEvent.click(screen.getByText("Got it"))

    expect(screen.getByText("L")).not.toBeNull()
  })

  it("announces the current step position from the focused heading", () => {
    renderWithStore(<KidsChrome />)

    const heading = screen.getByRole("heading", {
      name: /Step 1 of 8\..*Hi! Welcome to your reading adventure\./,
    })
    expect(document.activeElement).toBe(heading)
    expect(screen.getByTestId("kids-onboarding-progress-dots")).not.toBeNull()
  })

  it("keeps step animation classes off when reduce motion is enabled", () => {
    renderWithStore(<KidsChrome />, createKidsStore({ reduceMotion: true }))

    const step = screen.getByTestId("kids-onboarding-step")
    expect(step.className).toContain("transition-none")
    expect(step.className).not.toContain("animate-kidsBuddyPop")
  })

  it("respects the packed roster from features.kidsBuddies", () => {
    renderWithStore(
      <KidsChrome />,
      createKidsStore({
        featureOverrides: { kidsBuddies: ["bunny", "cat"] },
      }),
    )
    goToPickPage()

    expect(screen.getByTestId("kids-onboarding-character-bunny")).not.toBeNull()
    expect(screen.getByTestId("kids-onboarding-character-cat")).not.toBeNull()
    expect(screen.queryByTestId("kids-onboarding-character-dino")).toBeNull()
    expect(screen.queryByTestId("kids-onboarding-character-robot")).toBeNull()
    expect(screen.queryByTestId("kids-onboarding-character-alien")).toBeNull()
  })

  it("puts the reading-mode choice right after welcome, before the name step", () => {
    renderWithStore(<KidsChrome />)

    expect(screen.getByText("Hi! Welcome to your reading adventure.")).not.toBeNull()

    fireEvent.click(screen.getByText("Let's go!"))

    expect(screen.getByText("How do you want to read?")).not.toBeNull()
    expect(screen.queryByText("What should I call you?")).toBeNull()

    fireEvent.click(screen.getByText("Keep going"))

    expect(screen.getByText("What should I call you?")).not.toBeNull()
  })

  it("stops narration and hides the pause button once reading it myself", () => {
    renderWithStore(<KidsChrome />)

    goToReadingModePage()
    // Reading out loud by default → the bottom pause control is present.
    expect(screen.getByTestId("kids-onboarding-narrator-play")).not.toBeNull()

    fireEvent.click(screen.getByText("I'll read it myself"))
    expect(buddyVoiceMock.stopBuddyLine).toHaveBeenCalled()
    expect(screen.queryByTestId("kids-onboarding-narrator-play")).toBeNull()

    const sequencesAfterChoice =
      buddyVoiceMock.playBuddyLineSequence.mock.calls.length
    fireEvent.click(screen.getByText("Keep going"))
    expect(screen.getByText("What should I call you?")).not.toBeNull()
    expect(screen.queryByTestId("kids-onboarding-narrator-play")).toBeNull()

    // No further narration once the child opted to read themselves.
    expect(buddyVoiceMock.playBuddyLineSequence.mock.calls.length).toBe(
      sequencesAfterChoice,
    )
  })

  it("reads the step's title then description once when reading aloud is on", () => {
    renderWithStore(<KidsChrome />)

    goToReadingModePage()
    fireEvent.click(screen.getByText("Read it to me"))

    expect(screen.getByTestId("kids-onboarding-narrator-play")).not.toBeNull()
    expect(buddyVoiceMock.playBuddyLineSequence).toHaveBeenCalledWith(
      "en",
      "narrator",
      ["kids-onboarding-read-title"],
    )

    fireEvent.click(screen.getByText("Keep going"))

    expect(screen.getByText("What should I call you?")).not.toBeNull()
    expect(screen.getByTestId("kids-onboarding-narrator-play")).not.toBeNull()
    expect(buddyVoiceMock.playBuddyLineSequence).toHaveBeenCalledWith(
      "en",
      "narrator",
      ["kids-onboarding-name-title"],
    )
  })

  it("narrates the welcome title and description on mount when reading aloud", () => {
    const store = createKidsStore()
    store.set(readAloudModeAtom, true)
    renderWithStore(<KidsChrome />, store)

    expect(buddyVoiceMock.playBuddyLineSequence).toHaveBeenCalledWith(
      "en",
      "narrator",
      ["kids-onboarding-welcome-title", "kids-onboarding-welcome-copy"],
    )
    expect(screen.getByTestId("kids-onboarding-narrator-play")).not.toBeNull()
  })

  it("pauses then resumes the narration from the bottom control", () => {
    const store = createKidsStore()
    store.set(readAloudModeAtom, true)
    renderWithStore(<KidsChrome />, store)

    const button = screen.getByTestId("kids-onboarding-narrator-play")
    // Starts reading out loud (pressed = playing).
    expect(button.getAttribute("aria-pressed")).toBe("true")

    buddyVoiceMock.playBuddyLineSequence.mockClear()
    fireEvent.click(button) // pause
    expect(button.getAttribute("aria-pressed")).toBe("false")
    expect(buddyVoiceMock.stopBuddyLine).toHaveBeenCalled()
    expect(buddyVoiceMock.playBuddyLineSequence).not.toHaveBeenCalled()

    fireEvent.click(button) // resume → replays the current step's lines
    expect(buddyVoiceMock.playBuddyLineSequence).toHaveBeenCalledWith(
      "en",
      "narrator",
      ["kids-onboarding-welcome-title", "kids-onboarding-welcome-copy"],
    )
  })

  it("hides the narrator play button on the final start step (no narrator line)", () => {
    const store = createKidsStore()
    store.set(readAloudModeAtom, true)
    renderWithStore(<KidsChrome />, store)

    goToNamePage()
    fireEvent.change(screen.getByTestId("kids-onboarding-player-name"), {
      target: { value: "Mina" },
    })
    fireEvent.click(screen.getByText("That's me!"))
    fireEvent.click(screen.getByTestId("kids-onboarding-character-dino"))
    fireEvent.click(screen.getByText("This is my buddy"))
    act(() => vi.advanceTimersByTime(180))
    fireEvent.click(screen.getByText("Got it"))
    fireEvent.click(screen.getByText("Got it"))
    fireEvent.click(screen.getByText("Got it"))

    expect(screen.getByText("Ready to read, Mina?")).not.toBeNull()
    expect(screen.queryByTestId("kids-onboarding-narrator-play")).toBeNull()
  })
})
