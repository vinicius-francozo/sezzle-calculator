# Design decisions

Running log of every engineering decision made while building this project, with the reasoning
behind it. It is written as we go, not reconstructed at the end, and it is the source for the
"Design decisions" section of the README.

Each entry states the decision, why it was taken, what was rejected, and what it costs.

---

## D1 — Step-by-step binary operations instead of a server-side expression parser

**Decision.** The frontend behaves like a desktop calculator in basic mode: it accumulates
`left operand → operator → right operand` and sends **one binary operation per request**. The
backend performs arithmetic only; it has no tokenizer, no operator precedence and no parentheses.

**Why.** The assessment asks for four arithmetic operations and explicitly favours correctness and
clarity over extra features within a 2–4 hour budget. An expression evaluator (tokenizer +
shunting-yard + parentheses) would roughly triple the backend code and its test surface while
adding nothing the requirements ask for. Keeping operations atomic also keeps the service honestly
"micro": it does one thing.

**Rejected.** `POST /evaluate { "expression": "12 + 3 × 2" }`.

**Consequence.** No operator precedence and no parentheses in the UI. Chained input (`2 + 3 + 4`)
is resolved left to right, evaluated one step at a time — which is exactly how a physical
calculator behaves. Upgrading to a parser later is additive: a new endpoint alongside the existing
one. Kept in the backlog (see `PLAN.md`, S6).

---

## D2 — A single `POST /api/v1/calculate` endpoint, operation as data

**Decision.** One endpoint receives `{"operation": "...", "operands": [...]}` instead of one route
per operation (`/add`, `/subtract`, …).

**Why.** The operation is a value, not a resource. One route means one handler, one decoding path,
one validation path and one table-driven test, instead of four near-identical copies of all of
them. Adding a backlog operation becomes a one-line change in the domain registry with zero
routing work.

**Rejected.** Route-per-operation, which is arguably more "RESTful" but multiplies identical code.

---

## D3 — `operands` as an array, not `a` and `b`

**Decision.** Operands travel as a JSON array; arity is a property of the operation and is
validated by the dispatcher.

**Why.** Unary operations (`sqrt`) and binary ones then share one contract, one DTO and one
validation rule. With `a`/`b`, `sqrt` would either need a second, ignored field or a second
endpoint shape.

**Cost.** Arity has to be validated explicitly, which is a handful of lines and one test case —
cheaper than a second request shape.

---

## D4 — Pure functions per operation + a thin dispatcher

**Decision.** The domain package exposes one small pure function per operation, and a single
dispatcher that validates arity, resolves the operation and delegates:

```go
// pure, obvious to test
func Add(a, b float64) float64
func Subtract(a, b float64) float64
func Multiply(a, b float64) float64
func Divide(a, b float64) (float64, error)
func Sqrt(a float64) (float64, error)   // backlog

// dispatcher: validates arity, resolves the operation, delegates
func Evaluate(op Operation, operands []float64) (float64, error)
```

**Why.** Granularity is what makes the unit tests good. Each arithmetic function is testable in
isolation with a trivial table, with no map lookup, no slice indexing and no error plumbing in the
way; the dispatcher is then tested for what only it does — unknown operation, wrong arity,
non-finite results. Testing everything through `Evaluate` alone would blur those two concerns and
make failures harder to localise.

**Naming.** The `Operation` constants are `OpAdd`, `OpSubtract`, `OpMultiply`, `OpDivide`, because
a constant named `Add` would collide with the function `Add`. This mirrors the standard library's
convention for enumerated values (`token.ADD`).

**Shape of the registry.** The dispatcher holds a `map[Operation]operation`, where `operation`
carries the arity and an adapter that applies the pure function to the operand slice. The map is
the only place that knows an operation exists — the single point of extension.

---

## D5 — Overflow and non-finite results are checked once, in the dispatcher

**Decision.** Pure functions stay pure and never guard against `±Inf`/`NaN`. `Evaluate` checks the
result once and returns `ErrOverflow` if it is not finite.

**Why.** Two reasons. The check is identical for every operation, so duplicating it in each one
would be noise; and keeping `Add` as `func(a, b float64) float64` — no error in the signature —
tells the reader truthfully that addition of two finite numbers cannot fail on its own terms.
Domain-specific impossibilities (division by zero, square root of a negative) stay in the function
that owns them, since only that function knows the rule.

**User-visible effect.** `1e308 × 10` returns `OVERFLOW` with "Overflow: the result could not be
calculated", matching the reference desktop calculator behaviour.

---

## D6 — `float64`, with display formatting, and no decimal library

**Decision.** Arithmetic uses `float64`. Results are formatted for display with ~12 significant
digits and trailing zeros trimmed.

**Why.** A calculator is not a ledger. `float64` is the natural numeric type in both Go and
JavaScript, keeps the JSON contract trivial, and avoids a dependency. The only visible artifact of
binary floating point is representation noise (`0.1 + 0.2 = 0.30000000000000004`), which the
display formatting hides — the same thing every desktop calculator does.

**Assumption, documented in the README.** Results are accurate to double precision, not to
arbitrary decimal precision. If this were a money application the decision would be the opposite
(integer minor units or `shopspring/decimal`).

---

## D7 — Validation lives in both layers, with different jobs

**Decision.** The frontend validates **form**; the backend validates **semantics**.

- Frontend: prevents malformed input at the source — two operators in a row replace each other, a
  second decimal point is ignored, `=` does nothing without a complete expression, an empty entry
  cannot be submitted.
- Backend: owns every rule about whether a result exists — division by zero, arity, unsupported
  operation, non-finite results — and trusts nothing the client sends.

**Why.** This is not accidental duplication. The API is a public surface and can never rely on its
client, while the UI must respond instantly rather than round-tripping to say "that is not a
number". They validate different things, so neither can be removed.

**Notable consequence.** `12 ÷ 0` is deliberately **not** blocked by the frontend. It is sent, the
API rejects it with `DIVISION_BY_ZERO`, and the UI renders the message the API returned. The rule
lives in exactly one place, and the integration is exercised for real rather than mocked away.

---

## D8 — Errors are inline, and the failed expression survives

**Decision.** Modelled on the GNOME/desktop calculator: the error message is rendered as plain text
directly under the expression, the offending expression stays on screen, and the calculation
history above it is untouched. No modals, no toasts, no alerts, no silent failures.

**Why.** It is the behaviour a user of any desktop calculator already expects, and it keeps the
context needed to fix the mistake visible. Reference messages: "Division by zero is undefined",
"Overflow: the result could not be calculated".

**Also covered.** Network failure and unreachable API degrade into the same inline message channel,
and the UI never stays stuck in a loading state.

---

## D9 — One error envelope for the whole API, with a stable code

**Decision.** Every non-2xx response is `{"error": {"code": "...", "message": "..."}}`, with an
accurate status. Domain rejections are `400`, not `500`. A recovery middleware converts any
unexpected panic into a structured `INTERNAL_ERROR` with a log line, so no panic ever escapes a
handler and no stack trace ever reaches a client.

**Why.** The assessment calls out generic 500s and panics explicitly. A stable `code` lets the
client branch on meaning without string matching, while `message` stays free to be reworded or
localised. Mapping domain errors to HTTP happens in exactly one function, so the transport rules
are readable in one place.

---

## D10 — Calculator state as a reducer with an accumulator, not scattered `useState`

**Decision.** All calculator state lives in one `useReducer`, including an **accumulator** holding
the previous result so it can feed the next operation, exactly like a physical calculator:

- `12 + 3 =` shows `15`; pressing `× 2 =` then computes `15 × 2`.
- Pressing a digit right after `=` starts a fresh entry instead of appending to the result.
- Chained input (`2 + 3 + …`) resolves the pending operation when the second operator is pressed,
  so the running total is always on screen.

**Why.** The behaviour is what makes it feel like a real calculator, and it costs almost nothing:
one number in state plus a flag marking whether the next digit overwrites the entry. A reducer
keeps these transitions in a single readable place; the same logic spread over six `useState`
calls is where calculator bugs live.

**Extra benefit.** The reducer is a pure function, so most of the frontend's logic is unit tested
without rendering anything.

---

## D11 — Keyboard input maps onto the same actions as the buttons

**Decision.** A `useKeyboard` hook translates key presses into the very same reducer actions the
buttons dispatch. On mobile there is no free-text input — buttons only — and no on-screen keyboard
is ever summoned.

**Why.** Zero duplicated logic: the keyboard is another way to dispatch, not a second
implementation. It also means the keyboard is covered by the same reducer tests.

**Scope note.** The key map only covers actions that exist as buttons, so button set and keyboard
stay in sync. With the current button set (digits, `.`, four operators, `C`, `=`) that means
digits, operators, `Enter`/`=` and `Escape`; there is no `Backspace` because there is no backspace
button.

---

## D12 — Calculation history in the UI

**Decision.** The display keeps a short list of previous calculations (`expression = result`) above
the current entry, like the reference screenshots. Only successful calculations enter the history;
errors stay inline and are not recorded. History is in-memory and per-session — it is not
persisted and there is no history endpoint.

**Why.** It costs an array in the reducer and one small presentational component, and it is what
makes the UI read as a finished product instead of a form with a submit button. Persisting it
would mean storage, a schema and a new API surface for no gain in an assessment about arithmetic.

---

## D13 — Docker Compose is the primary way to run the project

**Decision.** `docker compose up` brings up frontend + backend from a clean clone, with no Go and
no Node installed. This is the documented happy path in the README; running each layer natively is
the secondary path.

**Why.** The person evaluating this may not be an engineer with the right toolchain versions
installed. "It runs with one command" is part of the deliverable, and the assessment lists a
Dockerfile running both layers together as an optional requirement — one worth taking, not
skipping. Toolchain versions are pinned inside the images, so there is nothing to install and
nothing to mismatch.

**Consequence.** Tests and coverage are runnable through Docker too, so a reviewer can reproduce
the coverage report without a local toolchain.

---

## D14 — nginx serves the frontend and reverse-proxies `/api`

**Decision.** In the composed stack, nginx serves the built static frontend and proxies `/api` to
the backend container. A single port is exposed to the user.

**Concretely.** Host port `8080` maps to the frontend's nginx (`80`); the backend listens on `8080`
inside the compose network and is never published to the host. So `http://localhost:8080` serves
the UI and `http://localhost:8080/api/v1/...` reaches the API through the proxy — the `curl`
examples in `api.md` work unchanged against the composed stack.

**Why.** Frontend and API become same-origin, so **CORS stops existing** in the deployed stack and
there is no API URL to configure — `VITE_API_BASE_URL` defaults to `/api`. In development, the Vite
dev server proxies the same path, so both environments behave identically. A permissive CORS
middleware still exists on the backend for the reviewer who runs the two layers natively on
different ports.

---

## D15 — Go layout: the domain knows nothing about HTTP

**Decision.**

```
backend/
  cmd/server/            entrypoint: config, wiring, timeouts, graceful shutdown
  internal/calculator/   pure domain: operations, dispatcher, sentinel errors
  internal/httpapi/      routing, DTOs, error mapping, middleware
```

**Why.** `internal/calculator` imports nothing but the standard `math` package and is testable
without a server. `internal/httpapi` is testable with `httptest` and no network. The separation is
what makes "testable architecture" true rather than claimed, and it is the boundary a reviewer
looks for first.

**Errors as values.** The domain exposes sentinel errors (`ErrDivisionByZero`,
`ErrUnsupportedOperation`, `ErrInvalidOperandCount`, `ErrUndefinedResult`, `ErrOverflow`) compared
with `errors.Is`. Never string matching on error text.

---

## D16 — Test strategy

**Decision.**

- Backend: table-driven tests per pure function; dispatcher tests for arity, unknown operation and
  non-finite results; `httptest` tests for status/code/body of every catalogue entry, including
  malformed JSON, 404, 405 and the panic recovery middleware.
- Frontend: the reducer tested as a pure function (digit entry, decimals, operator chaining,
  accumulator reuse, clear); the API client tested against mocked responses including every error
  code and a network failure; component tests for rendering results, inline errors and keyboard
  input. No real network in unit tests.
- Coverage reports for both layers are committed and linked from the README.

**Why.** The requirement is "unit tests covering key functionality", and the error paths *are* key
functionality in this assessment — the brief names division by zero, invalid data and graceful
failure explicitly.

---

## D17 — Mandatory scope first, extras strictly after the deliverables

**Decision.** Stages S1–S5 ship only what the brief requires: the four mandatory operations, in
both layers, with tests, Docker, coverage and documentation. The optional operations (`power`,
`sqrt`, `percent`), a CI workflow and the expression parser all live in S6 and are started only
once S5 is complete.

**Why.** The brief asks for 2–4 hours and says, in so many words, to prioritise correctness,
clarity and maintainability over extra features. A repository where the four required operations
are impeccably built, tested and documented reads better than one with seven operations and a thin
README. Extras are also the first thing to be cut when time runs out, so they must not be entangled
with anything required.

**Design consequence.** Even though the optional operations are not implemented yet, the contract
and the domain are shaped so that adding one is a registry entry plus a pure function — the
extension point exists, it is simply not exercised. The API contract already documents them as
backlog so the shape stays honest.

---

## D18 — Parallel agent tracks with a mandatory code review before merge

**Decision.** The implementation is produced by a pipeline of agents rather than in one linear
pass. Each track (backend, frontend, containers) runs in its own **git worktree and branch**, with
a disjoint file scope so the branches cannot conflict. Every track follows the same cycle:

```
dev agent → review agent → findings? → fix agent → review agent → … → PASS → merge --no-ff
```

The review agent is a *different* agent from the one that wrote the code, runs a code-review pass
at high effort over `main...<branch>`, checks the track's definition of done and the non-functional
bar, runs the test suite for real, and is explicitly forbidden from fixing anything. Fixes go to a
third agent, scoped to the reported findings only. The loop is bounded at three rounds before a
human is asked.

**Why.** Two independent gains. Throughput: the three tracks progress simultaneously, and a track's
review starts the moment that track is done instead of waiting for the others. Quality: the thing
this assessment actually grades is code quality, so no code reaches `main` without a review by an
agent that did not write it and has no stake in defending it. Worktrees are what make both possible
at once — parallel branches with real, isolated working directories over one repository.

**Traceability.** The briefs sent to every agent are committed verbatim in
`prompts/02-agent-briefs.md`, since the assessment asks for the prompts used. Merges are `--no-ff`,
so the history shows each track as a unit.
