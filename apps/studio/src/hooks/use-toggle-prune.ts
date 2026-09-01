import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { PageSectioningOutput } from "@adt/types"
import { api, type PageDetail } from "@/api/client"
import { useApiKey } from "@/hooks/use-api-key"
import { invalidateStoryboardDependents } from "@/hooks/use-page-mutations"

/**
 * Take a section out of the book, or put it back.
 *
 * Removal is reversible: it flips `isPruned`, which filters the section out at
 * read time while its HTML, images and slot in the reading order all stay put.
 *
 * The one case that needs work is putting a section back that was already out
 * when the storyboard last ran — `web-rendering` skips removed sections, so it
 * has no HTML and the LLM has to produce it. That re-renders just this section
 * rather than marking the whole stage stale, which is how content is normally
 * brought in, one section at a time.
 *
 * Shared by the storyboard sidebar and the overview table so both behave
 * identically; the subtlety above is easy to get wrong twice.
 */
export function useTogglePrune(bookLabel: string) {
  const queryClient = useQueryClient()
  const { apiKey, hasApiKey } = useApiKey()

  return useMutation({
    mutationFn: async ({
      pageId,
      sectionIndex,
    }: {
      pageId: string
      sectionIndex: number
    }) => {
      // Prefer the cached detail (the overview already holds it) and fall back
      // to fetching, so callers with only a page summary can use this too.
      const page =
        queryClient.getQueryData<PageDetail>(["books", bookLabel, "pages", pageId]) ??
        (await api.getPage(bookLabel, pageId))
      if (!page?.sectioningTree) throw new Error("No sectioning data")

      const updated: PageSectioningOutput = {
        ...page.sectioningTree,
        sections: page.sectioningTree.sections.map((s, i) =>
          i === sectionIndex ? { ...s, isPruned: !s.isPruned } : s,
        ),
      }

      const wasPruned = page.sectioningTree.sections[sectionIndex]?.isPruned ?? false
      const hasHtml = (page.rendering?.sections ?? []).some(
        (s) => s.sectionIndex === sectionIndex && !!s.html,
      )
      const needsRerender = wasPruned && !hasHtml

      const result = await api.saveStoryboard(bookLabel, pageId, {
        sectioning: updated,
        // Without a key we cannot fill the HTML, so the stage must report it.
        renderingInSync: !needsRerender || hasApiKey,
      })

      if (!needsRerender || !hasApiKey) return result

      // Sectioning is saved with the section included, so the re-render will
      // actually emit it. A rejected submission never reaches the runner, so
      // take the completion mark back here.
      try {
        await api.reRenderPage(bookLabel, pageId, apiKey, sectionIndex)
      } catch (err) {
        await api
          .saveStoryboard(bookLabel, pageId, { sectioning: updated, renderingInSync: false })
          .catch(() => {})
        throw err
      }
      return result
    },

    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({
        queryKey: ["books", bookLabel, "pages", vars.pageId],
      })
      void queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] })
      // Refreshes the reading order too — book page numbers shift when what the
      // book renders changes. Note this fires when the *re-render is submitted*,
      // not when it lands; the task's own completion handler covers that.
      invalidateStoryboardDependents(queryClient, bookLabel)
    },
  })
}
