# SPEC-0013 provider wire evidence

Verified on 2026-10-12 with Node22.23.2, Claude Code2.1.260 and Codex0.159.2.
All executable probes use isolated HOME/configuration, fake credentials, loopback
HTTP/SSE responses and blocked external proxy egress. No paid requests or real
quota failures are induced; synthetic login tokens test selection and routing,
not live account validity.

The unchanged historical assertions reproduced Claude token continuation at
12 actual requests against3 allowed, and Codex tool continuation at2 against1.
The implementation now reserves one forwarding slot synchronously before an
upstream socket can send a provider request. Concurrent/internal retries, schema
repair, tool turns and token continuations cannot acquire another slot. Each
facade retry opens a new bounded slot. This does not depend on observing stdout
or killing the process before its next request.

All 25 executable cases passed after review fixes: transient/invalid/truncated
rounds use at most3 requests for maxRetries2; auth and structured quota failures
use1; Codex unexpected tool output uses1 with maxRetries0; valid output uses1;
external cancellation sends no follow-up. Actual forwarding callbacks distinguish
provider attempts from a CLI that could not start. Recorded usage remains separate
from unknown usage; denied continuations retain available SSE usage.

The independent review reproduced an additional quota bug: both CLIs made3
requests for structured `insufficient_quota` HTTP 429. Preserving upstream typed status
and body at the gate fixed both to 1. Direct TLS and CONNECT proxy mTLS now preserve
configured client certificate/key/passphrase; committed tests use an explicitly
public synthetic fixture, without installing a trusted CA on the machine.

## Supported adapter boundary

ADT's registered Claude Agent adapter documents Anthropic API-key or Claude Code
login authentication. It retains configured key precedence and leaves login/token
selection to the executable. Its optional Anthropic-compatible base endpoint,
proxy routing and mTLS remain supported. Codex retains key/login selection,
account, organization and project headers, including current macOS discovery.

Claude's ambient Bedrock/Vertex/Foundry and other alternate-backend selectors can
bypass ANTHROPIC_BASE_URL. An independent Bedrock probe reproduced 3 model POSTs
reported as0 by the old callback boundary. Those selectors are now explicitly
rejected before spawning or sending any request, using the existing permanent
unsupported-capability error. They are not silently unset or redirected through
incompatible AWS signing. No registered ADT provider or documented authentication
mode is removed. Adding those alternate integrations would require a separate
supported transport/authentication contract; they are not certified by these
Anthropic adapter tests. Managed-settings override probing did not reproduce a
bypass on the tested Claude version. Future executable changes require rerunning
the opt-in suites; a skipped default suite is not wire-budget evidence.

```sh
ADT_CLAUDE_BUDGET_EXECUTABLE=/absolute/path/to/claude \
ADT_CODEX_BUDGET_EXECUTABLE=/absolute/path/to/codex \
pnpm exec vitest run packages/llm/src/__tests__/claude-wire-budget.test.ts \
  packages/llm/src/__tests__/codex-wire-budget.test.ts \
  packages/llm/src/__tests__/cli-request-budget.test.ts \
  packages/llm/src/__tests__/cli-request-budget-mtls.test.ts \
  packages/llm/src/__tests__/cli-request-budget-legacy.test.ts
```

The final combined command passed **54 tests**: 25 actual-executable cases and
29 gate/proxy/mTLS/capability cases (`wire-compressed-final.log`). This rerun includes the final typed
HTTP error and bounded Retry-After handling.

Detailed local logs: `tmp/spec0013-oct12/wire-baseline.log`,
`wire-review-fixes.log` and `review/{quota,quota-recheck,bedrock,bedrock-recheck,mtls-recheck}.log`.
The evidence documents behavior, not human approval or release certification.

## Compressed errors and explicit retry guidance

Late independent reproductions found gzip `insufficient_quota` HTTP 429 and
`x-should-retry:false` HTTP 503 each produced 3 actual requests on both installed CLIs.
Commit `ff07bf60` fixes both to 1. Diagnostic-only decompression is bounded to 64 KiB
wire capture and decoded output, with at most 4 reversed encoding layers; response
bytes/headers delivered to the executable remain unchanged. gzip, deflate, br and
identity are supported, plus native zstd when available. Advertised encodings are
filtered to runtime capabilities (older-runtime no-zstd behavior is tested).
Corrupt/oversized evidence stays unknown. Explicit false retry guidance survives
classification; true cannot override permanent quota or authentication failures.
Compressed SSE usage, pass-through bytes, malformed input and decompression bounds
are covered alongside the actual-executable one-request assertions.
