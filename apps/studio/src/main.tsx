import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider, createBrowserHistory, createRouter } from "@tanstack/react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { I18nProvider } from "@lingui/react"
import { i18n } from "@lingui/core"
import { TooltipProvider } from "@/components/ui/tooltip"
import { usePreviewSettingsListener } from "@/hooks/use-preview-settings-listener"
import { messages as enMessages } from "./locales/en.po"
import { messages as ptBRMessages } from "./locales/pt-BR.po"
import { messages as esMessages } from "./locales/es.po"
import { messages as frMessages } from "./locales/fr.po"
import { messages as sqMessages } from "./locales/sq.po"
import { routeTree } from "./routeTree.gen"
import "./styles/globals.css"
import { LOCALES } from "./i18n/locales"
import type { AppLocale } from "./i18n/locales"
export { LOCALES, type AppLocale } from "./i18n/locales"

function detectLocale(): AppLocale {
  const urlLang = new URLSearchParams(window.location.search).get("lang")
  if (urlLang && LOCALES.includes(urlLang as AppLocale)) return urlLang as AppLocale
  return "en"
}

i18n.load({ en: enMessages, "pt-BR": ptBRMessages, es: esMessages, fr: frMessages, sq: sqMessages })
i18n.activate(detectLocale())

if (import.meta.env.VITE_WORKSPACE_NAME) {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- dev-only tab label; env var is unset in production builds
  document.title = `ADT Studio — ${import.meta.env.VITE_WORKSPACE_NAME}`
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
})

const router = createRouter({
  routeTree,
  rewrite: {
    input: ({ url }) => {
      const lang = url.searchParams.get("lang")
      if (lang && LOCALES.includes(lang as AppLocale)) {
        i18n.activate(lang as AppLocale)
      }
      url.searchParams.delete("lang")
      return url
    },
    output: ({ url }) => {
      url.searchParams.set("lang", i18n.locale as AppLocale)
      return url
    },
  },
  history: createBrowserHistory(),
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

function PreviewSettingsListener(): null {
  usePreviewSettingsListener()
  return null
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          <PreviewSettingsListener />
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>
    </I18nProvider>
  </StrictMode>,
)
