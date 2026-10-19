# Project context

Sitewire take-home exercise: a React + TypeScript single-page app that lists
users from `https://fake-users-api.vercel.app` alongside each user's most
recent login. The API fails roughly 25 to 30% of requests and takes up to
~3s to respond, including when it fails.

Small, reviewable, defensible. The author presents this code and must explain
every line. Reviewers care about the states the app and its data can be in,
displaying correct information, and how technical decisions affect the user's
experience. Clarity beats cleverness everywhere.

## Sources of truth

- The brief, reproduced verbatim in DECISIONS.md, defines WHAT to build.
- DECISIONS.md defines HOW. Where the brief leaves something open or appears
  to conflict with a decision, DECISIONS.md wins.
- PLAN.md defines step order, scope, and acceptance criteria for each step.
- This file defines working rules.
- If you believe a decision is wrong, say so in your response and stop. Do not
  change the approach in code. Proposals go in your response, never in code or
  docs.

## Working style

- Work only on the plan step named in the prompt. Write the files that step
  names, then stop. Do not start the next step.
- Do not create files the step does not name. Do not add dependencies.
- Do not turn off or downgrade a lint rule, and do not add an
  `eslint-disable` comment. If a rule fires on code the plan specifies, stop
  and report the rule, the file and line, and the quoted code.
- Edit files in place. Never append a second copy of an existing block,
  import, or config section.
- After writing or editing, show the full content of every changed file, or
  the exact diff for large files. Do not describe changes in place of showing
  them.
- If you did not complete an instruction, say so plainly as an instruction not
  followed. Never present a skipped instruction as a finding about the code.
- Do not add content to markdown docs that is not present in DECISIONS.md, in
  the code itself, or in content Drew provides in a prompt. Do not invent
  justifications.
- Do not edit AI_USAGE.md unless Drew asks, and then only with content he
  provides.
- Before reporting a step done, run typecheck, lint, and tests, and paste the
  real output. A step with failing checks is not done.

## Tests

- Write tests in the step PLAN.md assigns them to, not earlier.
- A test is not evidence until it has been seen failing. For each new test,
  break the code under test or invert the assertion, show the failure,
  restore, and show it passing.
- Assert exact values where they are knowable. No `toContain` or truthiness
  checks standing in for an exact expectation.
- Unit tests on pure modules are the core of the suite. Use React Testing
  Library only where PLAN.md calls for it.
- Time, randomness, locale and time zone are controlled in tests. Pure modules
  take `now` and `random` as parameters, and their tests pass fixed values.
  Component tests use fake timers, `vi.setSystemTime`, and
  `vi.spyOn(Math, "random")`. Locale and time zone are pinned by the `npm test`
  script's environment variables (`TZ=UTC`, `LC_ALL=en_US.UTF-8`). Never add a
  parameter to app code whose only purpose is testing.
- Tests never call the real API.

## Review protocol

- From step 2 onward, before each plan step begins, the `reviewer` subagent
  (`.claude/agents/reviewer.md`, created in step 1) reviews the project. It is
  read-only.
- It reports on:
  - typecheck, lint, and test output, pasted verbatim;
  - each acceptance criterion of the previous step, pass or fail, with
    evidence;
  - drift from the brief, DECISIONS.md, and this file.
- Every finding cites file and line, quotes the code, and names the rule it
  violates (a section of this file, a DECISIONS.md entry, or a line of the
  brief). Quoted code, not paraphrase.
- The reviewer reports. It never edits.
- The implementing agent does not act on findings until Drew says which ones
  to address.

## Comments

Comment with restraint. Reviewers judge the first file they open, and a wall
of prose reads worse than terse code.

- No JSDoc or TSDoc blocks (`/** */`) anywhere. Inline `//` only.
- Comment where the REASON is not visible from the code, and nowhere else.
  Never restate what a line does, never describe a type's obvious purpose,
  never explain a name that already explains itself.
- Length follows the idea. A subtle invariant may warrant several lines. Most
  warrant one.
- Never reference a type, function, or file that does not exist yet.
- Design reasoning belongs in DECISIONS.md. Inline comments point at a
  constraint; they do not argue for it.

The test: deleting the comment would let a future reader make a change that
silently breaks something. If deleting it only removes prose, delete it.

## Stack

- Vite, React (current stable at scaffold time), TypeScript.
- Vitest and React Testing Library. npm.
- ESLint with `typescript-eslint`, `eslint-plugin-react-hooks` (recommended
  config) and `eslint-plugin-react-refresh`. Not oxlint.
- Runtime dependencies are `react` and `react-dom` only. No data-fetching
  library (no TanStack Query, no SWR), no state library, no router, no date
  library, no UI or CSS framework.
- Plain CSS in a single stylesheet.
- Humanized times use `Intl.RelativeTimeFormat`; exact times use
  `Intl.DateTimeFormat`.

## TypeScript rules

- `strict` and `noUncheckedIndexedAccess` on.
- No `any`. No non-null assertions (`!`). No `as` casts other than `as const`.
- API responses enter as `unknown` and are validated into domain types inside
  the API module. Nothing outside the API module sees a raw response shape.
- State is modeled as discriminated unions. Every `switch` over a union is
  exhaustive, with a `never` check in the default branch.

## React rules

- Function components and hooks only.
- State machines live in reducers that are pure, exported, and tested without
  React.
- Derive values during render. No `useEffect` for derived state.
- Effects exist only to synchronize with the network, and always clean up with
  `AbortController`. Code must behave correctly under StrictMode's
  double-invoked effects.
- An effect that needs the latest state without re-running when it changes
  reads it through `useEffectEvent`, per DECISIONS.md "React patterns". There
  is no fallback pattern. If `useEffectEvent` is not available as stable in
  the installed React, stop and report it.
- Key list items by user id, never by index.
- No `useMemo`, `useCallback`, or `React.memo` without a measured reason.
- Components render state. They do not decide transitions.

## Architecture rules that are not negotiable

**Module boundaries**

- Only the API module calls `fetch`.
- Retry, domain logic (latest login, inactive check, time formatting), and
  reducers import nothing from React.
- Every function that depends on the current time takes `now` as a parameter.
  `Date.now()` is called only in hooks, inside request callbacks. Never during
  render, never in a domain module. `Math.random()` is called only in hooks.
- Times are epoch milliseconds (`number`) in all domain types and state. `Date`
  objects appear only inside formatting functions.
- Tunables (page size, timeout, retry count, backoff, inactive threshold,
  future-login tolerance) live in one constants module.

**Requests**

- Retry only on 5xx responses, network errors, and timeouts.
- A navigation abort and a timeout are distinguishable. A timeout is
  retryable. A navigation abort is not retried and is never treated as a
  failure. If the caller's signal has aborted, the result is an abort even if
  the timeout also fired.
- The backoff sleep ends immediately when its request is aborted.
- An `aborted` result is dropped by the hook that started the request. It is
  never dispatched, to either reducer.
- Every row request carries a request token. A response is applied only if its
  token is still that row's current token. This is an out-of-order response
  guard, not idempotency; do not name it idempotency anywhere.

**Row state**

- The most recent login is the maximum by parsed timestamp, ignoring entries
  more than the future-login tolerance after `now`. Never array position, never
  string comparison. If every entry is ignored, the response is invalid.
- Row states are `idle`, `loading`, `loaded`, `neverLoggedIn`, `unavailable`.
  `loaded` and `neverLoggedIn` are final for the session.
- On page change, the `pageChanged` event returns every `loading` row to
  `idle` immediately. Aborted requests that resolve afterward are dropped by
  the hook, not dispatched. There is no `aborted` event. Abort never produces
  `unavailable`.
- Event types make invalid events unrepresentable: `succeeded` carries only
  `latest` or `none`.
- `unavailable` comes only from a load that fails after all retries or
  returns an invalid response.
- Visiting a page fetches rows that are idle or unavailable. Loaded and
  never-logged-in rows render from cache with no request.
- Try again appears only on `unavailable` rows and starts a load.

**Page state**

- The only error message in the app is the page-level `/users` failure. Every
  row outcome is a state shown as visible text, never as an error message.
- The total user count renders only in the loaded page state.
- The display `now` (humanized times, inactive check) is `loadedAt`, stamped
  when `/users` loads. Nothing reads the clock during render.

## Deliberately out of scope

Do not implement these. The ones kept as future work are recorded in
NEXT_STEPS.md.

- Sorting of any column.
- Background loading of logins for users off the current page, and any
  concurrency cap or worker pool.
- Refresh all and Refresh page controls.
- Refreshing a row that loaded, a `refreshing` state, and any "couldn't
  refresh" flag.
- Auto-refresh on page visit, and any staleness window or TTL policy.
- "Updated N min ago", a `fetchedAt` field, and any ticking clock.
- Country lookup from IP.
- Page number in the URL.
- Mobile-specific layout.
- Special handling of 429 / Retry-After.