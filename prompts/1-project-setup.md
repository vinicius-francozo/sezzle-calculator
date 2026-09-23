# Prompt 01 — Project setup, architecture and scope

**Date:** 2026-09-22
**Tool:** Claude Code (Opus 5)

## Prompt (translated from Brazilian Portuguese)

> Read this email I received containing a technical assessment for a job I'm applying to.
>
> ```
> Sezzle | ACTION REQUIRED - Technical Assessment
> Valeria González Pineda <valeria.gonzalez@sezzle.com>
>
> Dear Vinicius Francozo,
>
> Thank you for your continued interest in Sezzle! We are excited to continue advancing you
> through our process and sincerely appreciate you taking the time to complete the Wonderlic exam!
>
> As a next step, please complete the following within the next 5 business days.
>
> Objective
> Build a full-stack calculator application with a React frontend and a backend microservice.
> The frontend should consume the backend API to perform basic and advanced arithmetic operations.
> Focus on clean design, maintainable code, and testable architecture.
>
> Requirements
> Functional
> Operations:
>   Addition, Subtraction, Multiplication, Division
>   Optional: Exponentiation, Square Root, Percentage
> Frontend (React):
>   Intuitive UI for entering input and displaying results
>   Input validation and error handling
>   Responsive design (basic mobile support)
> Backend (REST API):
>   Expose endpoints for calculator operations
>   Validate input and handle edge cases (division by zero, invalid data)
>   Return results in JSON format
>
> Non-Functional
>   Clean, readable, and idiomatic code (frontend and backend)
>   Unit tests covering key functionality for both layers
>   Documentation: setup instructions, API usage, and design rationale
>   Optional: Dockerfile for full-stack deployment
>
> Constraints
>   Frontend: React (TypeScript preferred)
>   Backend: Go is preferred
>
> Deliverables
>   Git repository with frontend and backend code
>   README with setup instructions, API examples, and design decisions
>   Unit tests and coverage report
>   Optional: Dockerfile to run frontend + backend together
>
> Instructions
>   Use any AI tooling you would like
>   Spend ~2–4 hours on this assignment. Prioritize correctness, clarity, and maintainability
>   over extra features.
>   Push your solution to GitHub, GitLab, or another Git repository.
>   Share the repository link with us for evaluation.
>   Share any prompts that you used in your work
>   Make sure your README includes:
>     Setup instructions
>     How to run the frontend and backend
>     Examples of API calls (if using REST)
>     Design decisions or assumptions
>
> Please submit here: https://app3.greenhouse.io/tests/...
> ```
>
> After reading it, create a new repository on my GitHub for this project, clone it locally, and
> create a folder inside it to store all the prompts from this conversation that I send you
> (including this one). These prompts must be stored in a `.md` file and must be translated to
> English.
>
> After creating the repository, create the `CLAUDE.md` and put there all the functional and
> non-functional requirements stated in the challenge. All development must be guided by that
> memory so we keep the standard expected by the challenge. Pay attention above all to the
> non-functional requirements: clean, readable and idiomatic code for frontend and backend.
>
> For the functional requirements, we'll build the backend microservice in Go and the frontend in
> React + Vite (TypeScript) with the 4 mandatory operations, and the optional ones in the backlog
> in case they fit within the proposed maximum of 4 hours. The frontend UI will have clickable
> buttons with the digits and operations, similar to a desktop calculator app. In addition, the
> user will be able to type the operations using the keyboard if they want. It will work similarly
> on mobile, but without a place to "type" — only buttons to press.
>
> About input validation and error handling: they will be present in both layers (frontend and
> backend) for security and also for organization reasons. On the frontend, errors/inputs must
> also be validated, following the example of a desktop calculator. Example in the following
> images:
>
> *(attached: two screenshots of the GNOME Calculator — one showing the expression `12÷0` with the
> inline message "Division by zero is undefined", another showing an overflow case with the inline
> message "Overflow: the result could not be calculated", both keeping the calculation history
> visible above the input line)*
>
> In the API, errors must be handled with the correct message and status — we don't want a generic
> 500 error, we don't want a generic panic in the API but graceful error handling. Take these
> things into account beyond the obvious (expose the endpoints, return JSON, responsive design...).
>
> Also consider that we must cover both layers with unit tests and we must include a coverage
> report in the deliverables. It will be something like:
>
> ```bash
> npx vitest run --coverage
> ```
>
> In Go:
>
> ```bash
> go test ./... -coverprofile=coverage.out
> go tool cover -func=coverage.out
> ```
>
> Do this and then I'll give you the next steps.

## Outcome

- Created the GitHub repository `vinicius-francozo/sezzle-calculator` (public) and cloned it locally.
- Created `prompts/` with this log.
- Created `CLAUDE.md` with the full requirements, scope, architecture and quality bar that guide
  every subsequent step.
