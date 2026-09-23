# Calculator — React + Go

[![CI](https://github.com/vinicius-francozo/sezzle-calculator/actions/workflows/ci.yml/badge.svg)](https://github.com/vinicius-francozo/sezzle-calculator/actions/workflows/ci.yml)

A full-stack calculator: a React (TypeScript) frontend consuming a Go REST microservice that
performs the arithmetic. Built as a technical assessment, with the emphasis on clean, readable and
idiomatic code, meaningful tests and honest documentation rather than on feature count.

```
┌──────────────────────────┐        POST /api/v1/calculate        ┌──────────────────────────┐
│  React + Vite + TS       │ ──────────────────────────────────▶  │  Go microservice         │
│  keypad, keyboard, state │        { operation, operands }       │  pure domain + HTTP      │
│  validates the *form*    │ ◀──────────────────────────────────  │  owns the *semantics*    │
└──────────────────────────┘        { result } | { error }        └──────────────────────────┘
```

---

## Quick start

**The only requirement is Docker.** No Go, no Node, no version juggling.

```bash
git clone https://github.com/vinicius-francozo/sezzle-calculator.git
cd sezzle-calculator
docker compose up --build
```

Then open **<http://localhost:3000>**.

The frontend is served by nginx, which also reverse-proxies `/api` to the backend, so both live on
one origin and one port. The backend is not published to the host; it is reachable only from inside
the compose network and through that proxy.

Stop with `Ctrl-C`, or `docker compose down`.

### Running each layer natively (optional)

Needs Go 1.26+ and Node 22+.

```bash
# backend — serves on :8080
cd backend
go run ./cmd/server          # PORT=9000 go run ./cmd/server to change the port

# frontend — serves on :5173, proxies /api to localhost:8080
cd frontend
npm install
npm run dev
```

The composed stack uses port 3000 precisely so it can run side by side with a natively-running
backend on 8080.

---

## Using the API

One endpoint performs one operation. The full contract, including every error code, is in
[`docs/api.md`](docs/api.md).

```bash
# through the composed stack
curl -s localhost:3000/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"add","operands":[2,3]}'
# {"operation":"add","operands":[2,3],"result":5}
```

```bash
# running the backend natively
curl -s localhost:8080/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"divide","operands":[12,4]}'
# {"operation":"divide","operands":[12,4],"result":3}
```

| Operation | Operands | Meaning |
| --- | --- | --- |
| `add` `subtract` `multiply` `divide` | 2 | the four basics |
| `power` | 2 | `a ^ b` |
| `percent` | 2 | `a% of b` — `15 % 200 =` is `30` |
| `sqrt` | 1 | `√a` — the one unary operation |

Every error, without exception, uses one envelope with a stable machine code and a message safe to
show to a user:

```bash
curl -s -i localhost:3000/api/v1/calculate \
  -H 'Content-Type: application/json' \
  -d '{"operation":"divide","operands":[12,0]}'
# HTTP/1.1 400 Bad Request
# {"error":{"code":"DIVISION_BY_ZERO","message":"Division by zero is undefined"}}
```

| Situation | Status | Code |
| --- | --- | --- |
| Division by zero | 400 | `DIVISION_BY_ZERO` |
| Square root of a negative number | 400 | `UNDEFINED_RESULT` |
| Result is not a finite number | 400 | `OVERFLOW` |
| Missing field, wrong operand type or count | 400 | `VALIDATION_ERROR` |
| Operation not supported | 400 | `UNSUPPORTED_OPERATION` |
| Body malformed, not an object, unknown field, over 4 KiB | 400 | `INVALID_JSON` |
| Unknown route | 404 | `NOT_FOUND` |
| Wrong method (response carries `Allow`) | 405 | `METHOD_NOT_ALLOWED` |
| Unexpected failure, recovered from a panic | 500 | `INTERNAL_ERROR` |

Domain rejections such as division by zero are **client errors**, not server errors: the request
was understood and refused on its merits. `GET /api/v1/health` returns `{"status":"ok"}` and backs
the container healthcheck.

---

## Tests and coverage

```bash
./scripts/coverage.sh          # both suites, in containers, no local toolchain
./scripts/smoke-test.sh        # exercises the running stack through the proxy
```

`smoke-test.sh` checks the contract end to end against whatever is running — it takes a
`BASE_URL` override and defaults to `http://localhost:3000`. CI runs the same script, so the
check a reviewer runs by hand is the check that gates the build.

Committed reports: [`docs/coverage/backend.txt`](docs/coverage/backend.txt) ·
[`docs/coverage/frontend.txt`](docs/coverage/frontend.txt)

| Layer | Result | Coverage |
| --- | --- | --- |
| Backend | `go test ./...` green, race detector clean | **97.2%** of statements — `internal/calculator` and `internal/httpapi` both **100%**; the remainder is `main()` |
| Frontend | 135 tests green | **100%** statements, functions and lines; **99.21%** branches |

Natively, if you have the toolchains:

```bash
cd backend  && go test ./... -coverprofile=coverage.out && go tool cover -func=coverage.out
cd frontend && npm run coverage
```

The one uncovered frontend branch is a `null` guard on a ref that TypeScript requires and the
runtime cannot reach; a non-null assertion would have bought the last 0.79% by suppressing the
type-checker, which the project's own rules forbid. The threshold is set at 98% with that margin
documented, rather than at a round number that hides a regression budget.

**Coverage was not the bar.** Every track was also checked by mutating the source and re-running
the suite — deleting a line and asking whether anything fails. That is what caught a middleware
that was tested in isolation but not in the assembled chain, a graceful shutdown whose test
asserted the return value instead of the closed listener, and a precision fix that was pinned on
one of its two code paths.

---

## Design decisions

The full log, with the reasoning and what was rejected, is in [`docs/DESIGN.md`](docs/DESIGN.md).
The ones that shape everything else:

**Step-by-step binary operations, not a server-side expression parser.** The UI behaves like a
desktop calculator in basic mode and sends one operation per request. A tokenizer with operator
precedence would have roughly tripled the backend and its test surface to deliver nothing the
requirements ask for.

**One endpoint, with the operation as data.** `POST /api/v1/calculate` takes
`{"operation": "...", "operands": [...]}` instead of one route per operation. The operation is a
value, not a resource: one handler, one validation path, one table-driven test. `operands` is an
array so arity belongs to the operation and a future unary operation needs no contract change.

**The domain knows nothing about HTTP.** `internal/calculator` imports only `errors`, `fmt` and
`math`. One small pure function per operation, plus a thin dispatcher that resolves the operation,
validates arity and checks *once* that the result is finite. That granularity is what makes the
tests good: each function is tested with a trivial table, and the dispatcher is tested for what
only it does.

**Validation lives in both layers, doing different jobs.** The client validates *form* — a second
decimal point is ignored, an operator replaces a pending one, `=` on an incomplete expression does
nothing. The server owns *semantics* and trusts nothing. So `12 ÷ 0` is deliberately **not** blocked
by the UI: it is sent, rejected, and the message the API returned is what appears on screen. The
rule lives in one place and the integration is exercised for real.

**Errors are inline, and the failed expression survives.** Modelled on the desktop calculator: the
message appears under the expression, the history above is untouched, and nothing is a modal or an
alert. Server rejections, network failures and a 10-second request timeout all reach the UI through
a single error channel.

**Display formatting never becomes arithmetic.** An entry carries both its display text and the
exact number it denotes, so chaining uses the full-precision value. Without that, `1 ÷ 3 =` followed
by `× 3 =` gives `0.999999999999`; with it, `1`.

**Docker Compose is the primary way to run this**, not an afterthought — the person evaluating it
should not need a Go toolchain. Both runtime images are non-root, all versions are pinned, and the
backend image is 9.5 MB.

---

## Assumptions

- **`float64`, not decimal.** A calculator is not a ledger. Results are accurate to double
  precision, and the display trims to 12 significant digits so representation noise
  (`0.1 + 0.2 = 0.30000000000000004`) stays hidden, exactly as a desktop calculator does. Money
  would have called for the opposite decision.
- **No operator precedence and no parentheses**, which follows from the step-by-step model:
  `2 + 3 × 4` evaluates left to right to `20`, like a physical calculator, not `14`.
- **History is per-session and in-memory** — last 10 successful calculations, no persistence, no
  history endpoint.
- **The keyboard maps exactly the actions that exist as buttons** (`0-9 . + - * /`, `Enter`/`=`,
  `Escape`, `Backspace` for undo, `^` for power, `%` for percent, `@` for square root as the Windows
  calculator binds it, and `,` as an alias for `.` since that is the numpad separator on ABNT2,
  German and French layouts). Every mapped key has a button and no key exists without one, so the
  two input methods can never drift apart. On mobile
  there is no text input anywhere, so the on-screen keyboard is never summoned.
- **CORS is permissive on the backend.** It is irrelevant in the composed stack, where everything is
  same-origin, and exists for whoever runs the two layers natively on different ports.

## Known limitations

Recorded rather than hidden; all were found in review and judged not worth the cost before the
mandatory scope was complete.

- An operand below `1e-6` is typed as `0.0000001` but redisplayed as `1e-7` once it becomes the
  accumulator — same value, different notation.
- If the 10-second timeout fires while the response body is still streaming, the user sees the
  generic unexpected-response message instead of the timeout one. Narrow race; both are readable.
- The history auto-scrolls to the newest entry even if the user had scrolled up to read an older one.
- `sqrt(-1)` and `(-8)^(1/3)` are the same class of failure — an operation undefined for its
  operands — but the contract gives them different codes (`UNDEFINED_RESULT` and `OVERFLOW`),
  because the `UNDEFINED_RESULT` row names exactly one producer. A contract-level fix, recorded in
  [`docs/DESIGN.md`](docs/DESIGN.md) D26 rather than smuggled.
- `^` is a dead key on ABNT2, German and French layouts and `@` needs AltGr on German and French,
  so those two keyboard shortcuts degrade to button-only there.

---

## Repository layout

```
backend/
  cmd/server/           entrypoint: config, timeouts, graceful shutdown
  internal/calculator/  pure domain — operations, dispatcher, sentinel errors (no HTTP)
  internal/httpapi/     routing, DTOs, one error-to-status mapping, middleware
frontend/
  src/components/       Display, Keypad, CalcButton
  src/hooks/            useCalculator (the reducer), useKeyboard
  src/lib/              API client, number formatting
docs/
  api.md                the frozen API contract
  DESIGN.md             every engineering decision, with its reasoning
  PLAN.md               task breakdown and definition of done
  coverage/             committed coverage reports
prompts/                every prompt used to build this, including the agent briefs
scripts/coverage.sh     runs both suites in containers
compose.yaml
```

## How this was built

The assessment invites the use of AI tooling and asks for the prompts. All of them are in
[`prompts/`](prompts/), including the verbatim briefs given to each agent.

The work ran as parallel tracks — backend, frontend and containers first, then the optional
operations and CI — each in its own git worktree and branch with a disjoint file scope, and each
merged only after passing a code review by a *different* agent that ran the suite, mutated the
source and checked the result against the frozen contract. Findings went to a third agent scoped
strictly to fixing them, then back to review. The merge history keeps each track as a unit.

Reviews were not rubber stamps. They caught an arithmetic bug where chaining from the rounded
display made `1 ÷ 3 × 3` give `0.999999999999`; a panic-recovery middleware that could be deleted
from the chain with the suite still green; a fix that was pinned on only one of its two code paths;
a coverage report that would have been committed full of ANSI escapes; and a layout defect that had
survived five reviews because everyone had checked for *absence of error* — no overflow, nothing
clipped — when the requirement was *adequacy*: the calculator was rendering 159 px wide with 34 px
keys on a phone. Two findings were rejected with evidence instead of implemented.
