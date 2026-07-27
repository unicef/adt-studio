# Assistant — In-App Chat Widget

The Assistant is a persistent chat panel available from anywhere in the Studio
app. It answers questions about whatever book page the user is currently
looking at, and — in this first version — **advises only**: it never calls a
mutating endpoint on the user's behalf. It tells the user which existing UI
action to use (Duplicate, Merge, Delete, edit a section's text/image nodes,
etc.) and walks them through it, but it does not perform the action itself.

## Why it exists

There's no dedicated "split a section" action in the product today. When the
AI extraction pipeline merges two distinct activities into one section, a
user's only path to fixing it is a manual workaround (duplicate the section,
then edit each copy down to one activity). The Assistant exists to surface
that kind of guidance in place, without requiring the user to already know
the workaround or dig through documentation.

## Tone

The system prompt ([`prompts/assistant_chat.liquid`](../prompts/assistant_chat.liquid))
enforces one hard rule: never phrase an answer as an apology or a
consolation ("I can't do that, but here's a workaround..."). Instead it states
the steps directly, as if they're simply the answer — the user cares about
solving their problem, not about whether a one-click action exists. This is a
deliberate contrast with assistants that lead with their own limitations.

## Scope: not just the current page

The Assistant is grounded in the current page's content when relevant, but
it is explicitly **not limited to it**. The system prompt tells the model to
judge each incoming message on its own terms: a question about the current
page uses that page's section HTML as context; a broader "how does ADT
Studio work" or conceptual question (stages vs. steps, what caching means,
where a setting lives) gets answered directly, without forcing it back to
page content it doesn't need. The widget's own gating (`if (!label) return
null`) still limits *where the bubble appears* (book pages only, since that's
where "the page you're currently viewing" has meaning) — but once it's open,
what you can ask it is broader than that page.

## Guardrail: confidence is not license to fabricate

Broadening the scope beyond page content exposed a real failure mode during
manual testing: asked "can my coworker help me?" (i.e. is there a
collaboration/sharing feature), the model invented a plausible but entirely
fictional "Members / Share" settings flow — confidently, because the tone
rule tells it to never hedge. Confident wording does not make a fabricated
menu less dangerous; if anything it's worse, since the user will go looking
for something that was never there.

The fix is a **Facts about ADT Studio** section in the system prompt —
concrete, verifiable statements pulled from this repo's own principles
(single-user/no-accounts, book-level storage, versioning, caching, LLM-call
transparency, the real list of section actions) — plus an explicit rule
that confidence describes *how* the model says true things, never license
to invent untrue ones. When a question falls outside both the current page
and these facts, the prompt tells it to say plainly what it does and
doesn't know rather than improvising UI.

**This is the load-bearing lesson for anyone extending this prompt further:
every time the Assistant's scope grows, whatever it's now expected to
answer needs to be backed by real facts in the prompt, not just tone
instructions.** Tone rules alone make wrong answers more convincing, not
more correct.

## Linking to documentation

When a `DOCS_BASE_URL` environment variable is set (same pattern as
`BOOKS_DIR`/`PROMPTS_DIR` in `apps/api/src/app.ts`), the system prompt tells
the model it may point users to the docs site for deeper explanations by
including that link in its reply. The frontend renders any `http(s)://` URL
in a reply as a clickable link (`renderMessageContent` in
`AssistantWidget.tsx` — a plain-text URL split/wrap, not `dangerouslySetInnerHTML`).

**Deliberately scoped to the docs *home page* only, not deep links to
specific pages.** The model has no index of the docs site's internal page
structure, and the prompt explicitly forbids it from inventing a sub-page
path — a fabricated URL is worse than no link. Building an actual page
index (title + path per doc page, fed into the prompt so the model can pick
an accurate specific page) is a natural v2 once the docs site
(`apps/site`, which lives on a separate branch from this one — see the
root `CLAUDE.md`) is far enough along to be worth indexing.

## Request flow

```
AssistantWidget.tsx (floating bubble + Sheet, mounted in __root.tsx)
  → useAssistantChat() (apps/studio/src/hooks/use-assistant.ts, TanStack Query mutation)
    → api.sendAssistantMessage() (apps/studio/src/api/client.ts)
      → POST /books/:label/assistant/chat   [X-OpenAI-Key header, never logged/queried]
        → createAssistantRoutes (apps/api/src/routes/assistant.ts)
          → assistantChat() (apps/api/src/services/assistant-chat-service.ts)
            → createLLMModel + createPromptEngine (@adt/llm)  — same client every
              other AI feature uses (page edits, sectioning, etc.)
              → renders prompts/assistant_chat.liquid with page context
              → OpenAI, response validated against assistantChatLLMSchema (Zod)
            → every call appended to the book's own llm_log via storage.appendLlmLog()
              (taskType: "assistant") — visible in Debug → LLM Logs like any other call
```

Nothing here is a new integration: it's the same LLM client, the same prompt
templating engine, and the same per-book SQLite log that every existing
AI-driven pipeline step uses. The Assistant is a new **caller** of that
machinery, not a new code path alongside it.

## What context the model sees

The widget only appears on `/books/:label/...` routes (`AssistantWidget.tsx`
returns `null` off a book page — there's nothing for it to be contextual
*about* elsewhere). When the user has a page open, the service reads that
page's latest `web-rendering` output and sends the model the HTML of every
section on the page (each truncated to 4,000 characters to keep token usage
reasonable), tagged with its section index. This is deliberately *not* the
full-fidelity single-section HTML that `aiEditSection` (the existing AI-edit
feature) uses — the Assistant needs to reason about section boundaries and
rough content across a whole page, not make a precise edit to one section.

Conversation history is passed back on every turn from the frontend's local
React state (not persisted server-side); a `correlationId` is generated on
the first turn and reused on later ones so all turns of one conversation
group together in the LLM logs, the same way `aiEditHistory` groups edit
turns.

## Data contract

Defined in [`packages/types/src/assistant.ts`](../packages/types/src/assistant.ts)
— the single source of truth per the repo's Zod-schemas-only rule:

- `AssistantChatRequest` — `message`, `history` (`AssistantChatMessage[]`),
  optional `pageId` / `sectionIndex` / `correlationId`.
- `AssistantChatResponse` — `reply`, `correlationId`.
- `assistantChatLLMSchema` — the shape the LLM's structured output is
  validated against (`{ reply: string }`); intentionally narrower than the
  full response type since the server derives `correlationId` itself.

## Where it doesn't touch anything

- **No new dependencies.** Built entirely from existing pieces: Hono routing,
  the shared `@adt/llm` client, the existing prompt engine, TanStack Query.
- **No mutation.** The route is read-only — it never calls a book-storage
  write path other than the LLM log append every AI call already makes.
- **No new storage.** Conversation history lives in the browser tab's React
  state; nothing new is persisted to disk beyond the standard LLM log row.
- **i18n:** every user-visible string in `AssistantWidget.tsx` is wrapped in
  Lingui macros per the repo's i18n rules; catalogs still need `pnpm --filter
  @adt/studio extract` run and translated before merging (see Known gaps).

## Known gaps / not yet done

- Only tested against a synthetic book label with no real book data and a
  placeholder API key — the actual reply content/tone has not yet been
  checked against a real OpenAI key.
- **No automated tests.** `assistant-chat-service.ts` and the route have no
  `*.test.ts` counterpart, unlike sibling AI-feature services. This is a
  known, deliberate gap in this PR — left for a developer to pick up
  post-merge rather than blocking the first PR on it.
- `DOCS_BASE_URL` has no value configured anywhere yet (no `.env`, no
  `docker-compose.yml` entry, no deploy config) — the linking capability is
  wired end-to-end but inert until that's set.
- v1 is guidance-only by design; whether to add action-capability (letting
  the Assistant actually invoke Duplicate/Merge/Delete) or build a real
  "split" endpoint is an open decision for a v2, not part of this PR.
