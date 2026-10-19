# AI usage

## Summary

_To be written at the end, once implementation is done._

## Tools

- **Claude (chat)** for planning. Requirements, the loading strategy, the
  retry policy, the row state machine and the cut list were worked out in a
  planning session before any code was written, and captured in `CLAUDE.md`
  (rules the implementing agent follows), `DECISIONS.md` (reasoning, and the
  source of truth for these docs) and `PLAN.md` (step order and acceptance
  criteria).
- **An independent reviewer agent** spawned from the planning chat to assess
  the plan before it was locked, since the planning assistant had proposed
  parts of what was being assessed.
- **Claude Code** for implementation, one plan step at a time, with a
  read-only `reviewer` subagent checking the project before each step.

## Method

The implementing agent gets a contract, not a problem. `CLAUDE.md` pins the
working rules and the architecture rules, `DECISIONS.md` holds the brief
verbatim plus every decision and its reasoning, and `PLAN.md` breaks the build
into nine steps with explicit scope and acceptance criteria. Where the brief
leaves something open, `DECISIONS.md` decides, and the agent is told to stop
and say so rather than change the approach in code.

Working rules that keep the agent's output verifiable:

- The agent shows file contents instead of summarizing changes, so what I
  review is what landed.
- A skipped instruction is reported as skipped, never as a finding about the
  code.
- A test only counts once it has been seen failing.
- Files are edited in place, never appended to.
- Comments only where the reason isn't visible in the code; rationale lives in
  `DECISIONS.md`.

Before every step, a separate read-only subagent reviews the project rather
than the agent that wrote the code. It reports findings with quoted code and
file and line, and never fixes anything. That puts the check for drift from
the brief and the decisions on a schedule instead of relying on me noticing.

## Planning session

**Probing the API before designing.** The assistant couldn't fetch the API
itself (the site blocks automated access), so I ran the `curl` probes it asked
for. They changed the design:

- 1,000 users, not a handful, which turns the per-user logins endpoint into a
  1,000-request fan-out and ruled out loading everything up front.
- CORS is open, so a browser app can call the API directly with no proxy.
- Logins arrays are unsorted, so "most recent" has to be a max by timestamp.
- 9 of 30 sampled requests failed, and failures were as slow as successes
  (up to 2.6s). That shaped the retry math.
- The same user's data was identical 60 seconds apart, which is what later
  justified dropping auto-refresh.

**Language.** I leaned Java because it's my strongest language. The assistant
argued for TypeScript and React instead: the brief's emphasis on states and
the experience of using the app is easier to show in a UI where rows fill in
and fail independently, and it matches Sitewire's target stack. I went with
TypeScript and React, and chose hand-rolled fetching over TanStack Query so
that every state transition is code I wrote and can explain, since React isn't
my strongest area.

**Retry and timeout.** The assistant proposed a 5s per-attempt timeout. I
pushed back that it could mean ~20s for a row that keeps failing. Its
response was that the timeout rarely drives the worst case here, because this
API's failures return in under 3s rather than hanging; what drives load time
is retry count, and what drives perceived load time is rendering rows as they
arrive. We settled on a 4s timeout (above the ~3.3s observed max) and 3
retries, with the failure math written into `DECISIONS.md`.

**Failed rows.** The assistant proposed keeping failed rows with a page-level
"Retry failed" summary. I didn't want to push work onto the user, and my first
instinct was to omit failed rows and list them separately. After walking
through the tradeoffs (we already have those users' profile data, and
omitting rows makes the visible list disagree with the count), I chose to keep
every row, show its state in place, and put a refresh button on every row
that both retries failures and refetches loaded data. I also set the rule
that the only error message in the app is the page-level failure; every row
outcome is a state. I later narrowed the button to failed rows only (see the
second review below).

**Independent review of the plan.** Before writing any docs, I asked for a
senior-level evaluation of the strategy against the brief, delegated to a
separate agent because the planning assistant had proposed parts of it. It
found:

- **A brief violation.** I had asked to split Full name into First and Last
  name columns to support sorting. The brief asks for Full name. Reverted.
- **Scope the brief never asked for:** sorting, Refresh all and Refresh page,
  background loading of every user's logins, and auto-refresh on page visit.
  All cut and moved to `NEXT_STEPS.md`.
- **Undefined correctness rules:** what an aborted request does to a row, how
  a navigation abort differs from a timeout, whether the backoff sleep stops
  on abort, and how a late response is kept from overwriting newer state.
  All now specified in `DECISIONS.md` with tests planned for each.
- **States that were too quiet.** A bare ✕ with a hover tooltip for a failed
  row. Replaced with visible text ("Unavailable", "Retrying…"), since `title`
  tooltips don't show on keyboard focus or touch.
- **Naming.** "No logins" marked Inactive conflated two facts; it became
  "Never logged in".

I kept two things it recommended cutting: separate `NEXT_STEPS.md` and
`AI_USAGE.md` files, and a review before every step rather than at two
checkpoints. Both cost time; I chose them because the presentation relies on
the docs, and because drift caught one step late is cheaper than drift caught
at the end.

**Second review, after the docs were revised.** I asked for a quick check
that the revised plan was still on-brief, again from a separate agent. It
found every brief requirement covered, and flagged refreshing rows that had
already loaded as the largest piece of scope left. The data is stable, so a
refresh would almost always return the same thing, yet it accounted for a
`refreshing` state, a "Couldn't refresh" flag and its clearing rules, and most
of the abort edge cases. I cut it: only failed rows get a Try again button,
and row refresh is in `NEXT_STEPS.md`.

## What the AI got wrong

- **Proposed scope and policy that didn't earn its place.** The assistant
  suggested auto-refreshing every row on page revisit and a 5-minute staleness
  window. The independent review flagged both: the data is stable, so
  auto-refresh doubled traffic and routed every revisit through the transition
  where abort and ordering bugs live. Both cut.
- **Built on features outside the brief without flagging them.** When I asked
  for sorting and Refresh all, the assistant designed them in detail instead
  of pointing out that the brief asks for neither, and it accepted the
  First/Last name split even though the brief says Full name. It took the
  delegated review to surface that.
- **Left design decisions for the implementing agent.** The first draft of
  `PLAN.md` told the agent to decide whether a caller abort after a timeout
  counts as an abort or a timeout, and whether times are `Date` objects or
  epoch milliseconds. The assistant flagged both before handoff and I decided
  them: caller abort always wins, and epoch milliseconds everywhere.
- **Proposed displaying future login timestamps as returned.** I rejected it:
  a login can't happen in the future, so that entry is bad data. The assistant
  then pointed out that `now` comes from the user's clock, so a slightly slow
  clock would drop a login from seconds ago; that is where the 5-minute
  tolerance came from.
- **(Step 2) Wrong space in the exact-time test.** The agent wrote the
  `formatExact` expectation in `formatTime.test.ts` with a narrow no-break
  space (`\u202f`) before "AM". Node v24.14.1 outputs a plain space. Caught by
  the test failing against the real implementation; the agent confirmed it
  with a byte dump of the `Intl` output and corrected the expected string.
- **(Step 2) Unreadable test names.** The first `test.each` table in
  `formatTime.test.ts` printed each case's timestamp where the expected text
  should be, for example `90 seconds ago is "1792411110000"`. The agent caught
  it in its own test output and changed the table so the names show the
  expected text.
- **(Step 2) Mutation runs without the time zone pin.** The agent ran its
  `formatTime` mutation checks through `npx vitest run` directly, without
  `TZ=UTC`, so `formatExact` failed in every run for an unrelated reason. The
  agent noticed the stray MDT failures and reran the checks with the pin.
- **(Step 2) A grep that hid evidence.** The agent's acceptance check for
  `now` parameters filtered out lines containing "test", which also hid
  `latestLogin`. The agent caught it and showed the signature from the file.
- **(Step 2) The reviewer flagged an untested cleanup test that had been seen
  failing.** In the review before step 2, the reviewer rated the second test
  in `src/test/cleanup.test.tsx` "should fix" for having no evidence of
  failing first. The agent had already shown it failing, with
  `afterEach(cleanup)` removed. The reviewer only checks the repo, and the
  conversation isn't in it.
- **(Step 3) A grep that zsh rejected.** The agent's first acceptance check
  for `fetch` references used `grep --include=*.ts`, which zsh expanded as a
  glob and failed with "no matches found" before any check ran. The agent
  caught the error and reran the checks without the flag.
- **(Step 4) Backoff test assumed fractional delays fire on time.** The agent
  wrote the `random 0.999` case in `retry.test.ts` to expect the backoffs to
  end at 200, 400 and 800ms. `setTimeout` truncates its delay to whole
  milliseconds, so a 199.9ms backoff fires at 199ms. Caught by the test
  failing against the real `retry.ts`. The agent changed the expectation to
  199, 399 and 799ms, which are still below each base.
- **(Step 4) Unused parameter in a test helper.** The `scripted` helper in
  `retry.test.ts` declared a `_signal` parameter it never used, and
  `@typescript-eslint/no-unused-vars` failed the lint check. Caught by
  `npm run lint`. The agent typed the mock as
  `vi.fn<(signal: AbortSignal) => Promise<Result<string>>>`, the way
  `client.test.ts` types its `fetch` mock.
- **(Step 4) The "failing on 7 tests" count for the Step 3 timer check is out
  of date.** In the review before Step 4, the reviewer said the claim couldn't
  be checked and that the current code should fail more tests. The agent
  removed `clearTimeout(timer)` from `client.ts` and ran the client tests: 9
  of 11 failed, which matches the reviewer's count. The agent then restored
  the file.
- **(Step 4) An abort before the backoff starts was untested.** The
  `if (signal.aborted)` check at the top of `sleep` in `retry.ts` had no test:
  the abort test only aborted during the wait, so deleting the check left all
  55 tests passing. Without it, an abort that lands before the backoff starts
  waits out the full backoff and makes one more attempt. The agent noticed
  the gap while fixing the reviewer's comment finding on `sleep`, and added
  `an abort before the backoff starts resolves aborted at once and makes no
  further calls`. It showed the test failing with the check removed (a 5s
  test timeout and one leftover timer) and passing with it restored.
- **(Step 5) Guards no test protected.** The first Step 5 tests followed the
  `PLAN.md` list, which left reducer guards that could be weakened with every
  test still passing. In `rowsReducer.ts`, `loadStarted` was rejected from
  `loading`, `loaded` and `neverLoggedIn` but tested only on `loaded`, and the
  tokenless-row tests used only `idle`. In `pageReducer.ts`, the guards that
  ignore events outside the table had no tests. The agent listed these gaps
  in its step report. The reviewer then found two more: no `idle` row in the
  `pageChanged` unchanged-rows test, and 3 of the 6 ignored page events
  untested. The agent added the tests and showed each failing under a break
  that passed the old tests: `loadStarted` rejected only from `loaded`, only
  `idle` rows ignoring token events, `pageChanged` replacing `idle` rows, and
  each page guard narrowed to reject a single state.
- **(Step 5) A double-click race that React 19 doesn't have.** To justify
  testing `loadStarted` on a `loading` row, the agent said a double click on
  Try again could dispatch a second `loadStarted` before React re-rendered.
  It corrected itself in its next answer: React 19 finishes the first click's
  update before handling the second, so the button is already gone. The test
  still guards against a hook bug that starts a load on a row already
  loading.
- **(Step 5) Ungrammatical test names.** The first tokenless-row `test.each`
  in `rowsReducer.test.ts` printed names like `attemptFailed on a idle row
  with no token`. The agent caught it in its own test output and renamed the
  cases to `$name on $row.kind, which holds no token, leaves state
  unchanged`.
- **(Step 5) Reviewer run widened without asking.** I asked for a review of
  the Step 4 work before the Step 5 commit. The agent assumed I meant Step 5
  and launched the reviewer on Step 5 plus a recheck of Step 4's acceptance
  criteria, and explained only once it was running. I stopped it and asked
  for a Step 5 review.
- **(Step 6) An `any` that the checks didn't catch.** The agent's first
  `useRowLogins.ts` started row state as `new Map() satisfies RowsState`.
  `satisfies` checks the value without changing its type, so the map stayed
  `Map<any, any>`, which breaks the no-`any` rule even though `tsc` and lint
  passed. The agent caught it while checking its own code, changed it to
  `new Map<number, RowState>()`, and reran the checks.
- **(Step 6) The same rejected grep as Step 3.** The agent's acceptance check
  for `Date.now`, `Math.random` and token generation used
  `grep --include=*.ts` again, and zsh failed with "no matches found" before
  any check ran. The agent caught the error and reran the grep without the
  flag.
- **(Step 6) A comment that called retrying a state.** `useUsers` passes a
  no-op `onRetry` to `withRetry`, and the agent's comment on it read "The
  page state has no retrying state to show." I pointed out that retrying is
  an action, not a state: rows show "Retrying…" as a way of displaying
  `loading`, not as a separate state. At my direction the agent changed the
  comment to `/users retries aren't shown; the page stays on "Loading
  users…" until it settles.`
- **(Step 7) Retry tests that didn't count attempts.** The `/users` failure
  test and the Unavailable row test in `App.test.tsx` checked the final
  message but not how many requests were made, so a hook that gave up after
  one attempt would still pass. None of the agent's six mutation runs touched
  the attempt count. Caught by the reviewer. The agent added a `requestsTo`
  helper and asserted 5 calls for each, StrictMode's aborted first request
  plus four attempts, and showed both failing with `MAX_RETRIES` set to 1.
- **(Step 7) `React.ReactNode` without an import.** The first `UserRow.tsx`
  typed a parameter as `React.ReactNode` without importing `React`. The agent
  caught it in its own code before running the checks and changed it to
  `import type { ReactNode } from 'react'`.
- **(Step 8) A fail-first run that skipped an assertion.** To show the N5 test
  `a row whose latest login is 30 days old shows the Inactive badge and tint`
  failing, the agent removed the loaded-row inactive check in `UserRow.tsx`.
  The test failed on the cell text, so the `toHaveClass('inactive')`
  assertion after it never ran. The agent caught it in its own output and
  ran a second break that removed only the row class, which failed the class
  assertion.
- **(Step 8) The reviewer flagged the N4 and N5 tests for no fail-first
  evidence.** The agent had shown both failing against broken code in its
  report. The reviewer only checks the repo, and the conversation isn't in
  it.
- **(Step 8) A `cat` flag macOS doesn't have.** The agent ran `cat -A` to
  check the end of `.gitignore`, and the BSD `cat` rejected the flag. The
  edit after it still ran, and the agent confirmed it with
  `git check-ignore`.

## What the AI got right that I had not specified

- **Asked for the API probes before designing.** The 1,000-user count and the
  slow failures shaped the whole loading strategy and retry policy.
- **Argued against my Java lean** on the grounds of the brief's emphasis on
  states and user experience, not just stack match.
- **Talked me out of the 5-minute window.** I wanted the staleness window as
  a talking point. The assistant pointed out it would almost never fire in a
  demo and would replace good data with "Unavailable" on a failed refresh. It
  proposed showing "Updated N min ago" instead. I later cut that too: it isn't
  in the brief, and showing it accurately needed a ticking clock. Both the
  freshness display and the window are in `NEXT_STEPS.md`.
- **Specified invalid-response handling** I hadn't considered: a `user_id`
  that doesn't match the request, an unparseable timestamp invalidating the
  whole response rather than being skipped, and not retrying a malformed 200.
- **(Step 2) Mutations, not just stubs that throw.** Stubs that throw show
  only that a test runs. With the real code in place, the agent broke each
  rule on purpose and recorded which test caught it: the tie comparison `>`
  changed to `>=`, the future tolerance set to 0, the future filter removed,
  `Math.floor` changed to `Math.round`, a 31-day month, the "just now"
  fallback removed, and `timeStyle: 'medium'`.
- **(Step 2) `allFuture` can't reach `isInactive`.** The agent typed the
  parameter as `Exclude<LatestLoginResult, { kind: 'allFuture' }>`. Inactive
  has no meaning when every login is in the future, so the compiler rejects
  that call.
- **(Step 2) The reviewer found the "just now" gap.** `formatTime.ts` returns
  a hard-coded English `'just now'`. So the German-locale test run proves the
  locale pin for only 10 of the 12 `formatRelative` cases, and a non-English
  browser would mix languages in the column.
- **(Step 2) The reviewer found the missing minute boundary.** Every other
  unit had an exact-boundary test, but the minute was tested only at 59 and
  90 seconds.
- **(Step 2) The reviewer agent wasn't loaded.** The `reviewer` agent type was
  missing from the session, even though `.claude/agents/reviewer.md` exists.
  The agent reported it, ran a general-purpose agent with the reviewer.md
  instructions word for word, and checked `git status` afterwards to confirm
  nothing changed.
- **(Step 3) A failed body read is retried.** `client.ts` reads the body as
  text and parses it in a separate step. A body that fails while being read
  is `network`, which is retried, and only text that isn't JSON is
  `invalid`. Reading and parsing in one call would have turned a dropped
  connection into a final failure.
- **(Step 3) Proof the timeout timer is always cleared.** `PLAN.md` required
  clearing it on every exit path but named no test. The agent added an
  `afterEach` in `client.test.ts` asserting `vi.getTimerCount()` is 0, and
  showed it failing on 7 tests with `clearTimeout` removed.
- **(Step 3) No `any` from `Array.isArray`.** `Array.isArray` narrows an
  `unknown` value to `any[]`. The agent added an `isArray` type guard in
  `validate.ts` that narrows to `readonly unknown[]`, which keeps the
  no-`any` rule without a cast.
- **(Step 3) An acceptance criterion that couldn't pass as written.** AC1
  said `client.ts` is the only file in `src` that references `fetch`, but the
  tests `PLAN.md` requires stub `fetch` in `client.test.ts`. The agent
  reported the conflict instead of marking it PASS.
- **(Step 4) A mutation for each rule.** After all 9 tests failed against a
  stub that throws, the agent broke one rule per run in `retry.ts` and
  recorded which test caught it:
  - the first attempt running twice;
  - `onRetry` moved after the backoff;
  - only 2 retries;
  - every `http` status retried;
  - `invalid` retried;
  - `timeout` not retried;
  - no jitter;
  - jitter that ignores `random`;
  - a sleep that ignores abort.

  Each break failed the test that names that behavior.
- **(Step 4) Proof no backoff timer outlives `withRetry`.** The agent added an
  `afterEach` in `retry.test.ts` asserting `vi.getTimerCount()` is 0, the same
  check as `client.test.ts`. It confirms the abort path clears its timer.
- **(Step 4) `onRetry` can fire after an abort.** If the caller aborts between
  a failed attempt and the backoff, `onRetry` still fires once. In Step 6 that
  becomes an `attemptFailed` dispatched to a row that `pageChanged` has
  already reset to `idle`. The agent flagged it and showed that `PLAN.md`
  Step 5 tested only `succeeded` on a row with no token. A reducer missing the
  token check in its `attemptFailed` branch would leave that row showing
  "Retrying…" for the rest of the session, with no request in flight.
- **(Step 5) A rule before tests for ignored page events.** `pageReducer.ts`
  ignores events outside the `DECISIONS.md` table, but no decision covered
  that, so a test would have mapped to no rule. The agent flagged the cases
  instead of adding tests or a rule on its own. It pointed out that
  `retryRequested` while `loading` returning a new object could re-run the
  Step 6 `/users` effect and abort the request in flight.
- **(Step 5) Type-level rules checked with the compiler.** The agent
  type-checked a throwaway file that dispatched `succeeded` with `allFuture`
  and an `aborted` event, showed `tsc` rejecting both, then deleted the file.
- **(Step 5) New tests run against the old ones.** For the review fixes, the
  agent ran each break against a temporary copy of the old test files as
  well as the new ones. Every break passed the old tests and failed exactly
  one new test, which shows the new cases close real gaps rather than repeat
  existing ones.
- **(Step 6) Each page visit aborts only its own requests.** The page effect
  in `useRowLogins.ts` creates a new set of `AbortController`s on every run
  and points the `pageRequests` ref at it. `load`, including loads started by
  `retry`, adds to the current set, and the cleanup aborts the set from its
  own run. Under StrictMode, the first cleanup can't abort the second run's
  requests, and Try again loads are aborted with the page they belong to.
- **(Step 6) The `/users` effect depends on a boolean.** `useUsers` runs its
  effect on `page.kind === 'loading'`, not on the page state object. It
  starts a request on mount and when Try again returns the page to
  `loading`, and a new state object of the same kind doesn't re-run it and
  abort the request in flight.
- **(Step 7) Component tests run under StrictMode.** `App.test.tsx` renders
  `<StrictMode><App /></StrictMode>`, as `main.tsx` does, and its fake `fetch`
  replies after 10ms or rejects when its signal aborts. The double-invoked
  effects run in every test, and the first set of requests is aborted and
  dropped as it is in the browser.
- **(Step 7) Tests seen failing against the old UI first.** The agent wrote
  the three new tests before any component and showed each failing against
  the Step 1 `App`, which rendered only the heading. With the UI in place, it
  broke one behavior per run and recorded which test caught it:
  - the page Try again doing nothing;
  - Prev never disabled;
  - "Retrying…" never shown;
  - no exact time in the hover text;
  - never-logged-in rows not marked inactive;
  - the row Try again doing nothing.
- **(Step 7) Whole rows asserted, not fragments.** The row test compares every
  cell of a row to an exact array, for example
  `['1', 'Orazio Slipper', 'oslipper0@example.com', '3 days ago', '61.129.200.209']`,
  so a value in the wrong column or a leftover button fails the test.
- **(Step 7) Row hooks mount only after `/users` loads.** `App.tsx` keeps the
  page index and `useRowLogins` in `LoadedUsers`, which renders only in the
  `loaded` state. The row hook never runs against a placeholder user list.
- **(Step 8) Missing hover text traced to the browser, not the code.** I saw
  no tooltip when hovering a row. The agent pointed out the exact time is on
  the Last login cell only (`UserRow.tsx:56`, `title={formatExact(...)}`),
  ran the same `Intl.DateTimeFormat` call in Node to show the MDT output, and
  gave me a way to tell a code defect from a browser that doesn't show
  `title` tooltips: inspect the `<td>` for the attribute. The Playwright
  walkthrough then read titles such as "Oct 18, 2026, 7:37:17 AM MDT" from
  the cells.
- **(Step 8) The reviewer found the Playwright log could be committed.**
  Playwright wrote `.playwright-mcp/console-...log` to the repo root, and
  `.gitignore` didn't cover it, so a blanket `git add` would have committed
  it.
- **(Step 8) The reviewer used the console log as partial evidence.** It
  read the backoff gaps of 149, 278 and 799ms between the four blocked
  `/users` attempts and matched them to the equal-jitter formula in
  `retry.ts`.
- **(Step 8) Copying errors caught in the walkthrough report.** My pasted
  report gave the Try again label as "Try loading login data for Dru
  Hagain". The agent showed that the label is built from the full name at
  `UserRow.tsx:79`, so the text was damaged in copying, not produced by the
  app.

## What I changed manually

- **(Step 3) Timeout ends when the response arrives.** The agent's
  `client.ts` kept the 4s timeout running until the body had been read, a
  choice it flagged as not covered by `DECISIONS.md`. I changed the rule so
  the timeout covers only the wait for the response. The agent added the
  test `a response that arrives within 4s is not timed out while its body is
  read`, showed it failing as `timeout` against the old code, and recorded
  the rule in `DECISIONS.md` "Retry policy".
- **(Step 3) Reviewer protocol in its own file.** The reviewer agent type
  wasn't loaded after I cleared context between steps. The agent proposed
  adding the launch steps, including the general-purpose fallback, to
  `CLAUDE.md`. I moved them to `SUBAGENT_PROTOCOL.md`, with a pointer from
  `PLAN.md` "How each step runs".
- **(Step 8) Checklist walked with Playwright from a separate session.**
  `PLAN.md` has me walk the checklist in a browser. The agent's session had
  started before I added the Playwright MCP, so neither it nor a subagent it
  launched could see the tools. I ran the walkthrough from another session
  and gave the agent the results. All 9 items were observed. No user in ids
  1 to 300 had an empty logins array, so "Never logged in" was checked by
  stubbing user 301's logins response.

## Judgment calls where I accepted the agent's reasoning

- **(Step 2) Target layout updated.** From the review before step 2, I
  accepted adding `src/test/setup.ts` and `src/test/cleanup.test.tsx` to the
  `PLAN.md` target layout.
- **(Step 2) No comment on `afterEach(cleanup)`.** The reviewer suggested a
  one-line comment in `src/test/setup.ts` explaining that cleanup is
  registered by hand because Vitest globals are off. I declined: the comment
  seemed unnecessary.
- **(Step 2) 60-second boundary added.** I accepted the reviewer's
  minute-boundary finding. The agent added `60 seconds ago is "1 minute ago"`
  to the `formatRelative` table and showed it failing when the `>=` in
  `formatTime.ts` becomes `>`.
- **(Step 2) "just now" left as a literal.** I didn't act on the reviewer's
  "just now" finding. It meets the brief, and I agreed with the agent's
  reasoning: `DECISIONS.md` specifies the literal, and the app is English-only.
- **(Step 3) Extra client tests kept.** The agent added tests beyond the
  `PLAN.md` list: a `fetchUserLogins` 200 test that checks the URL, a
  non-JSON 200 test, and a body read failure test. I kept them and added
  them to the step 3 test list.
- **(Step 3) AC1 reworded.** I accepted the agent's reading that AC1 applies
  to app code, and changed it to "`client.ts` is the only app file in `src`
  that references `fetch`. Test files stub it."
- **(Step 3) No re-proof for step 2 tests.** The reviewer couldn't verify
  that the step 2 tests were seen failing first, since the evidence is in a
  cleared conversation. I chose not to act on it.
- **(Step 3) "just now" left as a literal again.** The reviewer repeated
  that the two "just now" tests don't prove the locale pin. I didn't act on
  it: other locales and languages are out of scope.
- **(Step 4) Retry count capped by the backoff list.** `withRetry` loops over
  `BACKOFF_BASE_MS.slice(0, MAX_RETRIES)`, because indexing the tuple directly
  would need a `!` or a branch that never runs. If `MAX_RETRIES` were raised
  above 3, retries would silently stop at 3. I kept it as is.
- **(Step 4) Truncated delays in the backoff test.** I accepted the
  `random 0.999` expectations of 199, 399 and 799ms.
- **(Step 4) A tokenless-row test for each event.** I agreed with the agent
  that `attemptFailed`, `succeeded` and `failed` each need their own test on a
  row with no token. The reducer checks the token separately in each event
  branch, so a test of one event doesn't cover the others. I changed the
  `PLAN.md` Step 5 test list and committed it separately.
- **(Step 4) Review fixes before Step 5.** From the review before Step 5, I
  accepted three notes:
  - The comment on `sleep` in `retry.ts` restated the code. It now explains
    why the already-aborted check comes first.
  - The `scripted` helper comment in `retry.test.ts` left out its fallback to
    `success`. It now mentions it.
  - My Step 4 bullet said the mock typing matched `client.test.ts`. It now
    says the mock is typed the way `client.test.ts` types its `fetch` mock.
- **(Step 4) Two review notes left as is.** The reviewer's note that `onRetry`
  can fire after an abort is already handled by the Step 5 test list change.
  Its note that it couldn't tell who wrote the AI_USAGE.md changes needed no
  action: I asked for them and approved the content.
- **(Step 5) `rowState` exported early.** `rowsReducer.ts` exports
  `rowState`, which returns `idle` for a user with no entry. `PLAN.md`
  doesn't name it, and the reviewer noted it. The agent said Steps 6 and 7
  need it. I kept it: making it private now and exporting it in Step 6 is
  just extra work.
- **(Step 5) Page reducer guards kept, with a rule.** I agreed with the agent
  that the reducer should enforce the `DECISIONS.md` table instead of
  trusting its callers, as the rows reducer does. The agent added "Any event
  not in the transitions above leaves the state unchanged" to `DECISIONS.md`
  "Page state machine" with wording I approved. I kept its structure, a
  switch on the event with a state check in each case, over a nested switch
  or a lookup table.
- **(Step 5) Every guarded case tested.** I accepted the agent's proposal to
  test `loadStarted` on `loading`, `loaded` and `neverLoggedIn`, and
  token-carrying events on all four tokenless states. I also accepted the
  reviewer's findings: an `idle` row in the `pageChanged` test, and all six
  ignored page events.
- **(Step 5) A new `Map` on every page change.** `pageChanged` in
  `rowsReducer.ts` builds a new `Map` even when no row is loading, which
  costs one re-render nobody sees. I kept it: `CLAUDE.md` allows an
  optimization only with a measured reason, and there isn't one.
- **(Step 5) Review notes left as is.** The reviewer said the `holdsToken`
  comment in `rowsReducer.ts` restates the code. I kept it: it helps me
  understand what that small piece of code does. The reviewer also couldn't
  verify that the Step 5 tests were seen failing first. The evidence is in
  the conversation, and I chose not to act on it.
- **(Step 6) Late `attemptFailed` left as is.** The reviewer noted that
  `onRetry` in `useRowLogins.ts` can dispatch `attemptFailed` after the page
  changes, if an attempt failed just before the abort. I made no code
  change: the cleanup handles it. `pageChanged` has already returned the row
  to `idle`, which holds no token, so the reducer ignores the event.
- **(Step 6) No-op `onRetry` for `/users` kept.** The reviewer noted that
  `useUsers.ts` doesn't show `/users` retries. I kept the no-op: retrying is
  an action, not a page state, and `DECISIONS.md` shows "Loading users…"
  until the request settles. I didn't make `onRetry` optional in `retry.ts`
  or add a page state.
- **(Step 6) No tests in this step.** `PLAN.md` assigns the hooks' tests to
  Step 7's component tests, so the agent added none and recorded that in its
  report.
- **(Step 7) Attempt counts asserted.** I accepted the reviewer's finding that
  the retry tests didn't prove four attempts, and had the agent fix it.
- **(Step 7) No re-proof for Step 7 tests.** The reviewer couldn't verify
  that the Step 7 tests were seen failing first. The evidence is in the
  agent's step report, and I chose not to act on it.
- **(Step 7) Heading test deleted.** The reviewer noted that `App.test.tsx`
  had four tests against the plan's "a few", counting the Step 1 heading
  test. That test only proved the scaffold worked, and the page tests now
  cover that, so I had the agent delete it. Early tests like it should be
  pruned once later tests cover the same ground.
- **(Step 7) "1 user" kept.** The reviewer noted that the singular count in
  `App.tsx` isn't in `DECISIONS.md`. I kept it, since "1 users" would be wrong,
  and had the agent add "A list of one shows "1 user"." to `DECISIONS.md`
  "Page state machine".
- **(Step 7) `users` made readonly.** The reviewer noted that `LoadedUsers`
  in `App.tsx` typed `users: User[]`, while `UsersTable` and `useRowLogins`
  use `readonly User[]`. I asked whether readonly had downsides. The agent
  said it is compile-time only and blocks only mutating methods like `push`
  and in-place `sort`, which the app shouldn't call on `/users` data. I had
  it change the type.
- **(Step 8) Step 7 review: one comment removed, two tests added.** I
  accepted three of the reviewer's notes:
  - The comment on `fakeFetch` in `App.test.tsx` restated the code. Deleted.
  - The singular count had no test. The agent added `a list of one user
    shows the singular count`.
  - The Inactive badge and tint on a loaded row had no UI test. The agent
    added `a row whose latest login is 30 days old shows the Inactive badge
    and tint`, at the 30-day boundary.
- **(Step 8) Two Step 7 review notes left as is.** The reviewer said my
  AI_USAGE.md claim that the page tests cover the deleted heading test isn't
  backed by a test. I removed the heading test on purpose. The reviewer also
  couldn't tell who wrote the Step 7 AI_USAGE.md changes. I approved that
  content.
- **(Step 8) Exact class assertions.** I accepted the reviewer's note that
  `toHaveClass('inactive')` checks containment. Both positive assertions in
  `App.test.tsx` now pass `{ exact: true }`. The agent showed both failing
  with an extra class on the row.
- **(Step 8) Review fixes in their own commit.** The reviewer noted the
  Step 7 review tests sat in the Step 8 working tree. The agent committed
  `App.test.tsx` on its own as `fdbad49`.
- **(Step 8) Playwright log ignored.** I had the agent add `.playwright-mcp/`
  to `.gitignore`.
- **(Step 8) No re-proof for the N4 and N5 tests.** I disregarded the
  reviewer's fail-first note.
