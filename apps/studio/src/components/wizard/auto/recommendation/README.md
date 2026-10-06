# Setup recommendation — integration notes

The "Let AI set it up" path of **Add Book** (`/books/new`) asks a recommender for the book's settings.
The screens are done; the recommender is behind one interface and currently answered by a
placeholder. Connecting the real recommender means implementing that interface.

## What to implement

```ts
// recommendation/client.ts
interface SetupClient {
  recommend(request: SetupRequest, signal: AbortSignal): Promise<SetupResult>
}
```

- **Request** (`SetupRequest` in `contract.ts`)
  - `file` — the PDF.
  - `userLanguage` — the UI locale (e.g. `pt-BR`); the recommender writes `reason` and
    `ambiguityReason` in it (`--user-language` in adt-poc-llm).
  - `pages` — `{ start, end }` when the user chose some pages on upload, otherwise absent. The
    recommender should sample inside it (adt-poc-llm currently samples the whole book).
- **Response** — `setupResultSchema` in `contract.ts` mirrors adt-poc-llm `poc-v1` (V2 output):
  six decisions (`preset`, `renderStrategy`, `pageGrouping`, `sectioningMode`,
  `activitiesGenerator`, `figureExtraction`), each `{ choice, confidence, reason, alternative,
  ambiguityReason, evidencePages }`, plus `provider`, `model`, `promptVersion`, `usage`, `timing`.
  Extra fields (e.g. `bookProfile`) pass through. Per AGENTS.md this schema moves to `@adt/types`
  once an API route serves it.
- **Abort** — Cancel / Start over abort the `signal`; pass it to `fetch`.

Then make it the default in `SetupClientContext.tsx` (it replaces `placeholderSetupClient`). The
call should go through `apps/studio/src/api/client.ts` like every other API call, with the
provider key in headers as the other routes do.

## Errors

Throw whatever fails; `classifySetupError` (in `client.ts`) sorts it for the loader:

| Kind | When | Screen |
|---|---|---|
| `auth` | HTTP 401/403, or a message about the API key | "Your AI provider needs attention" → Open AI providers |
| `quota` | HTTP 429, quota / rate limit | "Your AI provider is busy" → Try again |
| `offline` | network failure (`fetch failed`, `ENOTFOUND`, …) or the browser is offline | "You're offline", retries when back online |
| `unknown` | anything else (invalid structured output, unreadable PDF, …) | "We couldn't read this book" → Try again |

Every error offers "Set it up myself" (the step-by-step wizard, PDF kept) and shows the raw message
under "Show details". The shared `request()` helper only keeps the message, so attaching the HTTP
`status` to the thrown error makes the sorting exact.

## What the screens do with the answer

- `renderStrategy.alternative !== null` → **Decide**: the choice and the alternative are the two
  picks, and the chat explains the doubt with `ambiguityReason`.
- Any other decision with an alternative → **Review** marks it "Not sure", with a one-click switch.
- `reason`, `evidencePages` and `confidence` show in Review's "How I set it up" list (pages and
  confidence on hover).
- `confidence` alone never routes anything (the recommender reports it uncalibrated).
- A `renderStrategy` the chosen preset doesn't offer is fitted (`fitStrategy` in `review/setup.tsx`:
  the alternative if allowed, else the preset default) and Review says so. A compatibility check in
  the recommender would make this unnecessary.
- A slow answer shows a calm note after `SLOW_AFTER_MS` (`useSetupRun.ts`, 5 s); tune it to the
  recommender's real latency.

## Testing

Wrap the flow in `<SetupClientProvider value={fakeClient}>` to drive any outcome. Unit tests:
`recommendation.test.ts` (contract, page sampling, error sorting, preset fitting) and
`useSetupRun.test.tsx` (answer, failure, slow, abort, retry).
