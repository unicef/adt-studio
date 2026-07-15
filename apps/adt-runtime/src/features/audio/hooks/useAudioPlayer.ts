import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { useCallback, useEffect, useMemo, useRef } from "react"
import {
  activeMediaAtom,
  audioSpeedAtom,
  audioVolumeAtom,
  autoplayModeAtom,
  currentAudioIndexAtom,
  describeImagesModeAtom,
  isPlayingAtom,
  readAloudModeAtom,
  timecodeMapAtom,
  wordHighlightModeAtom,
} from "@/features/audio/state/audio.atoms"
import {
  audioFilesAtom,
  currentLanguageAtom,
  translationsAtom,
} from "@/features/language/state/language.atoms"
import { easyReadModeAtom } from "@/shared/state/ui.atoms"
import {
  clearBlockHighlight,
  clearWordHighlight,
  elementSupportsWordHighlight,
  findWordIndexAtTime,
  resolveWordTimestamps,
  setBlockHighlight,
  setWordHighlight,
  unwrapWordsForElement,
  wrapWordsForElement,
} from "@/features/audio/lib/word-highlight"
import type { WordTimestamp } from "@/features/audio/state/audio.atoms"

interface PlayableItem {
  el: HTMLElement
  id: string
  filename: string
  useBlockWhenMissingTimecodes?: boolean
}

const EASY_READ_AUDIO_EXCLUDED_SELECTOR =
  ".word-card, [data-activity-item], nav, .nav__list, button, input, textarea, select, option"

function resolvePlayableAudio(
  el: HTMLElement,
  id: string,
  audioFiles: Record<string, string>,
  translations: Record<string, string>,
  easyReadMode: boolean,
): Omit<PlayableItem, "el"> | null {
  const sourceFilename = audioFiles[id]
  if (!easyReadMode) {
    return sourceFilename
      ? { id, filename: sourceFilename, useBlockWhenMissingTimecodes: false }
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
    }
  }

  return sourceFilename
    ? { id, filename: sourceFilename, useBlockWhenMissingTimecodes: false }
    : null
}

function gatherPlayableItems(
  audioFiles: Record<string, string>,
  translations: Record<string, string>,
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
    const audio = resolvePlayableAudio(el, id, audioFiles, translations, easyReadMode)
    if (!audio) continue
    items.push({ el, ...audio })
  }
  return items
}

interface ActiveHighlight {
  el: HTMLElement
  mode: "word" | "block"
  timestamps: WordTimestamp[]
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
  const audioFiles = useAtomValue(audioFilesAtom)
  const translations = useAtomValue(translationsAtom)
  const language = useAtomValue(currentLanguageAtom) as string
  const easyReadMode = useAtomValue(easyReadModeAtom) as boolean
  const speed = useAtomValue(audioSpeedAtom) as number
  const volume = useAtomValue(audioVolumeAtom) as number
  const autoplayMode = useAtomValue(autoplayModeAtom) as boolean
  const readAloudMode = useAtomValue(readAloudModeAtom) as boolean
  const setReadAloudMode = useSetAtom(readAloudModeAtom)
  const wordHighlightMode = useAtomValue(wordHighlightModeAtom) as boolean
  const describeImagesMode = useAtomValue(describeImagesModeAtom) as boolean
  const timecodeMap = useAtomValue(timecodeMapAtom)
  const wordHighlightModeRef = useRef(wordHighlightMode)
  const speedRef = useRef(speed)
  const volumeRef = useRef(volume)
  const initialResumeRef = useRef<boolean>(isPlaying || autoplayMode)

  wordHighlightModeRef.current = wordHighlightMode
  speedRef.current = speed
  volumeRef.current = volume

  const items = useMemo(() => {
    const all = gatherPlayableItems(audioFiles, translations, easyReadMode)
    if (describeImagesMode) return all
    return all.filter((item) => item.el.tagName.toLowerCase() !== "img")
  }, [audioFiles, translations, easyReadMode, describeImagesMode])

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
      const text = item.el.textContent ?? ""
      const precise = timecodeMap[item.id]
      const useWord =
        wordHighlightModeRef.current &&
        elementSupportsWordHighlight(item.el) &&
        !(item.useBlockWhenMissingTimecodes && !precise)
      if (useWord) {
        wrapWordsForElement(item.el, text)
        const timestamps = resolveWordTimestamps(
          item.id,
          text,
          audio.duration,
          precise,
        )
        activeRef.current = { el: item.el, mode: "word", timestamps }
      } else {
        setBlockHighlight(item.el)
        activeRef.current = { el: item.el, mode: "block", timestamps: [] }
      }
    },
    [teardownActive, timecodeMap],
  )

  const stopAndClear = useCallback(() => {
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

  const playAtIndex = useCallback(
    (index: number) => {
      hasAutoStartedRef.current = true
      const session = ++playSessionRef.current
      if (index < 0 || index >= items.length) {
        stopAndClear()
        setIsPlaying(false)
        return
      }
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
          const text = item.el.textContent ?? ""
          activeRef.current.timestamps = resolveWordTimestamps(
            item.id,
            text,
            audio.duration,
            undefined,
          )
        }
      }

      audio.ontimeupdate = () => {
        const active = activeRef.current
        if (!active || active.mode !== "word") return
        const idx = findWordIndexAtTime(active.timestamps, audio.currentTime)
        setWordHighlight(active.el, idx)
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

      setCurrentIndex(index)
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
      language,
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
    const audio = audioRef.current
    if (!audio || audio.paused) return
    audio.pause()
    setIsPlaying(false)
  }, [setIsPlaying])

  const play = useCallback(() => {
    if (items.length === 0) return
    setReadAloudMode(true)
    const audio = audioRef.current
    if (
      audio &&
      audio.src &&
      audio.currentTime > 0 &&
      audio.currentTime < audio.duration
    ) {
      audio
        .play()
        .then(() => {
          setActiveMedia("tts")
          setIsPlaying(true)
        })
        .catch(() => setIsPlaying(false))
      return
    }
    playAtIndex(currentIndex || 0)
  }, [
    items.length,
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
    if (items.length === 0) return
    const next = Math.min(currentIndex + 1, items.length - 1)
    playAtIndex(next)
  }, [currentIndex, items.length, playAtIndex])

  const playPrevious = useCallback(() => {
    if (items.length === 0) return
    const prev = Math.max(currentIndex - 1, 0)
    playAtIndex(prev)
  }, [currentIndex, items.length, playAtIndex])

  const stop = useCallback(() => {
    stopAndClear()
    setIsPlaying(false)
    setCurrentIndex(0)
  }, [stopAndClear, setIsPlaying, setCurrentIndex])

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
    stopAndClear()
    setIsPlaying(false)
    setCurrentIndex(0)
  }, [readAloudMode, stopAndClear, setIsPlaying, setCurrentIndex])

  useEffect(() => {
    if (activeMedia !== "sign-language") return
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

  useEffect(() => {
    if (isPlaying && audioRef.current) playAtIndex(currentIndex)
  }, [language])

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
    hasItems: items.length > 0,
    play,
    pause,
    togglePlayPause,
    playNext,
    playPrevious,
    stop,
    playAtIndex,
  }
}
