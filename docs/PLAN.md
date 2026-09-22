# Development plan

The work is split into small, independently completable tasks. Tasks in the same stage have no
dependency on each other and can run in parallel; the API contract in [`api.md`](api.md) is what
makes that possible, so it is frozen before any code is written.

Legend: **⇉** runs in parallel with its siblings · **⏱** rough budget within the 2–4 h envelope.

---

## S0 — Foundation (done)

| # | Task | Deliverable |
| --- | --- | --- |
| S0.1 | Repository, prompts log, project memory | `CLAUDE.md`, `prompts/`, `.gitignore` |
| S0.2 | Freeze the API contract | `docs/api.md` |
| S0.3 | Record design decisions as they are taken | `docs/DESIGN.md` (living document) |
| S0.4 | This plan | `docs/PLAN.md` |

**Exit criteria.** Contract agreed; no code written before it is.

---

## S1 — Backend ⇉ ⏱ ~50 min

| # | Task | Done when |
| --- | --- | --- |
| S1.1 | `go.mod`, folder skeleton, `cmd/server` entrypoint with env-configured port, `http.Server` timeouts and graceful shutdown | `go build ./...` passes |
| S1.2 | `internal/calculator`: `Operation` type + `OpAdd`/`OpSubtract`/`OpMultiply`/`OpDivide` constants, pure functions (`Add`, `Subtract`, `Multiply`, `Divide`), sentinel errors, registry with arity, `Evaluate` dispatcher with the non-finite result check | Domain compiles with no import outside `math`/`errors`/`fmt` |
| S1.3 | `internal/httpapi`: router (`/api/v1/calculate`, `/api/v1/health`, 404/405), request/response DTOs, body size limit, strict JSON decoding, one `domainErrorToHTTP` mapping function | Every row of the error catalogue reachable |
| S1.4 | Middleware: `Recover` (panic → `INTERNAL_ERROR` + log), `RequestLog`, `CORS` | A handler that panics returns structured JSON 500 |
| S1.5 | Tests: table-driven per pure function, dispatcher tests, `httptest` tests for every catalogue entry, middleware test | `go test ./...` green; `go vet` clean; `gofmt` clean |

**Depends on:** S0.2 only.

---

## S2 — Frontend ⇉ ⏱ ~70 min

| # | Task | Done when |
| --- | --- | --- |
| S2.1 | Vite + React + TypeScript (strict) scaffold, Vitest + RTL + v8 coverage configured, dev-server proxy for `/api` | `npm run dev` and `npx vitest run` work |
| S2.2 | `lib/api.ts`: typed client, `ApiError { code, message }`, maps HTTP errors and network failures into the same shape | Client usable with the API stubbed |
| S2.3 | `hooks/useCalculator`: reducer with `entry`, `accumulator`, `operator`, `overwriteEntry`, `history`, `error`, `pending`; digit/decimal/operator/equals/clear actions; operator chaining resolves the pending operation | Reducer is a pure function, fully testable without rendering |
| S2.4 | `components/`: `Display` (history + expression + inline error), `Keypad`, `CalcButton`; responsive layout, comfortable tap targets, no text input on mobile | Usable at 360 px and on desktop |
| S2.5 | `hooks/useKeyboard`: key presses dispatch the same reducer actions as the buttons | Typing and clicking are indistinguishable in behaviour |
| S2.6 | Number formatting (~12 significant digits, trimmed) | `0.1 + 0.2` displays `0.3` |
| S2.7 | Tests: reducer, api client (all error codes + network failure), components (result rendering, inline error, keyboard) | `npx vitest run --coverage` green |

**Depends on:** S0.2 only. Built against the contract with the API mocked — no running backend
needed.

---

## S3 — Containers ⇉ ⏱ ~30 min

| # | Task | Done when |
| --- | --- | --- |
| S3.1 | `backend/Dockerfile`: multi-stage, pinned Go, static binary, minimal final image, non-root user | Image builds and serves |
| S3.2 | `frontend/Dockerfile`: multi-stage, pinned Node build → `nginx:alpine` serving `dist` with `/api` reverse-proxied to the backend | Image builds and serves |
| S3.3 | `compose.yaml`: both services, backend healthcheck on `/api/v1/health`, frontend `depends_on: service_healthy`, one exposed port | `docker compose up` serves the working app |
| S3.4 | `scripts/coverage.sh`: runs both test suites in containers and writes the reports | Coverage reproducible with no local toolchain |

**Depends on:** S0.2 (ports and paths only), not on S1/S2 source.

---

## S4 — Integration ⏱ ~20 min

| # | Task | Done when |
| --- | --- | --- |
| S4.1 | Bring the stack up and exercise it end to end: each operation, `12 ÷ 0`, overflow, chained operations, keyboard, mobile viewport | Manual smoke checklist passes |
| S4.2 | Review both layers against the non-functional bar in `CLAUDE.md` §3 | No `any`, no dead code, `gofmt`/`go vet` clean, names consistent |

**Depends on:** S1, S2, S3.

---

## S5 — Deliverables ⏱ ~30 min

| # | Task | Done when |
| --- | --- | --- |
| S5.1 | Generate and commit coverage reports for both layers | Reports in `docs/coverage/` |
| S5.2 | README: setup, how to run (Docker first, native second), API examples, design decisions, assumptions, coverage summary | A stranger can run it from the README alone |
| S5.3 | Update `prompts/` with every prompt used, translated | Log complete and chronological |
| S5.4 | Final pass on `docs/DESIGN.md` | Every decision taken is recorded |

**Depends on:** S4.

---

## S6 — Backlog (started after S5 closed, in this order)

1. `power`, `sqrt`, `percent` — **both layers**: one registry entry, one pure function and one test
   table each in Go, plus the matching buttons and reducer actions in the UI. Cheap by construction
   (see `DESIGN.md` D2/D4), but it stays out of the mandatory scope until S5 is done.
2. GitHub Actions workflow running both test suites and publishing coverage on every push.
3. Server-side expression parser as an additive `POST /api/v1/evaluate`, enabling precedence and
   parentheses (`DESIGN.md` D1).

Nothing here starts before S5 is complete. An unfinished extra is worse than an absent one.
