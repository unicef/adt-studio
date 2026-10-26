import type { ChatCredentials } from "@adt/chat"
import type { ResolvedCredentials } from "@adt/llm"
import type { StageService } from "../stage-service.js"
import type { TaskService } from "../task-service.js"

export interface ChatScreenContext {
  /** Workspace screen the user is looking at, e.g. "storyboard". */
  screen?: string
  pageId?: string
  pageLabel?: string
  sectionIndex?: number
  stage?: string
  language?: string
}

export interface ChatPaths {
  booksDir: string
  promptsDir: string
  webAssetsDir: string
  configPath: string
}

/**
 * Everything a chat tool handler needs. Handlers live in the api because they
 * depend on the service singletons; @adt/chat only defines the contract.
 */
export interface ChatToolContext {
  paths: ChatPaths
  safeLabel: string
  chatId: string
  threadId: string
  credentials: ChatCredentials
  /** Request-scoped pipeline credentials, the same ones a stage run reads. */
  providerCredentials: ResolvedCredentials
  locale: string
  screen: ChatScreenContext
  stageService: StageService
  taskService: TaskService
  signal?: AbortSignal
}
