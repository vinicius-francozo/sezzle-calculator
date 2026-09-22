# Prompt 02 — Agent briefs

The implementation was produced by a small pipeline of parallel agents, each working in its own
git worktree and branch, with every branch reviewed by a separate review agent before being merged.
The briefs below are the actual prompts sent to those agents, reproduced verbatim.

Pipeline per track: **dev agent → review agent → (findings) → fix agent → review agent → … → merge**.

---

## Shared context (prepended to every dev brief)

> You are implementing one track of a full-stack calculator built as a technical assessment. The
> assessment is graded primarily on **clean, readable and idiomatic code**, unit tests on both
> layers, and documentation — not on feature count. The total budget for the whole project is 2–4
> hours, so do not gold-plate.
>
> **Read these before writing any code** (they are in your worktree):
> - `CLAUDE.md` — project memory: requirements, quality bar, conventions. It is binding.
> - `docs/api.md` — the **frozen** API contract. Do not change it. If you believe it is wrong,
>   report it instead of deviating.
> - `docs/DESIGN.md` — every design decision already taken, with its rationale. Follow them.
> - `docs/PLAN.md` — the task breakdown and the definition of done for your track.
>
> **Rules**
> - Work only inside the worktree path given below, only on the files listed in your scope. Another
>   agent owns every other path — touching it causes a merge conflict.
> - Never touch `docs/`, `CLAUDE.md`, `prompts/`, or another track's files.
> - Commit in small logical units on your branch, conventional-commit style (`feat:`, `test:`,
>   `docs:`, `chore:`), imperative mood. **Never push. Never merge. Never rebase.**
> - Everything in the repository is written in English.
> - Leave the branch with tests green. A red suite is not "done".
>
> **Report back**: files created, the exact commands to run the tests and their result, and any
> deviation from the contract or the design decisions with the reason for it.

---

## Track A — Backend (Go) → branch `feat/backend`

> **Worktree:** `/home/vinicius/sezzle-calculator-backend` (branch `feat/backend`, already checked
> out). **Scope:** `backend/**`, except `backend/Dockerfile` and `backend/.dockerignore`, which
> belong to another agent.
>
> There is **no Go toolchain on this machine**. Run every Go command through Docker, from the
> worktree root:
>
> ```bash
> docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e GOCACHE=/tmp/.gocache \
>   -v "$PWD/backend":/app -w /app golang:1.26-alpine go test ./...
> ```
>
> Build the microservice described in `docs/PLAN.md` S1:
>
> - `backend/go.mod` — module `github.com/vinicius-francozo/sezzle-calculator/backend`, Go 1.26,
>   **standard library only** unless you can justify a dependency in your report.
> - `backend/cmd/server/main.go` — port from the `PORT` env var (default 8080), `http.Server` with
>   read/write/idle timeouts, graceful shutdown on SIGINT/SIGTERM, structured logging with `log/slog`.
> - `backend/internal/calculator/` — the pure domain, importing nothing beyond `errors`, `fmt`,
>   `math`:
>   - `type Operation string` with constants `OpAdd`, `OpSubtract`, `OpMultiply`, `OpDivide` whose
>     values are exactly the strings in `docs/api.md`.
>   - Pure functions: `Add(a, b float64) float64`, `Subtract`, `Multiply` (no error return — they
>     cannot fail on their own terms), and `Divide(a, b float64) (float64, error)` returning
>     `ErrDivisionByZero` when `b == 0`.
>   - Sentinel errors: `ErrDivisionByZero`, `ErrUnsupportedOperation`, `ErrInvalidOperandCount`,
>     `ErrOverflow` (and `ErrUndefinedResult` only if you need it now — `sqrt` is backlog, do not
>     implement it).
>   - A registry `map[Operation]operation`, where the unexported `operation` struct carries the
>     arity and an adapter applying the pure function to the operand slice. This map is the single
>     point of extension.
>   - `Evaluate(op Operation, operands []float64) (float64, error)` — resolves the operation,
>     validates arity, delegates, and checks **once** that the result is finite, returning
>     `ErrOverflow` for `±Inf`/`NaN`. This check must not be duplicated inside the pure functions.
> - `backend/internal/httpapi/` — transport:
>   - Router for `POST /api/v1/calculate` and `GET /api/v1/health`, plus 404 for unknown routes and
>     405 for a known route with the wrong method.
>   - Request/response DTOs matching `docs/api.md` exactly, including echoing the request back on
>     success.
>   - Strict JSON decoding (`DisallowUnknownFields`), a request body size limit, and rejection of
>     non-finite operands.
>   - **One** function translating a domain error into `(httpStatus, errorCode, message)`, using
>     `errors.Is`. Never compare error strings.
>   - Middleware: `Recover` (any panic becomes a structured `INTERNAL_ERROR` 500 plus a log line —
>     never a stack trace to the client), `RequestLog`, and a permissive `CORS` for the reviewer who
>     runs the two layers natively on different ports.
> - Tests: table-driven tests for each pure function; dispatcher tests for unknown operation, wrong
>   arity and overflow; `httptest` tests covering **every row** of the error catalogue in
>   `docs/api.md` — including malformed JSON, unknown field, wrong arity, unsupported operation,
>   division by zero, overflow, 404, 405 — and a test proving a panicking handler returns structured
>   JSON 500.
>
> **Definition of done:** `go build ./...`, `go vet ./...` and `go test ./...` all pass, and
> `gofmt -l .` prints nothing.

---

## Track B — Frontend (React + Vite + TypeScript) → branch `feat/frontend`

> **Worktree:** `/home/vinicius/sezzle-calculator-frontend` (branch `feat/frontend`, already checked
> out). **Scope:** `frontend/**`, except `frontend/Dockerfile`, `frontend/.dockerignore` and
> `frontend/nginx.conf`, which belong to another agent.
>
> Node 22 and npm are installed natively — use them directly, no Docker needed for this track.
>
> Build the UI described in `docs/PLAN.md` S2. The backend does **not** exist yet from your point of
> view: build against `docs/api.md` and mock the API in every test.
>
> - Vite + React + TypeScript scaffold in `frontend/`, `strict: true`, **zero `any`**. Vitest +
>   React Testing Library + v8 coverage. Vite dev server proxies `/api` to `http://localhost:8080`.
>   `VITE_API_BASE_URL` defaults to `/api`.
> - `src/lib/api.ts` — typed client for `POST /api/v1/calculate`. HTTP errors and network failures
>   both collapse into one `ApiError { code, message }`, so the UI has a single error channel.
> - `src/lib/format.ts` — display formatting: ~12 significant digits, trailing zeros trimmed, so
>   `0.1 + 0.2` shows `0.3`.
> - `src/hooks/useCalculator.ts` — **all** calculator state in one reducer. State: `entry`,
>   `accumulator`, `operator`, `overwriteEntry`, `history`, `error`, `pending`. Behaviour, like a
>   real calculator:
>   - digits and `.` build `entry`; a second `.` is ignored; an operator pressed twice in a row
>     replaces the pending operator;
>   - pressing an operator when an operation is already pending **resolves it first**, so the running
>     total stays on screen;
>   - `=` computes and puts the result in `accumulator`; a digit pressed right after `=` starts a
>     fresh entry, an operator right after `=` chains from the result;
>   - `C` clears everything, including history and error;
>   - `=` with an incomplete expression does nothing; the UI never sends an invalid request.
>   - The reducer must be a **pure function**, exported and testable without rendering. Keep the
>     async API call outside it.
> - `src/components/` — `Display` (history list, current expression, inline error message directly
>   under the expression), `Keypad`, `CalcButton`. Errors are inline text, never modals or alerts,
>   and the failed expression stays on screen (see `DESIGN.md` D8). Only successful calculations
>   enter the history (last 10).
> - `src/hooks/useKeyboard.ts` — key presses dispatch the **same** reducer actions as the buttons:
>   `0-9`, `.`, `+ - * /`, `Enter`/`=`, `Escape`. No second implementation of the logic, and no
>   free-text input element anywhere (mobile must never summon a keyboard).
> - Responsive: usable at 360 px width with comfortable tap targets, and on desktop. Plain CSS is
>   fine — no UI framework.
> - `=` is disabled while a request is in flight and a stale response is discarded; the UI never
>   gets stuck loading.
> - Tests: the reducer (most of the logic, no rendering), the API client against mocked responses
>   including every error code and a network failure, and components for result rendering, inline
>   error display and keyboard input.
>
> **Definition of done:** `npx tsc --noEmit` clean, `npx vitest run --coverage` green, no `any`, no
> dead code.

---

## Track C — Containers → branch `feat/containers`

> **Worktree:** `/home/vinicius/sezzle-calculator-containers` (branch `feat/containers`, already
> checked out). **Scope, and nothing else:** `compose.yaml`, `backend/Dockerfile`,
> `backend/.dockerignore`, `frontend/Dockerfile`, `frontend/.dockerignore`, `frontend/nginx.conf`,
> `scripts/coverage.sh`.
>
> The backend and frontend source code are being written in parallel by other agents and are **not**
> in your worktree. Write against the contract and the standard build commands
> (`go build ./cmd/server` for a module rooted at `backend/`, `npm ci && npm run build` producing
> `frontend/dist`). You cannot run these images end to end yet — that happens at integration. Make
> them correct by construction and say in your report what you could not verify.
>
> Docker Compose is the **primary** way this project is run — assume whoever runs it has neither Go
> nor Node installed (see `CLAUDE.md` §1.1 and `DESIGN.md` D13).
>
> - `backend/Dockerfile` — multi-stage: `golang:1.26-alpine` build of a static binary
>   (`CGO_ENABLED=0`), final stage minimal (`gcr.io/distroless/static` or `scratch` with CA certs),
>   non-root user, `EXPOSE 8080`.
> - `frontend/Dockerfile` — multi-stage: `node:22-alpine` running `npm ci && npm run build`, then
>   `nginx:alpine` serving `dist`.
> - `frontend/nginx.conf` — serves the SPA and reverse-proxies `/api` to the backend service, so
>   frontend and API are same-origin and CORS is irrelevant in the composed stack (`DESIGN.md` D14).
> - `compose.yaml` — two services; backend healthcheck on `GET /api/v1/health`; frontend
>   `depends_on: { backend: { condition: service_healthy } }`; a single published port `8080` for
>   the user. No version key (it is obsolete). Pin image tags.
> - `.dockerignore` files that actually keep build context small (`node_modules`, `dist`,
>   `coverage`, `.git`).
> - `scripts/coverage.sh` — POSIX `sh`, `set -eu`, runs both suites in containers with no local
>   toolchain required, writes the Go coverage function report and the Vitest coverage summary under
>   `docs/coverage/` (create the directory, do not commit generated reports from this branch — the
>   orchestrator commits them at the deliverables stage). Run Docker with
>   `-u "$(id -u):$(id -g)"` so generated files are not root-owned.
>
> **Definition of done:** `docker build` succeeds for any stage that does not require the other
> tracks' source, `compose.yaml` and `scripts/coverage.sh` are syntactically valid
> (`docker compose config`, `sh -n`), and every version is pinned.

---

## Review brief (one per round, per track)

> You are reviewing one track of a full-stack calculator built as a technical assessment, graded
> primarily on **clean, readable and idiomatic code** and on tests that cover error paths, not just
> happy paths.
>
> **Worktree:** `<path>` (branch `<branch>`). Review the diff `main...<branch>`.
>
> 1. Read `CLAUDE.md`, `docs/api.md`, `docs/DESIGN.md` and the track's section of `docs/PLAN.md`
>    first — they define both the contract and the bar.
> 2. Run the `code-review` skill at **high** effort over that diff.
> 3. Beyond bugs, verify explicitly:
>    - every item of the track's **definition of done** in `docs/PLAN.md`;
>    - conformance to the frozen contract in `docs/api.md`, field by field and status by status;
>    - the non-functional bar in `CLAUDE.md` §3 — idiomatic style, no dead code, no `any`, no error
>      handling by string matching, no logic duplicated between keyboard and buttons, exported Go
>      identifiers documented;
>    - tests genuinely cover the error paths, and are not merely asserting what the implementation
>      happens to do.
> 4. **Actually run the suite** and report its real output (Go via the Docker one-liner in the dev
>    brief; frontend via `npx tsc --noEmit` and `npx vitest run --coverage`).
> 5. **Fix nothing.** Report only.
>
> End your report with a single line: `VERDICT: PASS` or `VERDICT: CHANGES REQUIRED`, followed by
> the blocking findings ordered by severity, each with file, line and a concrete failure scenario.
> Separate genuinely blocking issues from optional nitpicks — do not inflate the list.

## Fix brief (one per round, when the review requires changes)

> **Worktree:** `<path>` (branch `<branch>`). A code review of `main...<branch>` returned the
> findings below. Fix **exactly** these findings and nothing else — no refactors, no extra features,
> no scope expansion. Read `CLAUDE.md`, `docs/api.md` and `docs/DESIGN.md` first so the fixes match
> the project's conventions. Commit with `fix:` messages, leave the suite green, never push.
>
> Findings:
> `<verbatim findings from the review agent>`
