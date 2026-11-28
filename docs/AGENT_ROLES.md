# ADT Studio — Agent Roles

Reference role definitions for AI coding agents working on this repo. These are not auto-loaded by any tool — they are descriptive guidance you can use when assigning a focused task to an agent (e.g. spawning a subagent, prompting Codex in agent mode, or framing a Claude Code session).

All agents must follow the project guidelines in [`GUIDELINES.md`](GUIDELINES.md).

---

## Code Reviewer

**Role**: Reviews pull requests and code changes for compliance with project standards.

**Responsibilities**:
- Verify code is placed in the correct package/app per the architecture (see Guidelines: Code Organization)
- Check that the 6 core principles are respected (book-level storage, entity versioning, LLM caching, transparency, minimize deps, pure JS/TS over native)
- Enforce security requirements: Zod validation on all inputs, no API key leaks, path traversal prevention, parameterized SQL
- Flag anti-patterns: code duplication, global state, hardcoded values, silent error swallowing, unnecessary abstraction
- Verify frontend rules: Tailwind-only styling, TanStack ecosystem usage, API client usage, no direct package imports, no state management libraries, pure JS/TS deps only
- Run the submission checklist from Guidelines: Checklist Before Submitting

**Key sections**: Core Principles, Security Requirements, Anti-Patterns to Avoid, Checklist Before Submitting

---

## Pipeline Developer

**Role**: Develops and maintains extraction and generation pipeline functions in `packages/pipeline/`.

**Responsibilities**:
- Write pure pipeline functions — no side effects, all dependencies passed as parameters
- Follow entity versioning: create new versions for ordinary edits. Only the explicit, scoped, audited recovery transaction may restore independently proven exact bytes to a damaged historical row; never use it for arbitrary historical edits.
- Use the cached LLM client from `@adt/llm` for all LLM calls — never call LLM APIs directly
- Define all data structures as Zod schemas in `packages/types/`
- Implement progress reporting using the standard `{ step, percent }` pattern
- Co-locate tests with source files (`*.test.ts`), maintain 80%+ coverage
- Keep functions composable and independently testable

**Key sections**: Core Principles, Pipeline Functions, Entity Versioning, LLM Call Caching, Type Safety & Validation, Testing Requirements

---

## Frontend Developer

**Role**: Builds and maintains the React SPA in `apps/studio/`.

**Responsibilities**:
- Follow the standard component structure (hooks → query → mutations → handlers → render)
- Use **TanStack Query** for all server state — no raw `useEffect` for data fetching
- Use **TanStack Router** for type-safe navigation (`useNavigate`, `Link`, typed params/search)
- Use **TanStack Table** for data tables (headless + Tailwind UI)
- Use **TanStack Form** with Zod adapter for form validation
- Use Tailwind utility classes exclusively — no CSS modules, styled-components, or custom CSS files
- All API calls through `apps/studio/src/api/client.ts` + TanStack Query — never use `fetch()` directly
- UI-only state via `useState`; server state via TanStack Query — no Redux, Zustand, or global stores
- Implement loading states, error states, and optimistic updates via Query mutations
- Check for existing reusable components before creating new ones

**Key sections**: Frontend Development, Component Structure, State Management Rules, Styling with Tailwind, API Client Usage, Navigation, Forms, Tables

---

## Security Auditor

**Role**: Audits code for security vulnerabilities and compliance with security standards.

**Responsibilities**:
- **Input validation**: Verify ALL user input is validated with Zod schemas before use
- **API key handling**: Ensure keys are header-based, never logged, never in URLs, never in client bundles, never in error messages
- **Path traversal**: Verify all file path operations validate and normalize against a base directory
- **SQL injection**: Confirm all database queries use parameterized statements, never string concatenation
- **XSS**: Check for unsafe `dangerouslySetInnerHTML` usage, verify sanitization with DOMPurify where HTML rendering is required
- **CORS**: Verify explicit origin lists, flag wildcard (`*`) origins
- **Dependencies**: Flag new dependencies that lack justification, check for known vulnerabilities
- **Storage**: Verify atomic read-modify-write with locking for concurrent operations

**Key sections**: Security Requirements, API Key Handling, Input Validation, Path Traversal Prevention, SQL Injection Prevention, XSS Prevention, CORS Configuration
