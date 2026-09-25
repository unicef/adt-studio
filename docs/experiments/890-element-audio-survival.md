# Finding — Per-element audio: does an authored script survive, and does it reach playback?

Issue: [#890](https://github.com/unicef/adt-studio/issues/890) · Lands with the SPEC-0014 proposal.
**Time box:** 2026-09-23 → 2026-09-23 (half a day, one sitting). **Demo:** n/a — this is a mechanism
probe, not a demo.

**Question:** does a script authored for one element survive a content regeneration, and does it flow
end to end to reproducible audio?

<!--
Provenance, declared honestly (AGENTS.md operating rule 4). The probe ran on 2026-09-23 as a
throwaway spike against `develop` @ 737d3314, before any `exp/` branch existed; the script was never
committed. It is landing in the repository with the SPEC-0014 PR because that spec's Problem section
cites it as evidence and a reviewer must be able to read it.
-->

## What we tried

Seeded a minimal book **outside the repository** with one page, one visible text leaf
(`pg001_t001`) and one **uncaptioned image** (`pg001_im001`) — the motivating case ("tap the picture
and hear its name"). Then drove the real pipeline functions with a **stub synthesizer** (no API
spend) and inspected the resulting nodes:

1. `buildTextCatalog` — the real catalog, derived from the rendered HTML.
2. Manual insertion of the synthetic entry `{ id: "pg001_im001_audio", text: "Mago" }`.
3. `prepareCoreTtsCatalog` — per-language TTS normalisation.
4. `generateSpeechFile` — synthesis with a stubbed `synthesize()`.
5. A replay of the manifest logic from `packages/pipeline/src/packaging/web.ts`.
6. **Re-running `buildTextCatalog`** to measure survival.
7. `getStageClearNodes`, `getStageRerunClearNodes` and `IMAGE_SET_CHANGE_CLEAR_NODE_TYPES` —
   **executed**, not merely read.

## What we learned (with numbers where we have them)

### Question A — does it reach playback? ✅ YES

The full chain works from a synthetic entry, **without touching the schema or the HTML**:

| Step | Observed |
|---|---|
| `core-tts-catalog` | `{ id: "pg001_im001_audio", displayText: "Mago", speechText: "Mago", status: "ready" }` |
| LLM | **not called** (no transformations enabled → the `unchangedEntry` path) |
| `generateSpeechFile` | `synthesize()` received `input="Mago"`; wrote `audio/es-UY/pg001_im001_audio.mp3` |
| `speech_texts.json` (replayed) | `{"pg001_h001":"Los sonidos","pg001_t001":"Tocá la imagen","pg001_im001_audio":"Mago"}` |
| `audios.json` (replayed) | `{"pg001_im001_audio":"pg001_im001_audio.mp3"}` |

This validates the architectural bet, and establishes two design facts:

- The audio is published under the **synthetic** id, so reaching it from a click **requires the
  remap** to the element's key (`audios["pg001_im001"]`) — as F-03c anticipated.
- The uncaptioned image produced the catalog `{pg001_h001, pg001_t001}` — **no entry for the
  image**. The entry must be **created from scratch**, which is exactly the gap in **#710** (its
  route answers `404 Text entry not found` for an unknown id).

### Question B — does it survive a regeneration? ❌ NO

Evidence on two fronts, both executed.

**(1) Direct measurement.** With the script present, `buildTextCatalog` was re-run:

```
before: catalog contains "pg001_im001_audio"
after : entries = pg001_h001, pg001_t001      ← the script is gone
```

The catalog is **rebuilt from the rendered HTML**, so any entry that did not come from the HTML is
lost. No exception, no warning.

**(2) The invalidation machinery.** Running the real functions:

| Node | `easy-read` | `translate` rerun | image-set change | Verdict |
|---|---|---|---|---|
| `text-catalog` | ✅ in list | — | ✅ in list | ❌ **cleared** |
| `text-catalog-translation` | ✅ | ✅ | ✅ | ❌ **cleared** |
| `core-tts-catalog` | ✅ | — | ✅ | ❌ **cleared** |
| `tts` | ✅ | ✅ | ✅ | ❌ **cleared** |

`getStageClearNodes('easy-read')` returns:
`["text-catalog","easy-read","catalog-translation","core-tts-catalog","image-translation","text-catalog-translation","tts","word-timestamps","package-web","accessibility-assessment"]`

`IMAGE_SET_CHANGE_CLEAR_NODE_TYPES`:
`["image-captioning","text-catalog","easy-read","text-catalog-translation","core-tts-catalog","tts","tts-timestamps","accessibility-assessment"]`

Note the irony: **the step that builds the catalog clears it first**. And an image-set change —
something an author does routinely — clears `text-catalog` **book-wide**.

### Why this matters

Had the authored script been persisted the way **#710** does it (`persistCatalogTextVersion` →
`text-catalog` / `text-catalog-translation`), the author's work would be destroyed by all four routes
in the table above, **including the most common one of all** (changing an image). This confirms R-18
by measurement rather than by reading.

## Recommendation

- [x] **write SPEC-0014**, with one binding condition: the authored script must live **outside**
      `text-catalog`, in its own versioned artifact, and #710's infrastructure must be used **only**
      as the synthesis and versioning primitive.
- [ ] ~~archive~~
- [ ] ~~extend time box~~

The `Problem` section of SPEC-0014 is this finding's outcome: it states the symptom and the numbers
without needing to argue.

## What the probe did NOT answer

Out of scope for a mechanism probe; none of it blocks the spec.

1. **Real translation cost under positional batching** — irrelevant for v1: multi-language
   translation is a non-goal (F-05/F-06) and every book in the working set is single-language.
2. **Latency and cost of `tts` against a real provider** (Azure/OpenAI) — not measured; a stub
   synthesizer was used to avoid API spend.
3. **Behaviour with transformations enabled** (`latex_to_speech` / `language_normalization`) — there
   `core-tts-catalog` **does** call the LLM. Not measured.
4. **The click trigger in the runtime** — not exercised (needs a bundle and a browser).
5. **Word highlighting when the script differs from the visible text** — not exercised.
