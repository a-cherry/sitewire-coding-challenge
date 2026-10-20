# AI usage

## Summary

I planned the app with Claude in a chat session, then built it with Claude
Code in nine steps against three documents: `DECISIONS.md` (the brief and
every decision), `CLAUDE.md` (working and architecture rules) and `PLAN.md`
(step scope and acceptance criteria). A read-only reviewer subagent checked
the project before each step from Step 2 on, and I decided which of its
findings to fix.

- **Where the AI shaped the design.** It asked for API probes before
  designing, argued for TypeScript and React over my Java lean, talked me out
  of a staleness window, and specified invalid-response handling I hadn't
  considered.
- **What the AI got wrong.** In planning, it proposed scope the brief didn't
  ask for and left some decisions to the implementing agent. In
  implementation, most mistakes were in tests and evidence: guards no test
  protected, retry tests that didn't count attempts, and environment slips
  that recurred after each context clear. In the docs step, it wrote claims
  the code didn't support. The reviewer or the agent's own runs caught most
  of these; I caught the rest.
- **What I decided by hand.** The timeout covers only the wait for the
  response, the reviewer protocol lives in its own file, the Step 8
  walkthrough ran from a separate Playwright session, and I cut five items
  from `NEXT_STEPS.md`.
- **Result.** 96 tests in 10 files, `react` and `react-dom` as the only
  runtime dependencies, and clean typecheck, lint and build.

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
- **(Steps 2 to 6) Environment slips that recurred after context clears.**
  The agent ran its `formatTime` mutation checks without the `TZ=UTC` pin, so
  `formatExact` failed in every run for an unrelated reason. Its acceptance
  checks used `grep --include=*.ts`, which zsh expanded as a glob and
  rejected before any check ran, in Step 3 and again in Step 6. The agent
  caught each error and reran, but because I cleared context between steps,
  nothing carried the lesson forward.
- **(Step 4) An abort before the backoff starts was untested.** The
  `if (signal.aborted)` check at the top of `sleep` in `retry.ts` had no test,
  so deleting it left all 55 tests passing. Without it, an abort that lands
  before the backoff starts waits out the full backoff and makes one more
  attempt. The agent noticed the gap while fixing a reviewer finding, added
  the test, and showed it failing with the check removed.
- **(Step 5) Guards no test protected.** The first Step 5 tests followed the
  `PLAN.md` list, which left reducer guards that could be weakened with every
  test still passing: `loadStarted` was rejected from `loading`, `loaded` and
  `neverLoggedIn` but tested only on `loaded`, the tokenless-row tests used
  only `idle`, and the page reducer's ignored events had no tests. The agent
  listed these gaps in its report and the reviewer found two more. The agent
  added the tests and showed each failing under a break that passed the old
  tests.
- **(Step 5) A double-click race that React 19 doesn't have.** To justify a
  test, the agent said a double click on Try again could dispatch a second
  `loadStarted` before React re-rendered. It corrected itself in its next
  answer: React 19 finishes the first click's update before handling the
  second. The test stays, as a guard against a hook that starts a load on a
  row already loading.
- **(Step 5) Reviewer run widened without asking.** I asked for a review of
  the Step 4 work before the Step 5 commit. The agent assumed I meant Step 5
  and launched the reviewer on Step 5 plus a recheck of Step 4, and explained
  only once it was running. I stopped it and asked for a Step 5 review.
- **(Step 6) An `any` that the checks didn't catch.** The agent's first
  `useRowLogins.ts` started row state as `new Map() satisfies RowsState`.
  `satisfies` checks the value without changing its type, so the map stayed
  `Map<any, any>`, which breaks the no-`any` rule even though `tsc` and lint
  passed. The agent caught it in its own code and typed it as
  `new Map<number, RowState>()`.
- **(Step 6) A comment that called retrying a state.** The comment on the
  no-op `onRetry` in `useUsers` said the page had "no retrying state to
  show." I pointed out that retrying is an action, not a state: rows show
  "Retrying…" as a way of displaying `loading`. The comment now says `/users`
  retries aren't shown and the page stays on "Loading users…".
- **(Step 7) Retry tests that didn't count attempts.** The `/users` failure
  test and the Unavailable row test in `App.test.tsx` checked the final
  message but not how many requests were made, so a hook that gave up after
  one attempt would still pass. Caught by the reviewer. The agent asserted 5
  calls for each, StrictMode's aborted first request plus four attempts, and
  showed both failing with `MAX_RETRIES` set to 1.
- **(Step 8) A fail-first run that skipped an assertion.** To show the
  Inactive row test failing, the agent removed the inactive check in
  `UserRow.tsx`. The test failed on the cell text, so the class assertion
  after it never ran. The agent caught it in its own output and ran a second
  break that failed the class assertion.
- **(Step 9) Doc claims the code didn't support.** Writing `README.md` and
  `NEXT_STEPS.md` from `DECISIONS.md` instead of the code, the agent
  described sorting as if the app had it, claimed "Retrying…" shows for
  `/users` (`useUsers.ts` passes a no-op `onRetry`), listed the API client as
  a pure module although `client.ts` calls `fetch`, and changed the stated
  reason for hand-rolled fetching from "visible and owned" to "visible and
  tested". The reviewer caught all four.

## What the AI got right that I had not specified

- **Asked for the API probes before designing.** The 1,000-user count and the
  slow failures shaped the whole loading strategy and retry policy.
- **Argued against my Java lean** on the grounds of the brief's emphasis on
  states and user experience, not just stack match.
- **Talked me out of the 5-minute window.** I wanted the staleness window as
  a talking point. The assistant pointed out it would almost never fire in a
  demo and would replace good data with "Unavailable" on a failed refresh. It
  proposed showing "Updated N min ago" instead. I later cut that too: it isn't
  in the brief, and showing it accurately needed a ticking clock.
- **Specified invalid-response handling** I hadn't considered: a `user_id`
  that doesn't match the request, an unparseable timestamp invalidating the
  whole response rather than being skipped, and not retrying a malformed 200.
- **(Steps 2 to 7) Mutations, not just stubs that throw.** Stubs that throw
  show only that a test runs. With the real code in place, the agent broke
  one rule per run and recorded which test caught it: in `formatTime.ts`, the
  tie comparison `>` changed to `>=` and `Math.floor` changed to
  `Math.round`; in `retry.ts`, `onRetry` moved after the backoff and
  `invalid` retried; in the UI, Prev never disabled and "Retrying…" never
  shown. For the Step 5 review fixes, it also ran each break against the old
  tests, to show the new cases closed real gaps.
- **(Step 2) `allFuture` can't reach `isInactive`.** The agent typed the
  parameter as `Exclude<LatestLoginResult, { kind: 'allFuture' }>`. Inactive
  has no meaning when every login is in the future, so the compiler rejects
  that call.
- **(Step 3) A failed body read is retried.** `client.ts` reads the body as
  text and parses it in a separate step. A body that fails while being read
  is `network`, which is retried, and only text that isn't JSON is
  `invalid`. Reading and parsing in one call would have turned a dropped
  connection into a final failure.
- **(Steps 3 and 4) Proof no timer outlives a request.** `PLAN.md` required
  clearing the timeout on every exit path but named no test. The agent added
  an `afterEach` to `client.test.ts` and `retry.test.ts` asserting
  `vi.getTimerCount()` is 0.
- **(Step 3) An acceptance criterion that couldn't pass as written.** AC1
  said `client.ts` is the only file in `src` that references `fetch`, but the
  required tests stub `fetch`. The agent reported the conflict instead of
  marking it PASS, and I reworded AC1 to apply to app code.
- **(Step 4) `onRetry` can fire after an abort.** If the caller aborts
  between a failed attempt and the backoff, `onRetry` still fires once,
  dispatching `attemptFailed` to a row that `pageChanged` has already reset
  to `idle`. `PLAN.md` tested only `succeeded` on a tokenless row, so a
  reducer missing the token check in `attemptFailed` would leave that row on
  "Retrying…" for the session with no request in flight.
- **(Step 5) A rule before tests for ignored page events.** `pageReducer.ts`
  ignores events outside the `DECISIONS.md` table, but no decision covered
  that. The agent flagged it instead of adding tests or a rule on its own,
  and pointed out that `retryRequested` while `loading` returning a new
  object could re-run the `/users` effect and abort the request in flight.
- **(Step 6) Each page visit aborts only its own requests.** The page effect
  in `useRowLogins.ts` creates a new set of `AbortController`s on every run,
  and the cleanup aborts the set from its own run. Under StrictMode, the
  first cleanup can't abort the second run's requests, and Try again loads
  are aborted with the page they belong to.
- **(Step 6) The `/users` effect depends on a boolean.** `useUsers` runs its
  effect on `page.kind === 'loading'`, not on the page state object, so a new
  state object of the same kind doesn't re-run it and abort the request in
  flight.
- **(Step 7) Component tests run under StrictMode.** `App.test.tsx` renders
  `<StrictMode><App /></StrictMode>`, as `main.tsx` does, with a fake `fetch`
  that rejects when its signal aborts. The double-invoked effects run in
  every test, and the first set of requests is aborted and dropped as it is
  in the browser.
- **(Step 7) Whole rows asserted, not fragments.** The row test compares every
  cell of a row to an exact array, so a value in the wrong column or a
  leftover button fails the test.
- **(Step 8) Live retries matched to the formula.** The reviewer read the
  backoff gaps of 149, 278 and 799ms between four blocked `/users` attempts
  in the Playwright console log and matched them to the equal-jitter formula
  in `retry.ts`.
- **(Step 9) Missing content reported, not invented.** The agent left out
  the parts of `NEXT_STEPS.md` that `DECISIONS.md` had no source for and
  reported each as an instruction not followed.
- **(Step 9) Retry budget gap found.** Asked for missing system design
  practices, the agent pointed out that each row retries on its own. If the
  API is fully down, one page costs 25 rows x 4 attempts = 100 requests,
  repeated on every visit or Try again.

## What I changed manually

- **(Step 3) Timeout ends when the response arrives.** The agent's
  `client.ts` kept the 4s timeout running until the body had been read, a
  choice it flagged as not covered by `DECISIONS.md`. I changed the rule so
  the timeout covers only the wait for the response. The agent added a test,
  showed it failing as `timeout` against the old code, and recorded the rule
  in `DECISIONS.md` "Retry policy".
- **(Step 3) Reviewer protocol in its own file.** The `reviewer` agent type
  wasn't loaded after I cleared context, so the agent ran a general-purpose
  agent with the `reviewer.md` instructions word for word and confirmed with
  `git status` that nothing changed. It proposed adding that fallback to
  `CLAUDE.md`. I moved it to `SUBAGENT_PROTOCOL.md`, with a pointer from
  `PLAN.md` "How each step runs".
- **(Step 8) Checklist walked with Playwright from a separate session.** The
  agent's session had started before I added the Playwright MCP, so it
  couldn't see the tools. I ran the walkthrough from another session and gave
  the agent the results. All 9 items were observed. No user in ids 1 to 300
  had an empty logins array, so "Never logged in" was checked by stubbing
  user 301's logins response.
- **(Step 9) Items cut from `NEXT_STEPS.md` and `DECISIONS.md`.** I cut
  Batch endpoint, Refresh all and Refresh page, Refreshing a row that loaded,
  Freshness and auto-refresh, and 429 / Retry-After as outside the brief.
  Sorting and background loading stay. The Planning session section above
  says the cut items went to `NEXT_STEPS.md`, which was true until this step.

## Judgment calls where I accepted the agent's reasoning

- **(Steps 2 and 3) "just now" left as a literal.** The reviewer found that
  `formatTime.ts` returns a hard-coded English `'just now'`, so the
  German-locale test run proves the locale pin for only 10 of 12 cases. I
  didn't act on it in either review: `DECISIONS.md` specifies the literal,
  and the app is English-only.
- **(Steps 3 to 8) Fail-first findings not re-proved.** The reviewer only
  reads the repo, so it repeatedly flagged tests whose fail-first evidence
  was in the agent's step report. I didn't act on them. Writing that evidence
  into each commit message would have let the reviewer check it.
- **(Step 4) Retry count capped by the backoff list.** `withRetry` loops over
  `BACKOFF_BASE_MS.slice(0, MAX_RETRIES)`, because indexing the tuple directly
  would need a `!` or a branch that never runs. If `MAX_RETRIES` were raised
  above 3, retries would silently stop at 3. I kept it as is.
- **(Step 4) A tokenless-row test for each event.** The reducer checks the
  token separately in each event branch, so a test of one event doesn't cover
  the others. I added `attemptFailed`, `succeeded` and `failed` on a tokenless
  row to the `PLAN.md` Step 5 test list.
- **(Step 5) Page reducer guards kept, with a rule.** I agreed the reducer
  should enforce the `DECISIONS.md` table instead of trusting its callers, as
  the rows reducer does, and added "Any event not in the transitions above
  leaves the state unchanged" to `DECISIONS.md`.
- **(Step 5) A new `Map` on every page change.** `pageChanged` builds a new
  `Map` even when no row is loading, which costs one re-render nobody sees. I
  kept it: `CLAUDE.md` allows an optimization only with a measured reason.
- **(Step 6) No-op `onRetry` for `/users` kept.** Retrying is an action, not
  a page state, and `DECISIONS.md` shows "Loading users…" until the request
  settles. I didn't make `onRetry` optional or add a page state.
- **(Step 6) No tests in this step.** `PLAN.md` assigns the hooks' tests to
  Step 7's component tests, so the hooks were reviewed without tests for one
  step.
- **(Step 7) Heading test deleted.** The Step 1 heading test only proved the
  scaffold worked, and the page tests now cover that ground.
- **(Step 9) Four system design items added.** Of the eight practices the
  agent proposed, I accepted four for `NEXT_STEPS.md`: a retry budget or
  circuit breaker, client telemetry, storing the latest login on write, and
  personal data handling.
- **(Step 9) No time spent in the README.** The reviewer flagged it as
  required by `DECISIONS.md`. I left it out; the commit history shows when
  each step landed.