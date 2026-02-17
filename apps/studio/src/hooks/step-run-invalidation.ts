export type QueryKey = ReadonlyArray<unknown>

/**
 * Query keys to refresh after a UI step is fully completed.
 * Always includes step-status so v2 completion state refreshes.
 */
export function getInvalidationKeysForUiStep(label: string, uiStep: string): QueryKey[] {
  const keys: QueryKey[] = []

  switch (uiStep) {
    case "extract":
    case "storyboard":
    case "captions":
      keys.push(["books", label, "pages"])
      keys.push(["books", label])
      keys.push(["books"])
      break
    case "quizzes":
      keys.push(["books", label, "quizzes"])
      break
    case "glossary":
      keys.push(["books", label, "glossary"])
      break
    case "translations":
      keys.push(["books", label, "text-catalog"])
      break
  }

  keys.push(["books", label, "step-status"])
  return keys
}

/** Refresh book metadata card/list as soon as metadata extraction completes. */
export function getMetadataInvalidationKeys(label: string): QueryKey[] {
  return [
    ["books", label],
    ["books"],
  ]
}
