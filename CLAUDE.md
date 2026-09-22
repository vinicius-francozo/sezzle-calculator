# sezzle-calculator — project memory

Full-stack calculator built for the Sezzle technical assessment.
Every change in this repository must comply with this document. When a decision is not covered
here, prefer the option that a reviewer would call **simpler, more readable and more idiomatic**.

**Time budget: 2–4 hours.** Correctness, clarity and maintainability come before extra features.
Anything that does not fit goes to the backlog instead of being half-built.

---

## 1. Stack

| Layer | Choice |
| --- | --- |
| Backend | Go — REST microservice, standard library `net/http` first; a third-party router only if it earns its place |
| Frontend | React + Vite + TypeScript (strict) |
| Backend tests | `go test` + `go tool cover` |
| Frontend tests | Vitest + React Testing Library, `--coverage` (v8) |
| Optional | Dockerfile / docker-compose running frontend + backend together |

**Go toolchain runs through Docker.** There is no Go installed on the development machine, so every
`go` command is executed inside the official image (`golang:1.26-alpine`) with the repository
mounted. This is a development convenience only — the code itself must stay a plain, standard Go
module that a reviewer can `go build`/`go test` natively without Docker.

```bash
# run any go command from the repository root
docker run --rm -v "$PWD/backend":/app -w /app golang:1.26-alpine go test ./...
```

---

## 2. Functional requirements

### 2.1 Operations

**Mandatory (in scope):** addition, subtraction, multiplication, division.

**Optional (backlog — only if the time budget allows):** exponentiation, square root, percentage.
Backlog items are implemented in that order and only after everything mandatory is done, tested
and documented.

### 2.2 Frontend (React)

- Desktop-calculator-style UI: clickable buttons for digits and operations, a display showing the
  current expression and the result.
- **Keyboard input is supported on desktop**: the user may type digits and operators
  (`0-9 . + - * / ( ) Enter Backspace Escape`) instead of clicking.
- **Mobile**: same behaviour through buttons only — no free-text typing affordance. Layout is
  responsive; buttons must stay comfortably tappable.
- Input validation and error handling live in the frontend too (see §4).
- The frontend consumes the backend API to compute results — arithmetic is **not** duplicated in
  the client. The client validates *shape* (is this expression well formed?), the server owns
  *semantics* (what is the result, is it defined?).

### 2.3 Backend (REST API)

- Expose endpoints for the calculator operations, returning **JSON** for both success and error.
- Validate input and handle edge cases: division by zero, invalid/missing data, non-numeric
  values, overflow, `NaN`/`Inf` results, malformed JSON, oversized payloads.
- No generic HTTP 500 as a catch-all, and **no panic escaping a handler**: a recovery middleware
  must convert any unexpected panic into a structured JSON error response and a log line.

---

## 3. Non-functional requirements (the bar reviewers will apply)

1. **Clean, readable, idiomatic code on both layers.** This is the top priority of the assessment.
   - Go: small packages with a single responsibility; domain logic (the calculator) has **zero**
     knowledge of HTTP; errors returned as values with `errors.Is`/sentinel or typed errors, never
     strings compared by content; exported identifiers documented with a comment starting with the
     identifier's name; `gofmt`/`go vet` clean; no premature abstraction.
   - TypeScript/React: strict mode, no `any`; small components with one job; state logic extracted
     into hooks or a reducer instead of a pile of `useState`; no business logic inside JSX;
     meaningful names over comments; no dead code.
2. **Unit tests covering key functionality on both layers**, including error paths and edge cases,
   not only the happy path.
3. **Documentation**: setup instructions, how to run each layer, API examples, design decisions and
   assumptions — all in the README.
4. **Coverage report** included in the deliverables (see §6).
5. Consistency beats cleverness: one style, applied everywhere.

---

## 4. Error handling contract

Validation happens **in both layers** — deliberately, for security (the API can never trust a
client) and for UX (the user gets immediate feedback). It is not accidental duplication: the layers
validate different things, as described in §2.2.

### 4.1 Frontend behaviour (modelled on the GNOME/desktop calculator)

- Errors are shown **inline, below the expression**, as plain readable text — never a modal, never
  an alert, never a silent failure.
- The offending expression stays on screen so the user can fix it; previous history remains visible.
- Reference messages: `Division by zero is undefined`, `Overflow: the result could not be
  calculated`.
- Typical client-side rejections: malformed expression, unbalanced parentheses, operator without an
  operand, multiple decimal points, empty input.
- Network/server failures degrade gracefully with a readable message; the UI never gets stuck in a
  loading state.

### 4.2 API error format

Every error response is JSON with the same shape, an accurate HTTP status and a stable machine
code plus a human-readable message:

```json
{ "error": { "code": "DIVISION_BY_ZERO", "message": "Division by zero is undefined" } }
```

| Situation | Status |
| --- | --- |
| Valid request, computable result | 200 |
| Malformed JSON, missing/invalid field, unsupported operation, division by zero, non-finite result | 400 |
| Unknown route | 404 |
| Wrong method on a known route | 405 |
| Genuinely unexpected failure (recovered panic) | 500 — structured JSON, still never a bare stack trace |

Domain rules such as division by zero are **client errors (400)**, not server errors: the request
was understood and rejected on its merits.

---

## 5. Architecture

```
/backend      Go microservice
  /cmd/server           entrypoint: config, wiring, graceful shutdown
  /internal/calculator  pure domain: operations, validation, domain errors (no HTTP)
  /internal/httpapi     handlers, routing, request/response DTOs, middleware (recover, CORS, logging)
/frontend     React + Vite + TypeScript
  /src/components       presentational UI (display, keypad, buttons)
  /src/hooks            calculator state and keyboard handling
  /src/lib              API client, expression validation, formatting
  /src/types            shared types
/prompts      every prompt used to build this project (English)
```

Rules:
- The domain package is testable without spinning up a server; handlers are testable with
  `httptest`.
- No global mutable state; dependencies are passed explicitly.
- The API base URL is configurable in the frontend via a Vite env var (`VITE_API_BASE_URL`).

---

## 6. Testing and coverage

Commands that must work from a clean clone, and whose output goes into the deliverables:

```bash
# Backend (native)
cd backend
go test ./... -coverprofile=coverage.out
go tool cover -func=coverage.out

# Backend (no local Go toolchain — how it is run in this project)
docker run --rm -v "$PWD/backend":/app -w /app golang:1.26-alpine \
  sh -c 'go test ./... -coverprofile=coverage.out && go tool cover -func=coverage.out'

# Frontend
cd frontend
npx vitest run --coverage
```

What must be covered:
- **Backend**: each operation, division by zero, invalid payloads, unsupported operation, malformed
  JSON, non-finite results, 404/405, and the panic-recovery middleware.
- **Frontend**: expression validation, the calculator state hook (digit entry, operators, clear,
  backspace), rendering of results and of inline error messages, keyboard input, and API client
  error mapping (the API is mocked — no network in unit tests).

A coverage summary is committed to the repository and referenced from the README.

---

## 7. Deliverables checklist

- [ ] Git repository with `backend/` and `frontend/`
- [ ] README: setup, how to run each layer, API call examples, design decisions and assumptions
- [ ] Unit tests on both layers
- [ ] Coverage report committed and linked from the README
- [ ] `prompts/` with every prompt used, in English
- [ ] Optional: Dockerfile / compose running both layers together
- [ ] Optional backlog: exponentiation, square root, percentage

---

## 8. Working conventions

- Conventional-commit-style messages (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), imperative mood.
- Commit in small, self-contained units — one logical change per commit.
- **All repository content is written in English** (code, comments, docs, commit messages), even
  though the working conversation is in Brazilian Portuguese.
- Run the tests before each commit; never commit a red suite.
