# Design decisions

The decisions that shaped this project, with the reasoning behind each one and what was rejected.
They were settled in discussion before the code was written, and this document is the source for
the README's design section.

Implementation choices made while writing the code — naming, internal structure, test tactics — are
not here; they are explained where they apply, in the code itself. This log holds the decisions
about *what* the calculator is and how it behaves.

The numbering is historical: entries keep the number they were given when they were taken, so the
references from the code stay valid.

---

## D1 — Step-by-step binary operations instead of a server-side expression parser

**Decision.** The frontend behaves like a desktop calculator in basic mode: it accumulates
`left operand -> operator -> right operand` and sends **one operation per request**. The backend
performs arithmetic only — no tokenizer, no operator precedence, no parentheses.

**Why.** The assessment asks for four arithmetic operations and says to prioritise correctness and
clarity over extra features within a 2–4 hour budget. An expression evaluator would roughly triple
the backend and its test surface while adding nothing the requirements ask for. Keeping operations
atomic also keeps the service honestly "micro": it does one thing.

**Rejected.** `POST /evaluate { "expression": "12 + 3 x 2" }`.

**Consequence.** No operator precedence and no parentheses: chained input resolves left to right,
one step at a time, exactly as a physical calculator behaves. Upgrading to a parser later is
additive — a second endpoint beside the first — and it stayed in the backlog (`PLAN.md`, S6).

---

## D2 — A single `POST /api/v1/calculate` endpoint, with the operation as data

**Decision.** One endpoint receives `{"operation": "...", "operands": [...]}`, rather than one route
per operation (`/add`, `/subtract`, ...).

**Why.** The operation is a value, not a resource. One route means one handler, one decoding path,
one validation path and one table-driven test, instead of four near-identical copies of each.
Adding an operation later becomes a single row in the domain registry with no routing work at all —
which is exactly what happened when the optional operations shipped.

**Rejected.** Route-per-operation, which is arguably more "RESTful" but multiplies identical code.

---

## D3 — `operands` as an array, not `a` and `b`

**Decision.** Operands travel as a JSON array, and arity is a property of the operation, validated
by the dispatcher.

**Why.** Unary and binary operations then share one contract, one DTO and one validation rule. With
`a`/`b`, a unary operation would need either a second, ignored field or a second endpoint shape. The
square root proved the point later: adding it needed no contract change.

**Cost.** Arity has to be validated explicitly — a handful of lines and one test case, cheaper than
a second request shape.

---

## D4 — One pure function per operation, plus a thin dispatcher

**Decision.** The domain package exposes a small pure function per operation and a single dispatcher
that validates arity, resolves the operation and delegates:

```go
// pure, obvious to test
func Add(a, b float64) float64
func Divide(a, b float64) (float64, error)
func Sqrt(a float64) (float64, error)

// dispatcher: validates arity, resolves the operation, delegates
func Evaluate(op Operation, operands []float64) (float64, error)
```

**Why.** Granularity is what makes the unit tests good. Each arithmetic function is testable in
isolation with a trivial table — no map lookup, no slice indexing, no error plumbing in the way —
and the dispatcher is then tested for what only it does: unknown operation, wrong arity, a result
that is not finite. Testing everything through `Evaluate` would blur the two concerns and make
failures harder to localise.

**Consequences that follow from the shape.** A function returns an error only for an impossibility
it owns — division by zero, the root of a negative number — so `Add` truthfully has no error in its
signature. The check that a result is finite is identical for every operation, so it lives once, in
the dispatcher. And the domain package imports nothing but `errors`, `fmt` and `math`: it has no
idea HTTP exists, which is what makes "testable architecture" true rather than claimed.

**Naming.** The `Operation` constants are `OpAdd`, `OpSubtract`, ... because a constant named `Add`
would collide with the function, mirroring the standard library's convention for enumerated values.

---

## D7 — Validation lives in both layers, doing different jobs

**Decision.** The frontend validates **form**; the backend validates **semantics**.

- Frontend: prevents malformed input at the source — two operators in a row replace each other, a
  second decimal point is ignored, `=` does nothing without a complete expression.
- Backend: owns every rule about whether a result exists — division by zero, arity, unsupported
  operation, non-finite results — and trusts nothing the client sends.

**Why.** This is not accidental duplication. The API is a public surface and can never rely on its
client, while the UI must answer instantly rather than round-tripping to say "that is not a number".
They validate different things, so neither can be removed.

**Notable consequence.** `12 / 0` is deliberately **not** blocked by the frontend. It is sent, the
API rejects it, and the UI renders the message the API returned. The rule lives in exactly one
place, and the integration is exercised for real rather than mocked away.

---

## D8 — Errors are inline, and the failed expression survives

**Decision.** Modelled on the desktop calculator: the error message is rendered as plain text
directly under the expression, the offending expression stays on screen, and the history above it is
untouched. No modals, no toasts, no alerts, no silent failures.

**Why.** It is the behaviour a user of any desktop calculator already expects, and it keeps the
context needed to fix the mistake visible. Reference messages: "Division by zero is undefined",
"Overflow: the result could not be calculated".

**Also covered.** A network failure, an unreachable API and a request that takes too long all reach
the UI through the same single error channel, so the display code does not care where a failure came
from — and the UI never stays stuck in a loading state.

---

## D9 — One error envelope for the whole API, with a stable code

**Decision.** Every non-2xx response is `{"error": {"code": "...", "message": "..."}}` with an
accurate status. Domain rejections are `400`, not `500`. A recovery middleware converts any
unexpected panic into a structured `INTERNAL_ERROR` plus a log line, so no panic escapes a handler
and no stack trace ever reaches a client.

**Why.** Generic 500s and escaping panics are called out explicitly in the assessment. A stable
`code` lets the client branch on meaning without string matching, while `message` stays free to be
reworded. Mapping domain errors to HTTP happens in exactly one function, so the transport rules are
readable in one place.

**Where the line falls.** Division by zero is a *client* error: the request was understood and
refused on its merits. A 500 means the service itself misbehaved, which should be the only
unexpected status in the catalogue.

---

## D10 — Calculator state in one reducer, with an accumulator

**Decision.** All calculator state lives in a single `useReducer`, including an **accumulator** that
holds the previous result so it can feed the next operation, exactly like a physical calculator:

- `12 + 3 =` shows `15`; pressing `x 2 =` then computes `15 x 2`.
- A digit pressed right after `=` starts a fresh entry instead of appending to the result.
- Chained input (`2 + 3 + ...`) resolves the pending operation when the second operator is pressed,
  so the running total is always on screen.

**Why.** This is what makes it feel like a real calculator, and it costs almost nothing: one number
in state plus a flag marking whether the next digit overwrites the entry. A reducer keeps these
transitions in one readable place; the same logic spread over six `useState` calls is where
calculator bugs live.

**Extra benefit.** The reducer is a pure function, so most of the frontend's logic is unit tested
without rendering anything.

---

## D11 — The keyboard maps exactly the actions that have buttons

**Decision.** A `useKeyboard` hook translates key presses into the very same reducer actions the
buttons dispatch. No key exists without a button, and no button's action is unreachable from the
keyboard. On mobile there is no free-text input at all, so the on-screen keyboard is never summoned.

**Why.** Zero duplicated logic: the keyboard is another way to dispatch, not a second
implementation. It also means the keyboard is covered by the same reducer tests, and the two input
methods cannot drift apart.

**The invariant working in practice.** `Backspace` was unmapped for exactly as long as there was no
undo button; when the button arrived (D29), the key followed. That is the rule holding, not an
exception to it.

**A second mechanism the rule needs.** A global `keydown` listener and focusable buttons compete for
`Enter`. Buttons therefore refuse focus on click — `mousedown`'s default is prevented, and
`mousedown` is pointer-only by definition — so a clicked button is never focused and `Enter` always
means equals for a mouse user, while a button reached by `Tab` keeps focus and `Enter` activates it.

---

## D12 — Calculation history in the UI

**Decision.** The display keeps a short list of previous calculations (`expression = result`) above
the current entry. Only successful calculations enter it; errors stay inline and are not recorded.
It is in-memory and per-session — not persisted, and there is no history endpoint.

**Why.** It costs an array in the reducer and one small presentational component, and it is what
makes the UI read as a finished product rather than a form with a submit button. Persisting it would
mean storage, a schema and a new API surface for no gain in an assessment about arithmetic.

---

## D13 — Docker Compose is the primary way to run this project

**Decision.** `docker compose up` brings up frontend and backend from a clean clone, with no Go and
no Node installed. This is the documented happy path; running each layer natively is the secondary
path.

**Why.** The person evaluating this may not be an engineer with the right toolchain versions
installed. "It runs with one command" is part of the deliverable, and the assessment lists a
Dockerfile running both layers together as an optional requirement — one worth taking rather than
skipping. Every toolchain version is pinned inside the images, so there is nothing to install and
nothing to mismatch. Tests and coverage run through containers too, for the same reason.

**How both layers become one origin.** nginx serves the built frontend and reverse-proxies `/api` to
the backend, so in the composed stack frontend and API are same-origin and **CORS stops existing**;
the API base URL defaults to `/api` and needs no configuration. The Vite dev server proxies the same
path, so both environments behave identically, and a permissive CORS middleware remains on the
backend for whoever runs the two layers natively on different ports.

**Ports.** The stack publishes `3000`; the backend listens on `8080` inside the compose network and
is never published to the host. Publishing the stack on 8080 would collide with a natively-running
backend — the other documented path — so the two can be used side by side.

**Verified, not assumed.** From a clean clone with no local toolchain and an empty image cache:
build 39s, both containers healthy, the whole contract exercised through the proxy, and the coverage
script producing both reports with `node_modules` absent at the start.

---

## D17 — Mandatory scope first, extras strictly after the deliverables

**Decision.** The four required operations shipped complete — both layers, tests, Docker, coverage
and documentation — before anything optional was started. The optional operations, CI and the
expression parser all waited.

**Why.** The brief asks for 2–4 hours and says, in so many words, to prioritise correctness, clarity
and maintainability over extra features. A repository where the required operations are impeccably
built, tested and documented reads better than one with seven operations and a thin README. Extras
are also the first thing to be cut when time runs out, so they must not be entangled with anything
required.

**Design consequence.** The contract and the domain were shaped so that adding an operation is a
registry row plus a pure function — the extension point existed long before it was exercised.

---

## D18 — Parallel agent tracks, with a mandatory review before every merge

**Decision.** The implementation was produced by a pipeline of agents rather than in one linear
pass. Each track ran in its own **git worktree and branch**, with a disjoint file scope so the
branches could not conflict, and each followed the same cycle:

```
dev agent -> review agent -> findings? -> fix agent -> review agent -> ... -> PASS -> merge --no-ff
```

The reviewer is always a *different* agent from the author, reviews the branch's whole diff against
the frozen contract and the project's quality bar, runs the test suite for real, and is explicitly
forbidden from fixing anything. Fixes go to a third agent, scoped to the reported findings only.

**Why.** Two independent gains. Throughput: tracks progress simultaneously, and a review starts the
moment its track is done instead of waiting for the others. Quality: the thing this assessment
grades is code quality, so no code reaches `main` without a review by someone who did not write it
and has no stake in defending it. Worktrees are what make both possible at once — parallel branches
with real, isolated working directories over one repository.

**It was not a rubber stamp.** The reviews caught, among others: an arithmetic bug where chaining
from the rounded display made `1 / 3 x 3` give `0.999999999999`; a panic-recovery middleware that
could be deleted from the chain with the suite still green; a fix that was pinned on only one of its
two code paths; a coverage report that would have been committed full of ANSI escape codes; and a
layout defect that made the calculator render 159 px wide with 34 px keys on a phone. Two findings
were rejected with evidence rather than implemented.

**The recurring lesson.** Coverage proves a line ran, not that anything was asserted about it, and
"the tests pass" proves nothing broke, not that the result is right. Mutating the source and
re-running the suite is the cheap way to tell the difference — and reading the artifact a script
produces is the cheap way to find out whether a deliverable is actually deliverable.

---

## D24 — The optional operations, and how a unary operation fits a binary UI

**Decision.** `power`, `sqrt` and `percent` ship. The API needed no contract change and the domain
needed no restructuring: each is a pure function, a registry row and a test table, which is what D2's
and D4's extension point was for.

| Operation | Arity | Meaning |
| --- | --- | --- |
| `power` | 2 | `a ^ b` |
| `sqrt` | 1 | the square root of `a`, undefined for `a < 0` |
| `percent` | 2 | `a% of b` — `a / 100 * b`, so `15 % 200 =` is `30` |

**The interesting part is `sqrt`, because the UI is built around binary operations.** A unary
operation has no second operand to wait for, so it does not follow `left -> operator -> right -> =`.
It applies **immediately** to whatever is on the display and replaces it, as a physical calculator
does: pressing the root key with `9` on screen shows `3` at once, with no `=`.

That makes it the only key that can issue a request without `=`, which has three consequences the
reducer honours:
- the result lands in the entry such that the next digit starts fresh, and the key chains: `81` then
  root twice gives `3`;
- a pending binary operation is preserved, not resolved — `2 + 9` then root leaves `2 +` waiting
  with its right operand replaced by `3`, so `=` then gives `5`;
- an error from it behaves like any other (D8): inline, expression preserved, history untouched.

**Why `percent` stayed binary.** Contextual percent (`200 + 10 %` meaning `220`) requires the key to
inspect the pending operation and change meaning accordingly — a special case in the reducer for one
key, and an API that is ambiguous about what was actually computed. `a% of b` is one rule that reads
the same in the UI and in the contract, and needed no new state.

---

## D25 — Continuous integration

**Decision.** A GitHub Actions workflow runs both suites and the composed stack on every push and
pull request, with the same toolchain versions the images pin, and a coverage floor on each layer.
The stack job exercises the contract through the nginx proxy using the same smoke-test script a
person can run by hand.

**Why.** The claim this repository makes is "it runs from a clean clone with only Docker". CI is the
cheapest way to make that claim falsifiable by someone who has not cloned it: a reviewer opening the
repository sees whether the suite passes on a machine that is not the author's. It also enforces the
coverage thresholds, which are only meaningful if something checks them.

---

## D29 — Undo, and the one rule that keeps it from reintroducing a precision bug

**Decision.** An undo key removes the last character of the entry, with a button in the top-left of
the keypad carrying the conventional undo arrow, and `Backspace` mapped to the same action per D11.

**It only edits an entry the user typed.** When the display holds a *computed* result — after `=`,
after a square root, or on a fresh calculator — undo does nothing.

**Why that restriction is not arbitrary.** A result is displayed rounded to twelve significant digits
while the exact value is kept behind it, so that chaining never computes with a rounded number.
Letting undo edit that text would put the rounded value back into the arithmetic: `1 / 3 =` then undo
would chain from `0.333333333333` instead of a third. Worse cases exist — `1e+21` trimmed by one
character is `100`, and `-9` becomes `-`, which is `NaN`. One condition closes all of them, and the
flag that already marks "this entry is not the user's own text" costs no new state.

**Edge cases.** Deleting the last character leaves `0`, still typed, so the next digit replaces it
rather than appending (`1` then undo then `7` is `7`, never `07`). Undo never touches the
accumulator, the pending operator or the history — it edits the current entry and nothing else, so it
cannot resurrect a cleared calculation or undo a settled one. While a request is in flight it is
inert, like every key except `C`.

**Why the failed-request case is not widened.** After a failed calculation the operand on screen is
exact typed text, so the precision argument does not apply to it — only the flag does. Widening it
was tested and is unsafe: a failed unary deliberately preserves the entry, and that entry can itself
be a result (`0 - 9 =` shows `-9`), so undo would produce `-`, which is `NaN`. Doing it properly
would need a third state flag meaning "these are the user's own characters", which is more machinery
than the convenience is worth. The user retypes the operand instead, which already clears the error.

**Layout.** Twenty-one keys plus a two-column `0` plus a four-column `=` is 25 cells, which is not a
multiple of four. Rather than add a row and make the calculator taller on a phone, `0` gives up its
span and `%` takes the freed cell, keeping the grid at **4 x 6 = 24 cells for 21 keys** with `=` as
the only span. Measured in a browser at five widths, the keypad's height and every key's box are
unchanged from the twenty-key layout: the new key cost zero pixels.

**Naming.** The feature is called undo and carries the conventional undo arrow, even though the
mechanism is a backspace over the entry. The label a user reads and the key they press agree; the
narrower behaviour is documented here and in the code.
