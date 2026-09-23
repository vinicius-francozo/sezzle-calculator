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

**The contract needs a second mechanism to hold.** A global `keydown` listener and focusable
buttons compete for `Enter`. Buttons therefore refuse focus on click: `CalcButton` prevents the
default of `mousedown`, which is pointer-only by definition. A clicked button is never focused, so
`Enter` always means equals for a mouse user; a button reached by `Tab` keeps focus, and the
keyboard hook steps aside so `Enter` activates it. Blurring in the `click` handler would not work —
pressing `Enter` on a tabbed-to button also fires `click`, so it would throw away the keyboard
user's position. `:focus-visible` distinguishes the cases in a real browser but is unimplemented in
jsdom, so it could not be tested.

*Why this matters.* The first version of the guard tested the element *type* rather than how it got
focus. Browsers focus a button when it is clicked, so clicking `1`, `+`, `3` and pressing `Enter`
re-activated the `3` and silently produced `1 + 33` — the fix for keyboard users had broken the
mouse users, who are the majority. Both paths are now pinned by tests that fail under mutation.

**Accessibility.** The keypad is a `role="group"` with `aria-busy` while a request is in flight, and
focus moves to the group rather than to a button when the active button is disabled mid-request —
parking it on `C` would have made the next `Enter` clear the calculator.

**Scope note.** The key map only covers actions that exist as buttons, so button set and keyboard
stay in sync. `,` is mapped alongside `.` because it is the numpad decimal separator on ABNT2,
German and French layouts. `Backspace` was absent for exactly as long as there was no undo button;
when the button arrived (D29), the key followed — which is the invariant working, not an exception
to it. With the current button set (digits, `.`, four operators, `C`, `=`) that means
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

**Concretely.** Host port `3000` maps to the frontend's nginx; the backend listens on `8080`
inside the compose network and is never published to the host. So the composed stack is
`http://localhost:3000`, and `http://localhost:3000/api/v1/...` reaches the API through the proxy.

**Why not publish on 8080.** That is the port the Go server uses natively and the port the `curl`
examples in `api.md` target. Publishing the composed stack there means a reviewer who tries the
native path and then `docker compose up` gets `Bind for 0.0.0.0:8080 failed: port is already
allocated`. Keeping them on different ports lets both documented run paths coexist.

**Why the published port binds all interfaces and not `127.0.0.1`.** A review raised that
`3000:8080` serves the stack to the local network. True, and deliberate: binding to loopback breaks
the reviewer who runs Docker inside a Linux VM and opens the browser on the host, which fails
silently and confusingly. D13's headline promise is that one command works for someone who may not
be an engineer, and that outweighs LAN exposure of a local demo calculator holding no data. Anyone
who wants it loopback-only changes one line in `compose.yaml`.

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
`ErrUnsupportedOperation`, `ErrInvalidOperandCount`, `ErrOverflow`, and — since `sqrt` shipped in
S6 — a sentinel for the square root of a negative number) compared
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

---

## D19 — Detail-bearing domain errors are typed and unwrap to the sentinels

**Decision.** Domain errors that carry data — `UnsupportedOperationError{Operation}` and
`OperandCountError{Operation, Want, Got}` — are types whose `Unwrap()` returns the matching
sentinel (`ErrUnsupportedOperation`, `ErrInvalidOperandCount`). The transport layer reads the
fields with `errors.As` and formats the user-facing message from them.

**Why.** The contract's messages are capitalised, user-facing prose (`Unsupported operation
"tangent"`), while idiomatic Go error strings are lowercase and uncapitalised. Typed errors let
both be true at once: the domain keeps Go-style error text, the HTTP layer owns the wording the API
promises, and no layer has to parse the other's strings. `errors.Is` still works for callers that
only care about the class of failure. This is the pattern the standard library uses
(`json.UnmarshalTypeError`, `net.OpError`).

---

## D20 — Strict JSON decoding, and how decoder failures map to the catalogue

**Decision.** The handler uses `DisallowUnknownFields`, a 4 KiB `MaxBytesReader`, and a check that
the body is exactly one JSON object. The mapping to the error catalogue is:

| Decoder outcome | Code |
| --- | --- |
| Syntax error, empty body, trailing content, oversized body, unknown field, non-object top level | `INVALID_JSON` (400) |
| Operand of the wrong JSON type, missing required field, wrong operand count | `VALIDATION_ERROR` (400) |

**Why unknown fields are `INVALID_JSON` and not `VALIDATION_ERROR`.** `encoding/json` reports an
unknown field as a bare `fmt.Errorf`, with no error type to match on. Telling it apart from other
decode failures would require comparing the error's text — precisely what `CLAUDE.md` §3 forbids.
Given the choice between a banned technique and a code the catalogue already covers for
"body rejected as a whole", the catalogue wins.

**Why an oversized body is 400 and not 413.** `docs/api.md` pins the size-limit case to
`INVALID_JSON` 400 in the row text. The contract is frozen and the frontend is built against it in
parallel, so returning 413 would break a promise for a cosmetic gain.

---

## D21 — `UNDEFINED_RESULT` was reserved in the contract before it was implemented

> **Superseded by D24.** `sqrt` shipped in stage S6, so this code is now emitted and tested. The
> entry is kept because the reasoning is the point: the contract described the shape before the
> code existed, and the code stayed free of unreachable branches until the operation that needed
> them arrived. Adding `sqrt` required no contract change.

**Decision.** The error code exists in `docs/api.md`, explicitly marked as backlog, and has **no**
sentinel, no mapping row and no test in the Go code.

**Why.** Its only producer is `sqrt`, which is in the S6 backlog. Implementing it now would add a
branch no request can reach, which `CLAUDE.md` §3 bans as dead code, and the only way to test it
would be to hand the mapping function a fabricated error — a test asserting what the code happens
to do, which is what D16 exists to prevent. Reserving it in the contract instead keeps the shape
honest (a client may keep the code in its union) without shipping unreachable code.

**Guard rail.** The mapping function's `default:` branch turns an unmapped error into a 500, which
is the generic-500 behaviour §2.3 bans. It carries a comment stating that any new domain error must
get a mapping row, so adding `sqrt` cannot silently regress into it.

---

## D22 — Frontend state invariants and the client-only error codes

Decisions taken while building and reviewing the UI, recorded here because they constrain anyone
who touches the reducer next.

**An entry carries its text and its value together.** `Entry { text, value }` holds what the
display shows alongside the exact number it denotes. Two constructors keep the pair honest:
`typedEntry(text)` for what the user types and `resultEntry(value)` for a settled result, which
keeps full precision behind the rounded text. Formatting is *presentational only* — no code path
parses a formatted string back into a number.

*Why it matters.* The first version stored the formatted result and re-parsed it for the next
operation, so `1 ÷ 3 =` followed by `× 3 =` produced `0.999999999999` instead of `1`: rounding had
quietly become part of the arithmetic, in direct conflict with D7's "the server owns semantics".

**The entry cap equals the display precision.** `MAX_ENTRY_DIGITS` is derived from
`SIGNIFICANT_DIGITS`, not set independently. A larger cap breaks the invariant from the other side:
16 typed digits exceed `Number.MAX_SAFE_INTEGER`, so `9999999999999999` would display one number
and send another, and an operand longer than the display precision would be redrawn rounded the
moment an operator was pressed. Tying the two constants together makes the disagreement
unrepresentable. The cap also keeps `Number(entry)` from reaching `Infinity`, which `JSON.stringify`
would serialise as `null` and break the contract's `number[]`.

**While a request is in flight, every key except `C` is inert.** One rule, stated once in the
reducer and mirrored declaratively in the keypad, so the keyboard inherits it with no second
implementation. It guarantees at most one request at a time, makes a stale response a single case,
and keeps §4.1's "never stuck in a loading state" literally true because `C` always escapes.

**Three error codes are client-only.** `NETWORK_ERROR`, `TIMEOUT` and `UNEXPECTED_ERROR` never come
from the API; they are minted by the client so that transport failures, a 10-second request
deadline (`AbortController`) and an unrecognisable response body all reach the UI through the same
single error channel as a server rejection. The display code does not care where a failure came
from.

**History entries carry an identity.** `HistoryEntry.id` is minted in the reducer and is what React
keys on. Index keys break once `HISTORY_LIMIT` starts evicting from the front, which is exactly
when the list is most active.

---

## D23 — What the reviews changed, and why the loop was worth it

Every track was reviewed by an agent that did not write it, and every review ran the suite and
mutated the code rather than reading it. That combination, not coverage, is what found the real
defects:

| Found by | Defect | Why coverage missed it |
| --- | --- | --- |
| Mutation | Deleting the `Recover` middleware from the assembled chain left the suite green | The middleware was tested in isolation, never in the chain |
| Mutation | Dropping the server's `Shutdown` call left the suite green | The test asserted the return value, not that the listener closed |
| Mutation | Reverting half of the precision fix left all 89 tests green | Both regression tests covered the same one of two code paths |
| Running it | Chaining from a rounded display string gave `0.999999999999` for `1 ÷ 3 × 3` | Every unit test used values that survive rounding |
| Running it | `docs/coverage/frontend.txt` was written full of ANSI escapes, and empty at 100% coverage | Nobody had read the generated artifact |
| Running it | nginx cached the backend's IP for the worker's lifetime | Only reproducible by moving the container |

The lesson worth keeping: a test suite at 100% coverage proves the lines ran, not that anything is
asserted about them. Mutation is the cheap way to tell the difference, and reading the artifact a
script produces is the cheap way to tell whether a deliverable is actually deliverable.

---

## D24 — The optional operations, and how a unary operation fits a binary UI

**Decision.** `power`, `sqrt` and `percent` ship. The API needed no contract change: they were
already specified in `api.md` and the domain registry was built as the single extension point, so
each one is a pure function, a registry row and a test table. `UNDEFINED_RESULT` is now a live code,
emitted by `sqrt` of a negative number, which is what D21 predicted and deferred.

**Semantics.**

| Operation | Arity | Meaning |
| --- | --- | --- |
| `power` | 2 | `a ^ b` |
| `sqrt` | 1 | `√a`, undefined for `a < 0` |
| `percent` | 2 | `a% of b` — `a / 100 * b`, so `15 % 200 =` is `30` |

**The interesting part is `sqrt`, because the UI is built around binary operations.** A unary
operation has no second operand to wait for, so it does not follow the
`left → operator → right → =` flow. It applies **immediately** to whatever is on the display and
replaces it, exactly as a physical calculator behaves: `9 √` shows `3` at once, with no `=`.

That makes `√` the only key that can issue a request without `=`, which has three consequences the
reducer has to honour:
- the result lands in the entry with `overwriteEntry: true`, so the next digit starts fresh and
  `√` chains (`81 √ √` gives `3`);
- a pending binary operation is preserved, not resolved — `2 + 9 √` leaves `2 +` waiting and
  replaces the right operand with `3`, so `=` then gives `5`;
- an error from `√` follows D8 like any other: inline, expression preserved, history untouched.

**Why `percent` stayed binary.** Contextual percent (`200 + 10 %` meaning `220`) is what some
desktop calculators do, and it requires the percent key to inspect the pending operation and change
meaning accordingly. That is a special case in the reducer for one key, and it makes the API
ambiguous about what was actually computed. `a% of b` is one rule, reads the same in the UI and in
the contract, and needed no new state.

---

## D25 — Continuous integration

**Decision.** A GitHub Actions workflow runs both suites on every push and pull request, with the
same toolchain versions the containers pin, and also builds the compose stack.

**Why.** The claim this repository makes is "it runs from a clean clone with only Docker". CI is the
cheapest way to make that claim falsifiable by someone who has not cloned it: a reviewer opening the
repository sees whether the suite passes on a machine that is not the author's. It also guards the
coverage thresholds, which are only meaningful if something enforces them.

---

## D26 — `power`'s failures are `OVERFLOW`, and why that is the contract's fault rather than the code's

**Decision.** Every way `math.Pow` fails produces a non-finite result, and all of them map to
`OVERFLOW`: `0 ^ -1` gives `+Inf`, `(-8) ^ (1/3)` gives `NaN`. Neither becomes `DIVISION_BY_ZERO`
nor `UNDEFINED_RESULT`.

**Why.** The contract pins `DIVISION_BY_ZERO` to "`divide` with `b == 0`" and gives `UNDEFINED_RESULT`
a row naming exactly one producer, the square root of a negative number — a wording the error
message itself repeats. `OVERFLOW`'s row is unqualified: "result is not a finite number (`±Inf` or
`NaN`)". With the contract frozen and the frontend built against it in parallel, this is the only
self-consistent reading.

**The cost, stated plainly.** `sqrt(-1)` and `(-8)^(1/3)` are the same class of failure — an
operation undefined for its operands — and they get different codes and different messages. A
reviewer is entitled to call that a wart. It is a contract-level fix, not a code-level one: the
honest version would give `UNDEFINED_RESULT` a general message and let both route there. Recorded
rather than smuggled.

**A sharper reason the finiteness guard must exist than "never a raw NaN in a response".**
`encoding/json` cannot encode `NaN` or `±Inf` — it returns an error — and `writeJSON` sets the
status and calls `WriteHeader(200)` *before* encoding, then discards the encoder error. Removing
the guard was tested: `power` of `(-8)^(1/3)` answers **`200 OK` with a zero-length body**. Not a
visible `NaN` the client could at least detect, but a syntactically empty success the client cannot
parse at all.

---

## D27 — A correction: `a% of b` and `b% of a` are not the same number

An earlier note in this project's mutation log claimed that mutating `Percent` from `a / 100 * b`
to `b / 100 * a` produced an *equivalent* mutant, on the grounds that "15% of 200 and 200% of 15 are
the same number". That is true in ℝ and **false in `float64`**: the division and the multiplication
round separately, so the two orders differ by an ULP for roughly a third of ordinary operand pairs
(1,696,353 of 5,000,000 random pairs), and differ catastrophically at the extremes — with a
subnormal second operand, one order underflows to zero while the other does not. It is observable
in the API response:

```
{"operation":"percent","operands":[3,7]} -> "result":0.21
{"operation":"percent","operands":[7,3]} -> "result":0.21000000000000002
```

So the mutant is genuinely killable, not equivalent. It is left alive deliberately for a different
reason: the divergence is one ULP at ordinary magnitudes and D6's 12-significant-digit display
formatting hides it, so no user-visible behaviour depends on it, and a test pinning ULP noise would
be a worse test than this note.

The correction is recorded rather than quietly fixed because "they are the same number" is exactly
the kind of floating-point assertion that becomes a real defect the next time someone reasons from
it. The implementation order itself is not arbitrary: `a / 100 * b` is what `api.md` specifies, and
`a * b / 100` overflows to `+Inf` for large operands where `a / 100 * b` does not — which *is*
pinned by a test.

---

## D28 — Two things S6 exposed in code that had already shipped

**The layout container was the wrong element, and five reviews missed it.** `body` was the flex
container, but its flex *item* was `<div id="root">`, which has no width of its own and so
shrink-to-fits to `max-content`. `.calculator`'s `width: 100%` therefore resolved against ~159 px
instead of its 420 px cap: on a 390 px phone the app rendered 159 px wide with 34 × 60 px keys,
well under the 44 px tap target §2.2 requires. The fix moves the centring onto `#root`.

*Why it survived so long is the useful part.* Two earlier reviews did open a real browser against
the real stack and reported "17 buttons, no text input, no horizontal overflow at 390 px" — all
true. They asserted the **absence of error**; the requirement was **adequacy**. Nothing overflowed
because the layout was too small to overflow. The defect only surfaced when someone measured
`getBoundingClientRect` on every key at five widths instead of looking. The measured numbers are
now the standard for any UI claim in this project.

**An overloaded flag came apart under a new case.** `overwriteEntry` had been answering two
questions at once — "does the next digit start fresh?" and "is there a right-hand operand yet?" —
which coincided for every binary operation, so the overload was invisible. A unary operation needs
the answers to differ: its result must be overwritten by the next digit *and* usable by `=`. Hence
`entryIsOperand`. The same split then exposed a second bug: `fail` cleared the operand flag
unconditionally, which is right for a failed binary request but strands a failed unary — the user
would be looking at `2 + 9` with `=` silently inert, because the binary operation underneath had
never been attempted. `fail` now branches on arity, mirroring `settle`, and both branches are
pinned by a test that fails without them.

---

## D29 — Undo, and the one rule that keeps it from reintroducing the precision bug

**Decision.** An undo key removes the last character of the entry, with a button in the top-left of
the keypad and `Backspace` mapped to the same action, per D11's button/keyboard parity.

**It only edits an entry the user typed.** When the display holds a *computed* result — after `=`,
after a square root, or on a fresh calculator — undo does nothing.

**Why that restriction is not arbitrary.** A result is displayed rounded to 12 significant digits
while `Entry` carries the exact value behind it (D22). Letting undo edit that text would make the
next operand come from the rounded string, which is precisely the defect D22 was written to close:
`1 ÷ 3 =` then editing the display would chain from `0.333333333333` rather than `1/3`. Rather than
add a rule about when the pair may diverge, undo simply does not apply where the pair exists. The
existing `overwriteEntry` flag already marks exactly that state, so the guard costs nothing new.

**Edge cases.** Deleting the last character leaves `0`, still typed, so the next digit replaces it
rather than appending to it. `1.5` → `1.` → `1` → `0`. Undo never touches the accumulator, the
pending operator or the history — it is an edit of the current entry and nothing else, so it cannot
resurrect a cleared calculation or undo a settled one. While a request is in flight it is inert,
like every key except `C`.

**Naming.** The brief calls it undo and asks for the conventional undo arrow, so that is the icon
and the accessible name, even though the mechanism is a backspace over the entry. The label a user
reads and the key they press agree; the narrower behaviour is documented here and in the code.
