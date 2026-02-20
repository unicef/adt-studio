export type QuizImageRenderState = "idle" | "loading" | "error" | "ready"

export function getRequestedPageId(pageId: string, isRequested: boolean): string {
  return isRequested ? pageId : ""
}

export function getQuizImageRenderState({
  isRequested,
  isLoading,
  isError,
  hasImage,
}: {
  isRequested: boolean
  isLoading: boolean
  isError: boolean
  hasImage: boolean
}): QuizImageRenderState {
  if (!isRequested) return "idle"
  if (hasImage) return "ready"
  if (isError) return "error"
  if (isLoading) return "loading"
  return "loading"
}
