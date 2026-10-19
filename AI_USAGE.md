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
