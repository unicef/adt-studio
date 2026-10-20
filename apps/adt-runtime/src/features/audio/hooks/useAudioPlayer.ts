import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { useCallback, useEffect, useEffectEvent, useMemo, useRef } from "react"
import {
  activeMediaAtom,
  audioSpeedAtom,
  audioVolumeAtom,
  autoplayModeAtom,
  currentAudioIndexAtom,
  describeImagesModeAtom,
  isPlayingAtom,
  readAloudModeAtom,
  timecodeMapsAtom,
  wordHighlightModeAtom,
} from "@/features/audio/state/audio.atoms"
import {
  audioFilesAtom,
  audioLanguageAtom,
  audioVoicesAtom,
  currentLanguageAtom,
  narratorVoiceAtom,
  type NarratorVoiceSlot,
  speechTextsAtom,
  translationsAtom,
} from "@/features/language/state/language.atoms"
import { pageEpochAtom } from "@/features/navigation/state/nav.atoms"
import { easyReadModeAtom } from "@/shared/state/ui.atoms"
import {
  clearBlockHighlight,
  clearWordHighlight,
  elementSupportsWordHighlight,
  findDisplayWordIndicesAtTime,
  mapWordTimestampsToDisplayWords,
  resolveWordTimestamps,
  setBlockHighlight,
  setWordHighlights,
  type DisplayWordTimestamp,
  unwrapWordsForElement,
  wrapWordsForElement,
} from "@/features/audio/lib/word-highlight"

interface PlayableItem {
  el: HTMLElement
  id: string
  filename: string
  useBlockWhenMissingTimecodes?: boolean
  speechText?: string
}

const EASY_READ_AUDIO_EXCLUDED_SELECTOR =
  ".word-card, [data-activity-item], nav, .nav__list, button, input, textarea, select, option"

function resolvePlayableAudio(
  el: HTMLElement,
  id: string,
  audioFiles: Record<string, string>,
  translations: Record<string, string>,
  speechTexts: Record<string, string>,
  easyReadMode: boolean,
): Omit<PlayableItem, "el"> | null {
  const sourceFilename = audioFiles[id]
  if (!easyReadMode) {
    return sourceFilename
      ? {
          id,
          filename: sourceFilename,
          useBlockWhenMissingTimecodes: false,
          speechText: speechTexts[id],
        }
      : null
  }

  const isHeader = /^h[1-6]$/.test(el.tagName.toLowerCase())
  const isExcluded = el.closest(EASY_READ_AUDIO_EXCLUDED_SELECTOR) !== null
  const easyReadId = `${id}_easy_read`
  const easyReadFilename = audioFiles[easyReadId]
  if (!isHeader && !isExcluded && translations[easyReadId] !== undefined && easyReadFilename) {
    return {
      id: easyReadId,
      filename: easyReadFilename,
      useBlockWhenMissingTimecodes: true,
      speechText: speechTexts[easyReadId],
    }
  }

  return sourceFilename
    ? {
        id,
        filename: sourceFilename,
        useBlockWhenMissingTimecodes: false,
        speechText: speechTexts[id],
      }
    : null
}

function gatherPlayableItems(
  audioFiles: Record<string, string>,
  translations: Record<string, string>,
  speechTexts: Record<string, string>,
  easyReadMode: boolean,
): PlayableItem[] {
  if (typeof document === "undefined") return []
  const content = document.getElementById("content")
  if (!content) return []
  const elements = Array.from(content.querySelectorAll<HTMLElement>("[data-id]"))
  const items: PlayableItem[] = []
  for (const el of elements) {
    const id = el.getAttribute("data-id")
    if (!id) continue
    const audio = resolvePlayableAudio(
      el,
      id,
      audioFiles,
      translations,
      speechTexts,
      easyReadMode,
    )
    if (!audio) continue
    items.push({ el, ...audio })
  }
  return items
}

interface ActiveHighlight {
  el: HTMLElement
  mode: "word" | "block"
  timestamps: DisplayWordTimestamp[]
}

export interface UseAudioPlayer {
  isPlaying: boolean
  hasItems: boolean
  play: () => void
  pause: () => void
  togglePlayPause: () => void
  playNext: () => void
  playPrevious: () => void
  stop: () => void
  playAtIndex: (index: number) => void
}

export function useAudioPlayer(): UseAudioPlayer {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const activeRef = useRef<ActiveHighlight | null>(null)
  const hasAutoStartedRef = useRef<boolean>(false)
  const playSessionRef = useRef(0)
  const [isPlaying, setIsPlaying] = useAtom(isPlayingAtom)
  const [currentIndex, setCurrentIndex] = useAtom(currentAudioIndexAtom)
  const activeMedia = useAtomValue(activeMediaAtom)
  const setActiveMedia = useSetAtom(activeMediaAtom)
  const primaryAudioFiles = useAtomValue(audioFilesAtom)
  const audioVoices = useAtomValue(audioVoicesAtom)
  const narratorVoiceValue = useAtomValue(narratorVoiceAtom)
  // A slot with an empty audios map is not a usable voice — a manifest can ship
  // one when every clip for that slot failed to generate. `??` would happily
  // accept `{}` and play silence, so test for content rather than presence.
  const slotAudios = (slot: NarratorVoiceSlot): Record<string, string> | undefined => {
    const audios = audioVoices?.voices[slot]?.audios
    return audios && Object.keys(audios).length > 0 ? audios : undefined
  }
  const narratorVoice: NarratorVoiceSlot =
    narratorVoiceValue === "secondary" && slotAudios("secondary") ? "secondary" : "primary"
  const audioFiles = slotAudios(narratorVoice) ?? primaryAudioFiles
  const translations = useAtomValue(translationsAtom)
  const speechTexts = useAtomValue(speechTextsAtom)
  const language = useAtomValue(currentLanguageAtom) as string
  const audioLanguage = useAtomValue(audioLanguageAtom)
  const easyReadMode = useAtomValue(easyReadModeAtom) as boolean
  const speed = useAtomValue(audioSpeedAtom) as number
  const volume = useAtomValue(audioVolumeAtom) as number
  const autoplayMode = useAtomValue(autoplayModeAtom) as boolean
  const readAloudMode = useAtomValue(readAloudModeAtom) as boolean
  const setReadAloudMode = useSetAtom(readAloudModeAtom)
  const pageEpoch = useAtomValue(pageEpochAtom)
  const wordHighlightMode = useAtomValue(wordHighlightModeAtom) as boolean
  const describeImagesMode = useAtomValue(describeImagesModeAtom) as boolean
  const timecodeMaps = useAtomValue(timecodeMapsAtom)
  const timecodeMap = timecodeMaps[narratorVoice]
  const wordHighlightModeRef = useRef(wordHighlightMode)
  const speedRef = useRef(speed)
  const volumeRef = useRef(volume)
  const initialResumeRef = useRef<boolean>(isPlaying || autoplayMode)
  const narratorVoiceRef = useRef(narratorVoice)
  const selectedLanguageRef = useRef(language)
  const settledLanguageRef = useRef(audioLanguage)
  const resumeAfterLanguageLoadRef = useRef(false)
  const selectedItemRef = useRef<{ id: string; pageEpoch: number } | null>(null)
  const readyItemsRef = useRef<{ items: PlayableItem[]; pageEpoch: number } | null>(null)

  wordHighlightModeRef.current = wordHighlightMode
  speedRef.current = speed
  volumeRef.current = volume

  // `pageEpoch` is a dependency, not a decoration: an in-place page swap
  // replaces <main> without changing any of the other inputs, so without it
  // this memo would keep serving `el` references into the detached previous
  // page and read-aloud would narrate content that is no longer on screen.
  const items = useMemo(() => {
    const all = gatherPlayableItems(
      audioFiles,
      translations,
      speechTexts,
      easyReadMode,
    )
    if (describeImagesMode) return all
    return all.filter((item) => item.el.tagName.toLowerCase() !== "img")
  }, [audioFiles, translations, speechTexts, easyReadMode, describeImagesMode, pageEpoch])

  // A partial language response can change which recordings are available
  // before the complete catalog publishes. Keep pending controls anchored to
  // the last ready page's order; resolve their selected data ID on publication.
  useEffect(() => {
    if (language === audioLanguage) readyItemsRef.current = { items, pageEpoch }
  }, [language, audioLanguage, items, pageEpoch])
  const navigationItems = language !== audioLanguage && readyItemsRef.current?.pageEpoch === pageEpoch
    ? readyItemsRef.current.items
    : items

  const teardownActive = useCallback(() => {
    const active = activeRef.current
    if (!active) return
    if (active.mode === "word") {
      clearWordHighlight(active.el)
      unwrapWordsForElement(active.el)
    } else {
      clearBlockHighlight(active.el)
    }
    activeRef.current = null
  }, [])

  const setupHighlight = useCallback(
    (item: PlayableItem, audio: HTMLAudioElement) => {
      teardownActive()
      const displayText = item.el.textContent ?? ""
      const speechText = item.speechText ?? displayText
      const precise = timecodeMap[item.id]
      const canUseWord =
        wordHighlightModeRef.current &&
        elementSupportsWordHighlight(item.el) &&
        !(item.useBlockWhenMissingTimecodes && !precise)
      if (canUseWord) {
        const rawTimestamps = resolveWordTimestamps(
          item.id,
          speechText,
          audio.duration,
          precise,
        )
        const timestamps = mapWordTimestampsToDisplayWords(
          displayText,
          speechText,
          rawTimestamps,
        )
        if (timestamps) {
          wrapWordsForElement(item.el, displayText)
          activeRef.current = { el: item.el, mode: "word", timestamps }
          return
        }
      }
      setBlockHighlight(item.el)
      activeRef.current = { el: item.el, mode: "block", timestamps: [] }
    },
    [teardownActive, timecodeMap],
  )

  const stopAndClear = useCallback(() => {
    // Resolving/rejecting play() may outlive pause(), load(), or an unmount.
    // Both initial play and resume must lose ownership at this boundary.
    playSessionRef.current++
    teardownActive()
    const audio = audioRef.current
    if (!audio) return
    audio.onended = null
    audio.onerror = null
    audio.ontimeupdate = null
    audio.onloadedmetadata = null
    audio.pause()
    audio.removeAttribute("src")
    audio.load()
  }, [teardownActive])

  useEffect(() => {
    if (narratorVoiceRef.current === narratorVoice) return
    narratorVoiceRef.current = narratorVoice
    // A language may add/remove a narrator and thereby change the effective
    // voice. That must not discard the target queued during its catalog load.
    if (language === audioLanguage && settledLanguageRef.current === language) {
      selectedItemRef.current = null
      setCurrentIndex(0)
    }
    stopAndClear()
    setIsPlaying(false)
  }, [narratorVoice, language, audioLanguage, setCurrentIndex, setIsPlaying, stopAndClear])

  const playAtIndex = useCallback(
    (index: number) => {
      hasAutoStartedRef.current = true
      const requestedItem = navigationItems[index]
      if (!requestedItem) {
        resumeAfterLanguageLoadRef.current = false
        stopAndClear()
        setIsPlaying(false)
        return
      }
      selectedItemRef.current = {
        id: requestedItem.el.getAttribute("data-id") ?? requestedItem.id,
        pageEpoch,
      }
      setCurrentIndex(index)
      if (language !== audioLanguage) {
        resumeAfterLanguageLoadRef.current = true
        stopAndClear()
        setIsPlaying(false)
        return
      }
      const session = ++playSessionRef.current
      const item = items[index]
      const url = `./content/i18n/${language}/audio/${item.filename}`

      if (!audioRef.current) audioRef.current = new Audio()
      const audio = audioRef.current

      // Tear down handlers from the previous item before we re-bind.
      audio.onended = null
      audio.onerror = null
      audio.ontimeupdate = null
      audio.onloadedmetadata = null
      teardownActive()

      audio.src = url
      audio.playbackRate = speedRef.current
      audio.volume = Math.max(0, Math.min(1, volumeRef.current))

      audio.onloadedmetadata = () => {
        if (
          activeRef.current &&
          activeRef.current.mode === "word" &&
          !timecodeMap[item.id]
        ) {
          const displayText = item.el.textContent ?? ""
          const speechText = item.speechText ?? displayText
          const timestamps = mapWordTimestampsToDisplayWords(
            displayText,
            speechText,
            resolveWordTimestamps(
              item.id,
              speechText,
              audio.duration,
              undefined,
            ),
          )
          if (timestamps) activeRef.current.timestamps = timestamps
        }
      }

      audio.ontimeupdate = () => {
        const active = activeRef.current
        if (!active || active.mode !== "word") return
        const indices = findDisplayWordIndicesAtTime(
          active.timestamps,
          audio.currentTime,
        )
        setWordHighlights(active.el, indices)
      }

      audio.onended = () => {
        teardownActive()
        const next = index + 1
        if (next < items.length) {
          playAtIndex(next)
        } else {
          setIsPlaying(false)
          setCurrentIndex(0)
        }
      }

      audio.onerror = () => {
        console.warn("[adt-runtime] audio playback failed for", url)
        teardownActive()
        setIsPlaying(false)
      }

      setupHighlight(item, audio)

      audio
        .play()
        .then(() => {
          if (session !== playSessionRef.current) return
          setActiveMedia("tts")
          setIsPlaying(true)
        })
        .catch((err) => {
          if (session !== playSessionRef.current) return
          console.warn("[adt-runtime] audio.play() rejected", err)
          teardownActive()
          setIsPlaying(false)
        })
    },
    [
      items,
      navigationItems,
      pageEpoch,
      language,
      audioLanguage,
      setIsPlaying,
      setCurrentIndex,
      setActiveMedia,
      stopAndClear,
      setupHighlight,
      teardownActive,
      timecodeMap,
    ],
  )

  const pause = useCallback(() => {
    resumeAfterLanguageLoadRef.current = false
    playSessionRef.current++
    const audio = audioRef.current
    if (audio && !audio.paused) audio.pause()
    setIsPlaying(false)
  }, [setIsPlaying])

  const play = useCallback(() => {
    if (navigationItems.length === 0) return
    setReadAloudMode(true)
    if (language !== audioLanguage) {
      playAtIndex(currentIndex || 0)
      return
    }
    const audio = audioRef.current
    if (
      audio &&
      audio.src &&
      audio.currentTime > 0 &&
      audio.currentTime < audio.duration
    ) {
      const session = ++playSessionRef.current
      audio
        .play()
        .then(() => {
          if (session !== playSessionRef.current) return
          setActiveMedia("tts")
          setIsPlaying(true)
        })
        .catch(() => {
          if (session === playSessionRef.current) setIsPlaying(false)
        })
      return
    }
    playAtIndex(currentIndex || 0)
  }, [
    navigationItems.length,
    language,
    audioLanguage,
    currentIndex,
    playAtIndex,
    setActiveMedia,
    setIsPlaying,
    setReadAloudMode,
  ])

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current
    if (audio && !audio.paused) pause()
    else play()
  }, [pause, play])

  const playNext = useCallback(() => {
    if (navigationItems.length === 0) return
    const next = Math.min(currentIndex + 1, navigationItems.length - 1)
    playAtIndex(next)
  }, [currentIndex, navigationItems.length, playAtIndex])

  const playPrevious = useCallback(() => {
    if (navigationItems.length === 0) return
    const prev = Math.max(currentIndex - 1, 0)
    playAtIndex(prev)
  }, [currentIndex, navigationItems.length, playAtIndex])

  const stop = useCallback(() => {
    resumeAfterLanguageLoadRef.current = false
    selectedItemRef.current = null
    stopAndClear()
    setIsPlaying(false)
    setCurrentIndex(0)
  }, [stopAndClear, setIsPlaying, setCurrentIndex])

  // Page turned in place. The audio element and every playback atom survived,
  // but the nodes they referred to did not: stop the track that belongs to the
  // previous page, rewind to its first item, and — if the reader was listening
  // — pick up on the new one. This mirrors what a full document reload does
  // via the persisted `isPlaying` flag.
  //
  // Self-contained rather than delegating to the auto-start effect below,
  // whose `items.length` dependency does not change between two pages that
  // happen to hold the same number of readable blocks.
  const onPageTurned = useEffectEvent(() => {
    selectedItemRef.current = null
    initialResumeRef.current = isPlaying || autoplayMode
    stopAndClear()
    setCurrentIndex(0)
    hasAutoStartedRef.current = false
    if (!readAloudMode || !isPlaying) return
    hasAutoStartedRef.current = true
    playAtIndex(0)
  })

  useEffect(() => {
    if (pageEpoch <= 1) return
    onPageTurned()
  }, [pageEpoch])

  useEffect(() => {
    if (hasAutoStartedRef.current) return
    if (items.length === 0) return
    if (!readAloudMode) return
    if (!initialResumeRef.current) return
    hasAutoStartedRef.current = true
    playAtIndex(0)
  }, [items.length, readAloudMode, playAtIndex])

  useEffect(() => {
    if (readAloudMode) return
    resumeAfterLanguageLoadRef.current = false
    selectedItemRef.current = null
    stopAndClear()
    setIsPlaying(false)
    setCurrentIndex(0)
  }, [readAloudMode, stopAndClear, setIsPlaying, setCurrentIndex])

  useEffect(() => {
    if (activeMedia !== "sign-language") return
    resumeAfterLanguageLoadRef.current = false
    selectedItemRef.current = null
    stopAndClear()
    setIsPlaying(false)
    setCurrentIndex(0)
    setReadAloudMode(false)
  }, [
    activeMedia,
    stopAndClear,
    setIsPlaying,
    setCurrentIndex,
    setReadAloudMode,
  ])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed
  }, [speed])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = Math.max(0, Math.min(1, volume))
  }, [volume])

  // Selection changes before async catalogs arrive. Never combine a new
  // language directory with the previous language's manifest filenames.
  // Resume only after the current DOM/catalog/timings have all published.
  const onLanguageReady = useEffectEvent(() => {
    if (selectedLanguageRef.current !== language) {
      selectedLanguageRef.current = language
      settledLanguageRef.current = null
      resumeAfterLanguageLoadRef.current = resumeAfterLanguageLoadRef.current || isPlaying
      stopAndClear()
      setIsPlaying(false)
    }
    if (audioLanguage !== language) return
    settledLanguageRef.current = language
    const resume = resumeAfterLanguageLoadRef.current && readAloudMode
    resumeAfterLanguageLoadRef.current = false
    const selected = selectedItemRef.current
    const index = selected?.pageEpoch === pageEpoch
      ? items.findIndex((item) => (item.el.getAttribute("data-id") ?? item.id) === selected.id)
      : 0
    setCurrentIndex(Math.max(0, index))
    if (resume && index >= 0) playAtIndex(index)
  })

  useEffect(() => {
    onLanguageReady()
  }, [language, audioLanguage])

  // When Easy Read mode toggles, the on-screen text has already swapped (via
  // applyTranslationsToDOM) and `items` has been rebuilt to point at the
  // matching audio track (easy-read recording vs original). Realign the audio
  // so it follows the text: re-play the current item if playing, or drop the
  // now-stale loaded track so the next play() starts fresh on the right one.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audio.src) return
    if (isPlaying) playAtIndex(currentIndex)
    else stopAndClear()
  }, [easyReadMode])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audio.src) return
    const item = items[currentIndex]
    if (!item) return
    setupHighlight(item, audio)
  }, [wordHighlightMode, currentIndex, items, setupHighlight])

  useEffect(() => {
    return () => {
      stopAndClear()
      audioRef.current = null
    }
  }, [stopAndClear])

  return {
    isPlaying,
    hasItems: navigationItems.length > 0,
    play,
    pause,
    togglePlayPause,
    playNext,
    playPrevious,
    stop,
    playAtIndex,
  }
}
