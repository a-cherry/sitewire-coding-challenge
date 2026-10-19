# Implementation plan

Step order, scope and acceptance criteria. CLAUDE.md holds the working rules;
DECISIONS.md holds the reasoning and wins any disagreement with this file.

## How each step runs

1. **Review.** From step 2 onward, the `reviewer` subagent reviews the project
   before the step starts: checks output, the previous step's acceptance
   criteria, and drift from the brief, DECISIONS.md and CLAUDE.md. It reports;
   it does not edit.
2. **Decide.** Drew reads the report and says which findings to fix. Fixes
   happen before the step starts, as their own change.
3. **Implement.** The prompt names the step. The agent writes only that
   step's files, shows their full contents, runs typecheck, lint and tests,
   and pastes the real output.
4. **Accept.** Drew reviews the code against the step's acceptance criteria
   and commits. One commit per step. (Drew runs `git init` and commits the
   planning docs before step 1.)

Prompt shape for stage 3, Implement:

> Implement step N of PLAN.md. Follow CLAUDE.md. Write only the files listed in
> step N's scope. Show the full content of each file, run `npm run typecheck`,
> `npm run lint` and `npm test`, paste the output, then stop.

## Target layout

```
.claude/agents/reviewer.md
src/
  constants.ts
  domain/
    types.ts
    latestLogin.ts        latestLogin.test.ts
    inactive.ts           inactive.test.ts
    formatTime.ts         formatTime.test.ts
  api/
    validate.ts           validate.test.ts
    client.ts             client.test.ts
  retry/
    retry.ts              retry.test.ts
  state/
    pageReducer.ts        pageReducer.test.ts
    rowsReducer.ts        rowsReducer.test.ts
  hooks/
    useUsers.ts
    useRowLogins.ts
  components/
    App.tsx               App.test.tsx
    UsersTable.tsx
    UserRow.tsx
    Pagination.tsx
  main.tsx
  styles.css
```

---

## Step 1: Scaffold and reviewer

**Goal.** An empty, strictly configured project with working checks, and the
reviewer subagent in place before any real code.

**Scope.**
- Vite React TypeScript project in the repo root.
- `tsconfig` with `strict` and `noUncheckedIndexedAccess`.
- Vitest with jsdom, React Testing Library, `@testing-library/jest-dom`.
- ESLint as configured by the Vite template.
- `package.json` scripts: `dev`, `build`, `typecheck` (`tsc -b` or
  `tsc --noEmit`, whichever the template's project references need), `lint`,
  `test` (`TZ=UTC LC_ALL=en_US.UTF-8 vitest run`; the environment variables
  pin locale and time zone for formatting tests, per DECISIONS.md "Testing").
- Remove template boilerplate: demo component, logos, demo CSS.
- `src/main.tsx` renders `<App />` inside `StrictMode`.
- `src/components/App.tsx` renders a heading "Users" and nothing else.
- `src/styles.css`, empty or with a minimal reset.
- `src/components/App.test.tsx` with one test: the heading renders.
- `.claude/agents/reviewer.md` with exactly the content in the appendix.
- Report, without acting on it: the installed versions of `react` and
  `eslint-plugin-react-hooks`, whether `useEffectEvent` is exported as stable
  by that React version, and whether the lint config includes the hooks
  plugin's purity rule. If `useEffectEvent` is not stable, say so and stop
  before reporting the step done.

**Out of scope.** Any domain, API, retry, state or UI logic.

**Tests.** The one App test, seen failing (change the expected text), then
passing.

**Acceptance criteria.**
- `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` all
  pass. Output pasted.
- `dependencies` in `package.json` contains only `react` and `react-dom`.
- `strict` and `noUncheckedIndexedAccess` are both `true`.
- `main.tsx` wraps the app in `StrictMode`.
- No template boilerplate remains.
- `.claude/agents/reviewer.md` matches the appendix exactly.

---

## Step 2: Constants and domain logic

**Goal.** The pure functions that decide what the user sees, with no I/O.

**Scope.**
- `src/constants.ts`: `PAGE_SIZE = 25`, `REQUEST_TIMEOUT_MS = 4000`,
  `MAX_RETRIES = 3`, `BACKOFF_BASE_MS = [200, 400, 800] as const` (a 3-tuple,
  indexed by retry number minus 1), `INACTIVE_THRESHOLD_MS` (30 days),
  `FUTURE_LOGIN_TOLERANCE_MS` (5 minutes), `API_BASE_URL`.
- `src/domain/types.ts`: `User`, `Login` (`loginTime` as epoch milliseconds,
  a `number`), and the latest-login result union: `{ kind: "latest"; login }`,
  `{ kind: "none" }`, `{ kind: "allFuture" }`. `now` and `loadedAt` are epoch
  milliseconds everywhere too. No `Date` objects in domain types or state.
- `src/domain/latestLogin.ts`: `latestLogin(logins, now)`.
  - Empty array: `none`.
  - Ignores entries more than `FUTURE_LOGIN_TOLERANCE_MS` after `now`.
  - Non-empty but every entry ignored: `allFuture`.
  - Otherwise the max by timestamp; ties keep the first encountered.
- `src/domain/inactive.ts`: `isInactive(result, now)` per DECISIONS.md:
  `latest` at least 30 days before `now` is inactive; `none` is inactive.
- `src/domain/formatTime.ts`, per DECISIONS.md "Bonuses" and "What the user
  sees per row":
  - `formatRelative(time, now)` via `Intl.RelativeTimeFormat`, long style,
    `numeric: "always"`. Units minutes through years, largest that fits,
    rounded down. A month is 30 days, a year 365. Under one minute, or `time`
    at or after `now`: "just now".
  - `formatExact(time)` via `Intl.DateTimeFormat` with `dateStyle: "medium"`,
    `timeStyle: "long"`.
  - Neither takes a locale or time zone. Both use the runtime's.

**Out of scope.** Parsing raw API data (step 3). Anything React.

**Tests.**
- `latestLogin`: unsorted input picks the max; empty is `none`; a tie keeps
  the first; an entry 4 minutes ahead is kept; an entry 6 minutes ahead is
  ignored and the next-latest wins; all entries ahead is `allFuture`.
- `isInactive`: exactly 30 days before `now` is inactive; 30 days minus 1ms is
  not; `none` is inactive.
- `formatRelative`, fixed `now`: 59 seconds ago is "just now"; a time 2
  minutes after `now` is "just now"; 90 seconds is "1 minute ago"; one case at
  each unit boundary (minutes, hours, days, months, years), including 59 days
  as "1 month ago".
- `formatExact`: one exact expected string, in US English and UTC.
- Prove the environment pin is real: run the `formatExact` test once through
  `vitest run` directly, with `TZ` set to a non-UTC zone (for example
  `TZ=America/Denver`), and show it fail. Run the `formatRelative` tests once
  through `vitest run` directly, with `LC_ALL=de_DE.UTF-8`, and show them
  fail. Then show both passing through `npm test`.
- Every test seen failing first.

**Acceptance criteria.**
- No file in `src/domain` or `constants.ts` imports React or calls
  `Date.now()`.
- Every exported time-dependent function takes `now`.
- No function takes a locale or time zone parameter.
- Checks pass. Output pasted.

---

## Step 3: API module

**Goal.** Single-attempt calls to the two endpoints that return either valid
domain data or a classified failure. No retries yet.

**Scope.**
- `src/api/validate.ts`:
  - `parseUsers(json: unknown)`: array of `{ id: number, first_name, last_name,
    email: string }` mapped to `User[]`, or invalid. Duplicate ids are
    invalid. An empty array is valid.
  - `parseUserLogins(json: unknown, requestedId: number)`: object with numeric
    `user_id` equal to `requestedId` and a `logins` array whose every entry has
    a parseable `login_time` string and a string `ip_v4`, mapped to `Login[]`,
    or invalid. Any bad entry invalidates the whole response.
  - Returns a result union, never throws.
- `src/api/client.ts`:
  - A failure union: `{ kind: "http"; status }`, `{ kind: "network" }`,
    `{ kind: "timeout" }`, `{ kind: "invalid" }`, `{ kind: "aborted" }`.
  - `fetchUsers(signal)` and `fetchUserLogins(userId, signal)`, each one
    attempt, each returning `{ ok: true; value } | { ok: false; failure }`.
    Never throw.
  - Per-attempt timeout of `REQUEST_TIMEOUT_MS`, implemented with
    `setTimeout` and an internal `AbortController` (not `AbortSignal.timeout`)
    so fake timers control it in tests.
  - The caller's `signal` aborting produces `aborted`. The internal timeout
    firing produces `timeout`. When the client classifies a fetch rejection,
    it checks the caller's signal first: if the caller has aborted, the result
    is `aborted` even if the timeout also fired. A result already returned as
    `timeout` before the caller aborted stands.
  - Non-2xx: `http` with the status; body ignored. Fetch rejection that isn't
    an abort: `network`. 2xx that fails validation or isn't JSON: `invalid`.
  - The timeout timer is cleared on every exit path.

**Out of scope.** Retries, backoff, any knowledge of rows or pages.

**Tests.** With `fetch` stubbed (`vi.stubGlobal`) and fake timers:
- `validate`: a valid users payload; a user with a numeric `email`; duplicate
  user ids are invalid; an empty users array is valid; valid logins; `user_id` mismatch; one entry with an unparseable `login_time`;
  `logins` missing; empty `logins` is valid.
- `client`: 200 valid; 500 is `http` 500 with a non-JSON body; network
  rejection is `network`; a response slower than 4s is `timeout`; caller abort
  is `aborted`; the timeout firing and the caller aborting in the same tick,
  before the fetch rejection is classified, is `aborted`; 200 with invalid
  body is `invalid`.
- Every test seen failing first.

**Acceptance criteria.**
- `client.ts` is the only file in `src` that references `fetch`.
- No function in `src/api` throws for any server response.
- Nothing outside `src/api` imports from `validate.ts` or uses raw response
  types.
- Checks pass. Output pasted.

---

## Step 4: Retry

**Goal.** One generic retry wrapper that turns a single-attempt call into the
retry policy in DECISIONS.md.

**Scope.**
- `src/retry/retry.ts`:
  - `withRetry(attempt, { signal, random, onRetry })`. `attempt` is a function
    taking a signal and returning the client's result union.
  - Retries on `http` 5xx, `network`, `timeout`. Stops on success, other
    `http` statuses, `invalid` and `aborted`.
  - Up to `MAX_RETRIES` retries after the first attempt.
  - Retries are numbered 1 to 3. Backoff before retry n is drawn uniformly
    between half of `BACKOFF_BASE_MS[n - 1]` and the full value, using the
    injected `random`.
  - `onRetry(attemptNumber)` is called as soon as an attempt fails and a
    retry will follow, before the backoff wait, so callers can show
    "Retrying…" immediately. `attemptNumber` is the number of the attempt
    about to run (2 to 4).
  - The backoff sleep resolves early and returns `aborted` the moment `signal`
    aborts. No further attempts after an abort.
  - Returns the last attempt's result.

**Out of scope.** Knowledge of users, rows or React.

**Tests.** Fake timers, injected `random`, a scripted fake `attempt`:
- Success first try: one call, no `onRetry`.
- Two 500s then success: three calls, `onRetry` called with 2 then 3, each
  before its backoff timer elapses.
- Four 500s: four calls, final result is the 500.
- 404: one call, no retry.
- `invalid`: one call, no retry.
- `timeout` then success: retried.
- Backoff durations at `random = 0` and `random` just under 1 match the
  bounds.
- Abort during backoff: resolves `aborted` without waiting out the timer and
  makes no further calls.
- Every test seen failing first.

**Acceptance criteria.**
- No `Math.random()` or `Date.now()` in `retry.ts`; both are injected or
  irrelevant.
- No React imports.
- Checks pass. Output pasted.

---

## Step 5: Reducers

**Goal.** The page and row state machines as pure functions, matching the
tables in DECISIONS.md exactly.

**Scope.**
- `src/state/pageReducer.ts`: `loading | error | loaded{ users, loadedAt }`,
  with events `usersLoaded{ users, loadedAt }`, `usersFailed`,
  `retryRequested`.
- `src/state/rowsReducer.ts`: state is a map from user id to row state, per
  DECISIONS.md "Row state machine".
  - Row states: `idle`, `loading{ token, attempt }`, `loaded{ login }`,
    `neverLoggedIn`, `unavailable`.
  - Events: `loadStarted{ userId, token }`,
    `attemptFailed{ userId, token, attempt }`,
    `succeeded{ userId, token, result }`, `failed{ userId, token }`,
    `pageChanged` (no payload).
  - `succeeded.result` is typed as `latest | none` only, so `allFuture` can't
    be dispatched. No `aborted` event exists.
  - `attemptFailed` sets `attempt` to the event's value; the reducer does not
    increment.
  - A user id with no entry is `idle`.
  - Any token-carrying event whose token isn't the row's current token
    returns the state unchanged (same object reference). Rows without a token
    ignore every token-carrying event.
  - `pageChanged` returns every `loading` row to `idle` and leaves every other
    row unchanged. Only the page being left has requests in flight, so it
    needs no list of ids.
  - `loadStarted` is only valid from `idle` or `unavailable`. Invalid
    transitions (for example `loadStarted` on a `loaded` row) return the state
    unchanged.
  - Exhaustive switches with `never` checks.

**Out of scope.** Generating tokens, timestamps or requests. React.

**Tests.** One test per row of the DECISIONS.md transition table, plus:
- A stale token on each of `attemptFailed`, `succeeded`, `failed` leaves
  state unchanged.
- A token-carrying event on a row with no token (for example `succeeded` on
  an `idle` row after a page change) leaves state unchanged.
- `pageChanged` returns a `loading` row to `idle`, never `unavailable`.
- `pageChanged` leaves `loaded`, `neverLoggedIn` and `unavailable` rows
  unchanged.
- `loadStarted` on a `loaded` row leaves state unchanged.
- The page reducer: one test per transition, including `loadedAt` carried
  into `loaded`.
- Every test seen failing first.

**Acceptance criteria.**
- Every transition in DECISIONS.md has a test, and every test maps to a
  transition or rule there.
- Reducers are pure: no time, randomness, I/O or React imports.
- Checks pass. Output pasted.

---

## Step 6: Hooks

**Goal.** Connect the API, retry and reducers to React with correct effect
cleanup. The only place `Date.now()`, `Math.random()` and tokens appear.

**Scope.**
- `src/hooks/useUsers.ts`: runs `withRetry(fetchUsers)` on mount and on
  `retryRequested`, dispatching page events. On success, stamps `loadedAt`
  with `Date.now()` inside the callback. Aborts on unmount. Drops an `aborted`
  result without dispatching; under StrictMode the first request is aborted
  and dropped, and the second request's result lands.
- `src/hooks/useRowLogins.ts`: given the page index and the user list:
  - The page-change effect depends on the page index and the user list only,
    and works out the page's ids itself. It reads current row state through
    `useEffectEvent`.
  - On page change, starts a load for every row that is `idle` or
    `unavailable`. `loaded` and `neverLoggedIn` rows make no request.
  - Each request gets a fresh token (a counter in a ref is enough).
  - Maps `onRetry` to `attemptFailed`. On a logins response, calls
    `latestLogin` with `Date.now()` taken in the callback; maps `allFuture` to
    `failed`.
  - Drops an `aborted` result without dispatching.
  - Passes `Math.random` to `withRetry` as its `random`.
  - Exposes `retry(userId)`: sends `loadStarted` and runs a load for an
    `unavailable` row. Ignored for any other state.
  - Effect cleanup on page change aborts every in-flight request for the page
    being left, including loads started by `retry`, and dispatches
    `pageChanged`.
  - Uses `AbortController` per request.
- Behaves correctly under StrictMode's double-invoked effects: the first
  effect's cleanup dispatches `pageChanged`, its rows return to `idle`, and the
  second effect loads them again.

**Out of scope.** Rendering. Page index state lives in the component that owns
pagination (step 7).

**Tests.** None in this step. The hooks are covered by step 7's component
tests; their logic lives in already-tested modules. Record this in the step's
report.

**Acceptance criteria.**
- `Date.now()`, `Math.random()` and token generation appear only in the
  hooks, and `Date.now()` only inside request callbacks.
- No hook derives state that could be computed during render.
- Row state changes do not re-run the page-change effect.
- Every effect returns a cleanup that aborts its requests.
- Neither hook dispatches anything for an `aborted` result.
- No app code (hooks, domain, API, retry, reducers) takes a parameter whose
  only purpose is testing.
- Checks pass. Output pasted.

---

## Step 7: UI

**Goal.** Render every page and row state as specified, with pagination.

**Scope.**
- `App.tsx`: owns the page index. Renders by page state:
  - `loading`: "Loading users…".
  - `error`: "Couldn't load users." and a Try again button.
  - `loaded`: the total count ("1,000 users"), `Pagination`, `UsersTable`.
    With zero users: "0 users" and "No users to show.", and no pagination.
- `Pagination.tsx`: Prev, "Page N of M", Next. Prev disabled on page 1, Next
  on the last page. Enabled while rows are loading.
- `UsersTable.tsx`: columns ID, Full name, Email, Last login, IP.
- `UserRow.tsx`: renders the "What the user sees per row" table in
  DECISIONS.md exactly, including:
  - hover text on loaded login cells: the exact time;
  - the "Inactive" badge and row tint on `loaded` and `neverLoggedIn` rows
    per the inactive rule;
  - on `unavailable` rows only, a Try again text button in the login cell,
    with accessible label "Try loading login data for {full name} again".
- `styles.css`: table layout, row tint, badge, muted state text. Plain and
  minimal.
- Rows keyed by user id. The display `now` is the page state's `loadedAt`,
  passed down. Nothing calls `Date.now()` during render.

**Out of scope.** Sorting, Refresh all, Refresh page, refresh on loaded rows,
country, URL state, mobile layout.

**Tests.** `App.test.tsx`, `fetch` stubbed, fake timers to move through
backoff, `vi.setSystemTime` for a known `loadedAt`, and
`vi.spyOn(Math, "random").mockReturnValue(0)` for deterministic jitter. Keep it
to a few:
- `/users` failing four times shows "Couldn't load users." and Try again; Try
  again then success shows the table and the count.
- A loaded page shows the count from `/users`, 25 rows, and the right
  "Page 1 of 40".
- A row whose logins endpoint fails four times shows "Unavailable" and Try
  again; clicking Try again with a successful response shows the login. A row
  with an empty logins array shows "Never logged in" and the Inactive badge.
- Every test seen failing first.

**Acceptance criteria.**
- Every state in the DECISIONS.md row table renders with the specified text.
- The count never renders outside the loaded page state.
- No error message other than the page-level one exists anywhere in the UI.
- No state is available only through hover text. The exact time on hover is
  supplementary.
- Checks pass. Output pasted.

---

## Step 8: Manual verification against the live API

**Goal.** See every state in a real browser against the real flaky API, and
fix only what this surfaces.

**Scope.** No new features. Drew runs `npm run dev` and walks this checklist;
the agent fixes defects found, one at a time, each confirmed before the next.

- Page 1 fills progressively; some rows show "Retrying…" before settling.
- At least one "Unavailable" row appears over a few reloads, and its Try
  again button recovers it. (If none appears naturally, block the API domain
  in dev tools after `/users` loads, then page forward.)
- Loaded rows have no button.
- Paging away mid-load and back: aborted rows reload; loaded rows don't
  refetch (network tab).
- StrictMode: on first load, the first set of requests shows as cancelled in
  the network tab and the second set completes.
- The count shows 1,000 and only after `/users` loads.
- Inactive badges appear on old and never-logged-in rows.
- Hover text shows the exact time with a time zone abbreviation.
- Blocking the API domain in dev tools produces the page error state, and
  Try again recovers after unblocking.

**Acceptance criteria.**
- Every checklist item observed. Anything not observable is recorded with why.
- Drew records fixes, if any, in AI_USAGE.md as they happen. The agent edits
  it only when asked, with content Drew provides.
- Checks pass. Output pasted.

---

## Step 9: Documents and final review

**Goal.** The written deliverables, then a full review against the brief.

**Scope.**
- `README.md` and `NEXT_STEPS.md`, per the "Required deliverables" section of
  DECISIONS.md. Content drawn only from DECISIONS.md, the code, and content
  Drew provides in the prompt (for example, time spent).
- The final pass of `AI_USAGE.md`, only with content Drew provides.
- The `reviewer` subagent runs a final full review: every item in "Brief
  requirements the code must satisfy," every CLAUDE.md rule, and every claim in
  README.md checked against the code.

**Acceptance criteria.**
- Every brief requirement is met and pointed to in code.
- Every README claim is backed by code or a test.
- No doc contains a justification that isn't in DECISIONS.md.
- Checks and build pass. Output pasted.

---

## Appendix: `.claude/agents/reviewer.md`

````markdown
---
name: reviewer
description: Read-only reviewer. Run before each PLAN.md step to check the project against the brief, DECISIONS.md, CLAUDE.md and the previous step's acceptance criteria. Reports findings; never edits.
tools: Read, Grep, Glob, Bash
---

You review this project. You do not change it. Do not edit, write, move or
delete any file, and do not run any command that modifies files, installs
packages or touches git state. Bash is for running checks only. The one
exception: build caches and `.tsbuildinfo` files that the check scripts write
themselves.

Inputs: CLAUDE.md, DECISIONS.md (which contains the brief verbatim), PLAN.md,
and the code. You will be told which PLAN.md step was just completed.

Do this, in order:

1. Run `npm run typecheck`, `npm run lint` and `npm test`. Paste the output
   verbatim, including failures.
2. For each acceptance criterion of the completed step, report PASS or FAIL
   with evidence: file path, line number and the quoted code, or the command
   output that proves it.
3. Check for drift. Read every file changed in the completed step and report
   anything that contradicts the brief, DECISIONS.md, or CLAUDE.md, including:
   files outside the step's scope, dependencies added, out-of-scope features,
   comments that break the Comments rules, and any claim in a doc that the
   code doesn't support.
4. Check that work from earlier steps hasn't regressed.

Every finding must include: file and line, the quoted code, and the specific
rule it violates (CLAUDE.md section, DECISIONS.md section, or brief line).
Never paraphrase code in place of quoting it. If you cannot find evidence for
a criterion, report it as FAIL with "no evidence found", not PASS.

End with a summary table: finding, severity (blocker / should fix / note),
rule violated. Do not suggest fixes beyond one line each. Do not rank the
author's decisions; check the code against them.
````