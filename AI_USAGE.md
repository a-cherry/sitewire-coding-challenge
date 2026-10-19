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

## Time

_To be filled in: planning session, implementation, review._

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

## What I changed manually

_Recorded during implementation._

## Judgment calls where I accepted the agent's reasoning

_Recorded during implementation._