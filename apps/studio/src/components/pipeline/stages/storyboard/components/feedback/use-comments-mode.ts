import { useCallback, useSyncExternalStore } from "react"

/**
 * One switch for reviewing feedback in the Storyboard: the toolbar's Comments button and the page
 * list's Comments filter are the same thing, so the list can never point at comments the page is
 * hiding. It lives outside React state because the list and the page are separate trees, and it
 * is kept for the window's session so it survives moving between pages.
 *
 * `open(threadId, sectionId)` turns the mode on and asks the page to open that comment. It is a
 * request with a timestamp rather than a value, so asking for the same comment twice opens it
 * twice — clicking a commented page again reopens its comment even after it was closed. It names
 * its section so only that section's page takes it, and it lapses if nothing takes it soon.
 */

/** How long a request waits for its section to open before it is dropped. */
export const REQUEST_TTL_MS = 10_000

export interface CommentRequest {
  threadId: string
  sectionId: string
  at: number
}

interface ModeState {
  on: boolean
  request: CommentRequest | null
}

const states = new Map<string, ModeState>()
const listeners = new Set<() => void>()

const storageKey = (bookLabel: string) => `adt:storyboard-comments-mode:${bookLabel}`

function read(bookLabel: string): ModeState {
  let state = states.get(bookLabel)
  if (!state) {
    let on = false
    try {
      on = window.sessionStorage.getItem(storageKey(bookLabel)) === "1"
    } catch {
      on = false
    }
    state = { on, request: null }
    states.set(bookLabel, state)
  }
  return state
}

function write(bookLabel: string, next: ModeState) {
  states.set(bookLabel, next)
  try {
    window.sessionStorage.setItem(storageKey(bookLabel), next.on ? "1" : "0")
  } catch {
    /* Private windows can refuse storage; the mode still works for this page. */
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useCommentsMode(bookLabel: string) {
  const state = useSyncExternalStore(subscribe, () => read(bookLabel))

  const setOn = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => {
      const current = read(bookLabel)
      const on = typeof next === "function" ? next(current.on) : next
      if (on !== current.on) write(bookLabel, { on, request: on ? current.request : null })
    },
    [bookLabel],
  )
  const open = useCallback(
    (threadId: string, sectionId: string) =>
      write(bookLabel, { on: true, request: { threadId, sectionId, at: Date.now() } }),
    [bookLabel],
  )
  /** Called once the page has opened the requested comment, so it isn't reopened on the next visit. */
  const consume = useCallback(() => {
    const current = read(bookLabel)
    if (current.request !== null) write(bookLabel, { ...current, request: null })
  }, [bookLabel])

  return { on: state.on, setOn, request: state.request, open, consume }
}
