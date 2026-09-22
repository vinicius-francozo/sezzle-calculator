# Prompt 03 — Design discussion and the agent workflow

**Date:** 2026-09-22
**Tool:** Claude Code (Opus 5)

These are the prompts that settled the design and the way the work would be executed, after the
repository bootstrap in [01-project-setup.md](01-project-setup.md). Translated from Brazilian
Portuguese; intent and detail preserved.

---

## Prompt 3.1 — Docker is not optional, and plan before building

> Let's continue. Let's clarify point by point:
>
> 1. Docker is not just a convenience as you said, it is **necessary** for the case where the
>    person who runs the project locally does not have the tools I have installed. Think about the
>    recruiter trying to run the project instead of an engineer — Docker would be far easier.
>    Besides, it is one of the optional requirements ("Dockerfile to run frontend + backend
>    together"), which means we need a docker compose to run properly, with no version or
>    dependency problems. Do not neglect this.
>
> 2. Our development cycle will be: first formulate all the "sprints" or stages of development, and
>    only then start. We are going to break this big task into smaller tasks and do them in parallel
>    whenever possible, to optimise time. For that, we will discuss each stage of building the
>    application together, now, until we reach consensus on the design. The application is simple,
>    we do not need overengineering — we just need to be careful to build readable and idiomatic
>    code. So let's discuss the calculator's implementation.

**Outcome.** `CLAUDE.md` was rewritten to make Docker Compose the primary documented way to run the
project rather than an optional extra (decision D13). A full design proposal was put on the table
and discussed before any code was written.

---

## Prompt 3.2 — Design decisions (answers to a set of proposals)

Chosen in response to concrete alternatives:

> **Interaction model:** step-by-step binary operations. *"Let's start with this one, to keep the
> complexity lower and guarantee the basic functionality. We can evolve to the parser later if
> there is time left."*
>
> **UI scope:** calculation history — and, added by the user: *"we will also need a new state in
> React to store the result of the previous operation so it can be used for the next one, just like
> a real calculator; that way we add very little extra complexity and get a favourable UX return."*
>
> **Domain signature** — the user rejected a single `Evaluate` entry point in favour of finer
> granularity:
>
> ```go
> // pure functions, obvious to test
> func Add(a, b float64) float64
> func Divide(a, b float64) (float64, error)
> func Sqrt(a float64) (float64, error)
>
> // dispatcher: validates arity, resolves the operation, delegates
> func Evaluate(op Operation, operands []float64) (float64, error)
> ```
>
> *"this way we keep better granularity, which helps us a lot more when building the unit tests."*
>
> **Documentation:** *"I also want you to create a document and keep adding everything we are
> documenting and everything I am instructing you to do as an engineering decision, to include in
> the final deliverable."*
>
> **Optional operations and CI:** both deferred to the S6 backlog — mandatory scope in both layers
> ships first.

**Outcome.** `docs/api.md` (frozen contract), `docs/DESIGN.md` (the running decision log the user
asked for) and `docs/PLAN.md` (task breakdown) were written before any implementation. The domain
was shaped as pure functions plus a thin dispatcher (D4), which also made it natural to check
overflow exactly once, in the dispatcher, keeping the pure functions honest (D5).

---

## Prompt 3.3 — The parallel agent workflow with mandatory code review

> One more thing: let's create a workflow so we can keep the code well structured and also increase
> development throughput.
>
> What we are going to do is parallelise every stage that can be parallelised. For that, we will
> always deploy an agent to develop the task assigned to that agent and, at the end of development,
> another agent to use the `code-review` skill.
>
> Keep this flow in mind:
> 1. Tasks are split and assigned to independent agents, carrying the task's context and the good
>    practices we established in `CLAUDE.md` and in reading the technical assessment.
> 2. After development ends, a new agent is deployed to use the `code-review` skill over the diff
>    generated for that specific task. This new agent also carries the context of each task's
>    definition of done (as well as the code standard: readable, idiomatic, clean...).
> 3. If the review agent finds any problem, it reports it and another agent is deployed to do that
>    development.
> 4. The cycle restarts from point 2, until there are no more impediments in the code reviews.
>
> Keep this workflow in mind, and the fact that the code reviews have to be done in parallel,
> without waiting for one development to finish 100% to start another (it might be interesting to
> use worktrees and separate branches for each development to achieve this result).
>
> If you have any doubt about this workflow, ask me now; if not, use plan mode to create the whole
> plan for the work (scope, task division...) based on what we have already established.

Follow-up decisions: merge each track with `--no-ff` so the history keeps it as a unit; run
autonomously through the deliverables stage; use the strongest available model for every agent.

**Outcome.** Three git worktrees with disjoint file scopes, each running
`dev → review → fix → review → … → PASS → merge`, with the reviewer always a different agent from
the author and explicitly forbidden from fixing anything. Recorded as decision D18 and in
`CLAUDE.md` §9. The briefs themselves are in
[02-agent-briefs.md](02-agent-briefs.md).

---

## What the workflow actually caught

Recorded here because it is the honest answer to "was the extra process worth it". Details in
`docs/DESIGN.md` D23.

- An arithmetic bug: chaining from the rounded **display string** made `1 ÷ 3 × 3` produce
  `0.999999999999`.
- The panic-recovery middleware was present but not pinned — deleting it from the chain left the
  suite green.
- The graceful shutdown could be deleted with the suite still green.
- The first fix for the arithmetic bug was pinned on only one of its two code paths, so the bug
  could return unnoticed.
- The committed coverage report would have been written full of ANSI escape codes, and empty at
  100% coverage.
- nginx resolved the backend's address once at startup, so a restarted backend meant permanent 502s.
- A global keydown handler swallowed browser shortcuts and broke Enter on a focused button.

Two findings were rejected with evidence rather than implemented: a more precise message for
out-of-range numbers (impossible without string-matching `encoding/json`'s untyped error, which the
project's own rules forbid), and binding the published port to loopback only (would break anyone
running Docker in a VM, against the "one command works" goal).
