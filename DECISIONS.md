# Decisions

Raw notes. Source of truth for README.md, AI_USAGE.md and NEXT_STEPS.md. Not a
deliverable itself. Where the brief leaves something open, this file decides.

## The one-sentence thesis

Every row is an explicit, tested state machine, the UI shows exactly the state
each row is in, and the app only asks the flaky API for what the user can see.
Every other decision here supports that.

## The brief

Reproduced verbatim from the exercise README.

> For this portion of your interview, you will be **coding a simple app using
> the language and/or framework of your choice**. Your app will display some
> data from the API server located at: https://fake-users-api.vercel.app
>
> We don't expect you to spend more than an hour on this. You can use whatever
> tools you want to build it, including AI coding assistants/tools. No matter
> how you write the code, you should be prepared to present what you've built
> and explain and defend your implementation.
>
> ### The Fake Users API
>
> At https://fake-users-api.vercel.app , you will find a REST API server. This
> REST API server has some problems, including:
>
> - **It randomly fails.** When a random failure occurs, the server responds
>   with a 500 status code and an error message. You can expect about 25% of
>   your requests to fail.
> - **It experiences random slow-downs.** Some responses are quite fast
>   (~10ms), but some responses can take up to 3s.
>
> The API server always responds with JSON and only has two endpoints.
>
> `GET /users` -> `User[]`: returns a list of user profile information
> (`id`, `first_name`, `last_name`, `email`).
>
> `GET /users/:id/relationships/logins` -> `UserLogins`: returns a list of user
> logins (`{ user_id, logins: [{ login_time, ip_v4 }] }`).
>
> ### Your Task
>
> Your task is to use the API server to display a list of user profile
> information alongside the last (most recent) time the user logged in. This
> can be done however you want: in a CLI app, on a webpage... pick whatever
> you're most comfortable working with.
>
> Specifically, you should display the following information:
>
> - User ID
> - Full name
> - Email address
> - Last (most recent) login time
> - Last (most recent) login IP address
>
> You should also display a total count for the number of users in your list.
>
> **Don't focus on visual polish.** Focus on the *states* the app and its data
> can be in, displaying the correct information, and how your technical
> decisions affect the experience of using the app you build.
>
> ### Bonus Tasks
>
> These are truly bonuses -- don't sweat if you don't have time to implement
> these. But think about how you'd approach them and we can chat about it.
>
> - Display the country associated with the user's last login IP address.
> - Display the login time using a "humanized" format (e.g. "a minute ago",
>   "1 month ago").
> - Highlight (or otherwise call out) any users who haven't logged in for at
>   least one month.

## What the API actually does

Probed by hand before design (Oct 16 2026):

- `/users` returns 1,000 users, ids 1 to 1000, contiguous, no pagination,
  ~88KB.
- CORS is `access-control-allow-origin: *`, so the browser calls the API
  directly. No proxy.
- Logins arrays are unsorted. For user 1 the most recent entry is the middle
  one.
- A 30-call sample of the logins endpoint: 9 of 30 failed (30%). Latency mean
  ~1.6s, max ~3.3s.
- Failures are slow too: 500s took 0.3s to 2.6s. A failed attempt costs about
  as much time as a successful one.
- User 1's logins were identical 60 seconds apart. The data is treated as
  stable. The README example shows different timestamps for the same IPs; it
  was most likely generated at a different time.
- Names include apostrophes, spaces and lowercase particles (`D'Angeli`,
  `Van der Velden`, `Zsa zsa`, `de Voiels`). Displayed as given.

## Stack

- Vite, React (current stable), TypeScript strict with
  `noUncheckedIndexedAccess`. Vitest, React Testing Library, npm.
- Runtime dependencies: `react` and `react-dom` only.
- Linting is ESLint with `eslint-plugin-react-hooks` (recommended config),
  replacing the oxlint config the current Vite template ships. Two reasons:
  `react-hooks/purity` mechanically enforces "never read the clock or
  randomness during render", which would otherwise rest on review; and the
  plugin's dependency checking understands `useEffectEvent`, which the
  page-change effect relies on. Dev dependencies only.
- Web over CLI: the brief's emphasis is states and the experience of using the
  app. A table whose rows fill in, retry and fail independently shows that
  directly; a CLI would mostly print a final result. TypeScript and React also
  match Sitewire's target stack.
- Hand-rolled fetching and retry instead of TanStack Query. Every state
  transition is visible and owned, which is the point of the exercise. In a
  production codebase a data-fetching library is the default choice; this is a
  deliberate exception, not a gap.
- `useReducer` with discriminated unions instead of XState. The machines are
  small enough that a pure reducer plus a transition test table is the whole
  story, with no library to explain.
- React's docs steer data fetching toward a framework or library rather than
  effects. Fetching in effects here is deliberate, with `AbortController`
  cleanup on every effect.

## Why fan-out, and why page-scoped

The API forces fan-out. `/users` carries no login data, and logins come only
from the per-user endpoint, so showing N users' last logins costs 1 + N
requests. This is the N+1 pattern; it can't be fixed client-side because we
don't own the API.

Three loading strategies were considered:

- **Eager, all 1,000 users.** ~1,300 to 1,400 requests including retries
  every page load (25 to 30% failure rate). At a mean of ~1.6s per request that's minutes to settle even with
  concurrency. Rejected.
- **Load by visibility (virtualized list).** Best perceived performance, but
  virtualization plus intersection observers is more machinery than this
  exercise justifies. Rejected.
- **Page-scoped (chosen).** Client-side pagination over the full `/users`
  list, 25 users per page. Logins are fetched only for the visible page. Fast
  first useful screen, small request volume, and the cost (no global ordering
  by login time) is explainable as a direct consequence of the API's shape.

Page size is 25: small enough that a page settles in a few seconds, large
enough that 1,000 users is 40 pages.

No concurrency cap. Page size bounds concurrency at 25 in-flight requests,
which a browser over HTTP/2 handles fine. A cap becomes necessary only with
background loading, which is deferred.

## Retry policy

Applies to both `/users` and the logins endpoint.

- Per-attempt timeout: 4s. Above the observed max of ~3.3s with margin. A
  lower timeout would cancel responses that were about to succeed and turn
  slow successes into retries.
- The timeout covers the wait for the response, not reading its body. A body
  that fails while being read is a network error and is retried.
- 3 retries, 4 attempts total.
- Backoff before retry n (retries numbered 1 to 3): base of 200ms, 400ms,
  800ms, with equal jitter (a wait drawn between half the base and the full
  base). Jitter keeps 25 parallel requests that failed together from retrying
  together.
- The retry module reports a retry as soon as an attempt fails, before the
  backoff wait, so "Retrying…" appears immediately rather than after up to
  800ms of "Loading…" for a request that has already failed.
- Retry only on 5xx responses, network errors and timeouts. Any other non-2xx
  response is a final failure.
- A response body on a 500 is ignored. The status decides.

The math, using the observed 30% failure rate (25% stated):

- A row fails all 4 attempts with probability 0.3^4 = 0.81% (0.39% at 25%).
  That is about 0.2 unavailable rows per page of 25 (0.1 at 25%).
- With 2 retries it would be 0.3^3 = 2.7%, about 0.7 rows per page. The third
  retry is worth its tail latency.
- `/users` fails all 4 attempts 0.81% of the time. That is the page error
  state.
- Worst case per request if every attempt times out: 4 x 4s + 1.4s of backoff
  = ~17.4s. Realistic worst case with slow failures (~2.6s each): ~12s. Both
  are rare; 70 to 75% of rows settle on the first attempt within ~3s.

## Validating responses

Responses enter as `unknown` and are validated in the API module into domain
types. Nothing outside the API module sees a raw response shape.

- `/users`: an array of objects with numeric `id` and string `first_name`,
  `last_name`, `email`. Anything else is a final failure (page error).
- Duplicate user ids make `/users` invalid. Row state, the cache and React
  keys all assume unique ids, so duplicates would silently merge rows.
- An empty `/users` array is valid. See the page state machine.
- Logins: an object with numeric `user_id` equal to the requested id, and a
  `logins` array whose entries each have a parseable `login_time` string and a
  string `ip_v4`.
- An invalid 200 response is a final failure, not retried. The data is
  stable, so a malformed response would most likely recur, and retrying spends
  up to ~12s to learn nothing.
- Any invalid login entry invalidates the whole response. Skipping a bad entry
  could display a "most recent" login that isn't the most recent, which is
  incorrect information presented as correct.
- `user_id` mismatching the requested id is invalid. Showing user 5's logins
  on user 7's row is the worst kind of wrong.
- `ip_v4` is validated as a string, not as a dotted quad. It is displayed,
  never computed on.

## Most recent login

- The maximum by `Date.parse(login_time)`. Never array position, never string
  comparison.
- Empty `logins` means the user has never logged in. A distinct state, not an
  error.
- Ties on the maximum timestamp keep the first entry encountered. Only the IP
  could differ, and the API gives no basis for preferring one.
- Login entries more than 5 minutes after `now` are ignored when picking the
  most recent. A login can't happen in the future, so such an entry is bad
  data, not the most recent login. None were observed.
- The 5-minute tolerance exists because `now` comes from the user's clock, not
  the server's. A client clock running a little slow would otherwise drop a
  login from seconds ago and show an older one as the most recent.
- If `logins` is non-empty but every entry is ignored, the response is treated
  as invalid: the row shows "Unavailable". "Never logged in" would be a false
  claim.
- Ignoring a future entry differs from invalidating on an unparseable one. An
  unparseable timestamp could be the real most recent login, so we can't
  safely pick around it. A future timestamp can't be.

## Page state machine

`loading | error | loaded{ users, loadedAt }`

- `loading` -> `loaded` when `/users` succeeds. `loadedAt` is the time the
  response arrived, stamped in the request callback.
- `loading` -> `error` when `/users` fails after retries or is invalid.
- `error` -> `loading` on Try again.
- Any event not in the transitions above leaves the state unchanged. The
  reducer returns the same state, so React skips the re-render.
- There is no abort event. An aborted `/users` request (unmount, or the first
  of StrictMode's double-invoked effects) is dropped by `useUsers` without
  dispatching, for the same reason the rows reducer has none: abort is not a
  failure and changes nothing the user should see.
- The only error message in the app is this error state: "Couldn't load
  users." with a Try again button.
- The total count ("1,000 users") renders only in `loaded`. It is
  `users.length` from `/users`, never a count of rows whose logins loaded.
  A list of one shows "1 user".
- An empty user list shows "0 users" and "No users to show.", with no
  pagination. "Page 1 of 0" would be nonsense.

## The display clock

Humanized times and the inactive check need a `now` at render time. That
`now` is `loadedAt`: fixed when `/users` loads, and reset by Try again.

- Nothing reads the clock during render, so there's no ticker, no clock
  effect, and no conflict with React's render-purity lint rule.
- Labels drift by however long the page has been open. The logins are weeks
  to months old, so labels are mostly days and months, and the inactive check
  works at 30-day precision. An hour of drift changes almost nothing.
- A row loaded well after `/users` (a page visited later, or a Try again)
  can return a login newer than `loadedAt`. Humanized formatting shows any
  time at or after `now` as "just now".
- The future-login filter in `latestLogin` does not use `loadedAt`. It uses
  the time the logins response arrived, taken in the request callback.

## Row state machine

Row state lives in a map keyed by user id, held above the page, so it persists
across page changes. That map is the cache.

States:

- `idle`: never fetched, or reset by a page change while loading.
- `loading{ token, attempt }`: load in flight.
- `loaded{ login }`: has a most recent login.
- `neverLoggedIn`: logins array was empty.
- `unavailable`: load failed after all retries, or was invalid.

`loaded` and `neverLoggedIn` are final for the session. There is no refresh of
a row that loaded; see "Deliberately not built".

Events:

- `loadStarted{ userId, token }`: from a page visit, or Try again on an
  `unavailable` row.
- `attemptFailed{ userId, token, attempt }`: `attempt` is the number of the
  attempt about to run, supplied by the retry module. The reducer copies it;
  it does not increment.
- `succeeded{ userId, token, result }`: `result` is `latest` or `none` only.
  `allFuture` can't be expressed in this event; the hook reports it as
  `failed`.
- `failed{ userId, token }`
- `pageChanged`: the user navigated away from the current page. No payload:
  only the page being left has requests in flight, so resetting every
  in-flight row is the same as resetting that page's rows.

There is no `aborted` event. See "Abort is not failure" below.

Transitions:

| From | Event | To |
|---|---|---|
| `idle`, `unavailable` | load started (page visit or Try again) | `loading{ attempt: 1 }` |
| `loading` | attempt failed, will retry | `loading{ attempt }` from the event |
| `loading` | succeeded | `loaded` or `neverLoggedIn` |
| `loading` | failed after retries, or invalid | `unavailable` |
| `loading` | page changed | `idle` |
| any other | page changed | unchanged |

Any event not in the transitions above leaves the state unchanged.

Rules:

- **Request token.** Every load gets a new token stored on the row. An event
  carrying a token that isn't the row's current token is ignored and the
  reducer returns the state unchanged. A row with no token (`idle`, `loaded`,
  `neverLoggedIn`, `unavailable`) ignores every token-carrying event. This
  guards against out-of-order responses: leave a page and come back quickly,
  and a response from the first visit can't land on the second visit's load.
  It is not idempotency: GETs are already idempotent. Idempotency keys are a
  write-side concern, for something like releasing a draw, and are discussed
  in NEXT_STEPS.md.
- **Abort is not failure.** An aborted request never produces `unavailable`.
  A navigation abort and a timeout are distinguishable: the timeout is
  retryable, the navigation abort ends the request.
- **Page change resets rows immediately.** `pageChanged` returns every
  `loading` row to `idle` when the user leaves the page, rather than waiting
  for the aborted requests to report back. Those requests resolve as
  `aborted` afterward, by which time their rows hold no token, and the hook
  drops the result without dispatching. The reset happens at one known moment
  instead of whenever each abort arrives.
- **Caller abort always wins.** If the caller's signal has aborted when the
  client classifies the result, the result is `aborted` even if the timeout
  also fired. The user navigated away, so nobody wants the result, and calling
  it a timeout would trigger a retry for a request that no longer matters. If
  the client already returned `timeout` before the caller aborted, that result
  stands.
- **Backoff respects abort.** The sleep between attempts ends immediately when
  its request is aborted.
- **Page visit.** Rows on the page that are `idle` or `unavailable` start
  loading. `loaded` and `neverLoggedIn` rows render from the cache with no
  request. `unavailable` rows are retried on visit because their failure was
  most likely the API's random rate, and "fetch anything we don't have" is one
  rule.
- **Page change aborts** in-flight requests for the page being left.
- **Try again** appears only on `unavailable` rows. It starts a load, so the
  row shows "Loading…" and then settles like any other load. Rows that loaded
  have nothing to retry, and the data is stable, so they get no button.

## What the user sees per row

| State | Last login cell | IP cell |
|---|---|---|
| `idle` | blank (momentary) | blank |
| `loading`, attempt 1 | Loading… | blank |
| `loading`, attempt 2+ | Retrying… | blank |
| `loaded` | 3 months ago | 61.129.200.209 |
| `neverLoggedIn` | Never logged in | blank |
| `unavailable` | Unavailable + Try again button | blank |

- Hover text on the login cell of `loaded` rows shows the exact local time,
  via `Intl.DateTimeFormat` with `dateStyle: "medium"` and `timeStyle:
  "long"`, for example "Aug 18, 2026, 2:04:17 AM MDT". The zone abbreviation
  matters because the API returns UTC and the display is local.
- Hover text is supplementary only. Every state is visible as text without
  hovering, since `title` tooltips don't appear on keyboard focus or touch.
- Try again is a text button inside the login cell, next to "Unavailable",
  with an accessible label that names the user, for example "Try loading login
  data for Orazio Slipper again". No separate button column.
- Columns: ID, Full name, Email, Last login, IP. Full name is
  `first_name + " " + last_name`, one column, as the brief asks.

## Bonuses

- **Humanized time: built.** `Intl.RelativeTimeFormat`, long style,
  `numeric: "always"` ("1 month ago", matching the brief's example; `"auto"`
  would produce "last month", which reads like a calendar month).
  - Units are minutes through years. No seconds: with a fixed display `now`,
    "30 seconds ago" would be wrong almost immediately.
  - Under one minute, or any time at or after `now`: "just now".
  - Rounds down: 90 seconds is "1 minute ago", 59 days is "1 month ago".
    Rounding down never makes something sound more recent than it was.
  - A month is 30 days (matching the inactive rule), a year is 365 days.
  - Takes `now` as a parameter. Locale and time zone always come from the
    runtime, which is what the app wants; there are no locale or time zone
    parameters.
- **Inactive highlight: built.** A user is inactive if their most recent login
  is at least 30 days before `now` ("at least one month" in the brief, with a
  month fixed at 30 days for a testable rule). `neverLoggedIn` rows are also
  marked inactive. Shown as a text badge "Inactive" plus a light row tint, so
  it doesn't rely on color alone.
  - Only `loaded` and `neverLoggedIn` rows can be badged. `loading`, `idle`
    and `unavailable` rows show no login data, so we don't know.
- **Country from IP: deferred.** It adds a third-party geo-IP dependency with
  its own failures, rate limits and possibly a key. NEXT_STEPS.md.

## StrictMode

On. In development it double-invokes effects: the first page effect starts
loads, its cleanup dispatches `pageChanged` and resets those rows to `idle`,
and the second effect loads them again. The network tab shows the first set
of requests cancelled. That is correct behavior and a free check that abort
cleanup works. Production builds don't double-invoke.

## React patterns

- The page-change effect depends on the page index and the user list only. It
  reads the current row state through `useEffectEvent`, so row updates don't
  re-run the effect and abort the page's requests. `useEffectEvent` doesn't
  add an effect; it lets an existing effect read the latest values without
  depending on them.
- `useEffectEvent` is stable from React 19.2. The project requires a React
  version that has it, and there is no fallback pattern: a second way of
  doing the same thing would be one more pattern to explain for a case that
  shouldn't occur. If the scaffolded version lacks it, the agent stops and
  reports rather than choosing a workaround.
- `users` comes from page state and is a stable reference, so the effect can
  depend on it without `useMemo`.

## Module boundaries

- Only the API module calls `fetch`.
- Retry, domain logic (latest login, inactive check, time formatting) and
  reducers are framework-free TypeScript with no React imports. React is a
  thin rendering layer over them, which mirrors a modular-monolith split:
  domain logic that doesn't know what renders it.
- Every time-dependent function takes `now`. `Date.now()` is called only in
  hooks, inside request callbacks: the `/users` success callback (for
  `loadedAt`) and the logins response callback (for `latestLogin`). Never
  during render, never in a domain module.
- `Math.random()` is called only in the hooks, to feed the retry module's
  injected `random`.
- Times are epoch milliseconds (`number`) everywhere in domain types and
  state: `loginTime`, `loadedAt`, `now`. Comparisons are plain `>`, nothing
  is mutable, and tests read as numbers. `Date` appears only inside the
  formatting functions.
- Tunables live in one constants module: page size 25, timeout 4s, retries 3,
  backoff bases 200/400/800ms, inactive threshold 30 days, future-login
  tolerance 5 minutes.

## Testing

- The core is unit tests on pure modules:
  - retry: classification, attempt count, backoff with injected random, abort
    during backoff, with fake timers;
  - most recent login: unsorted input, empty, ties, an entry just inside and
    just outside the 5-minute future tolerance, all entries in the future;
  - response validation: valid, malformed, `user_id` mismatch, bad
    `login_time`;
  - inactive rule at the 30-day boundary with a fixed `now`;
  - humanized time across unit boundaries, "just now" for times under a
    minute and at or after `now`;
  - exact time, one exact expected string;
  - reducers: every row in the transition table, including stale tokens,
    token-carrying events on rows with no token, and page change during a
    load.
- At most a couple of React Testing Library tests for page states, with
  `fetch` stubbed. Async UI tests against flaky behavior are slow and flaky
  themselves.
- Time, randomness, locale and time zone are controlled in every test, by
  three means:
  - Pure modules take `now` and `random` as parameters, because those
    parameters are part of their design.
  - Component tests use fake timers to move through backoff,
    `vi.setSystemTime` so `Date.now()` in the hooks returns a known
    `loadedAt`, and `vi.spyOn(Math, "random").mockReturnValue(0)` for jitter.
  - Locale and time zone are pinned by the test environment: the `npm test`
    script is `TZ=UTC LC_ALL=en_US.UTF-8 vitest run`. Node reads both at
    startup, so `Intl` defaults to US English and UTC in tests. The inline
    syntax works on macOS and Linux, not Windows `cmd`; acceptable for this
    project.
- App code gets no parameter that exists only for tests.
- Every test is seen failing before it counts.
- Nothing calls the real API in tests.

## Deliberately not built

Named so the omissions read as decisions. Detail lives in NEXT_STEPS.md.

- **Sorting.** Not in the brief. ID, name and email sorting is cheap; login
  sorting needs every user's logins, which needs background loading.
- **Background loading of all users.** Worker pool, concurrency cap of 10, a
  foreground queue for the current page ahead of a background queue. ~1,300
  to 1,400 requests per visit; at cap 10 and ~1.6s per request, ~3.5 to 4
  minutes.
- **Refresh all and Refresh page.** A second page-level state machine with
  partial-failure modes. Try again on the page error already covers `/users`.
- **Refreshing a row that loaded.** The data is stable, so a refresh would
  almost always return the same thing, yet it needed a `refreshing` state, a
  "Couldn't refresh" flag and its clearing rules, and most of the abort and
  ordering edge cases. Try again on `unavailable` rows keeps the part that
  helps the user.
- **Auto-refresh on page visit with a staleness window.** The data is stable,
  so it doubles traffic for no visible change, and routes every revisit
  through a refresh, which is where abort and ordering bugs live.
- **Freshness display.** "Updated N min ago" per row, and the `fetchedAt`
  field behind it. Not in the brief, and showing it accurately would need a
  ticking clock.
- **Country lookup**, page number in the URL, mobile layout, 429 /
  Retry-After handling, a ticking clock for humanized times.

## NEXT_STEPS material

- **Backend aggregator.** The real fix for N+1: a server endpoint (in
  Sitewire's terms, a module in the TypeScript modular monolith) that fans out
  to the users API once, caches logins, and serves users with their latest
  login in one response. Enables global sorting, removes per-client fan-out,
  and puts retries where they're shared.
- **Batch endpoint.** If we owned the API: `GET /logins?user_ids=...` or an
  include parameter.
- **Background loading and login sort** as described above, if the aggregator
  isn't available.
- **Freshness.** In two stages. First make it observable: store `fetchedAt`
  per row and show "Updated N min ago", with a clock that ticks at the
  precision shown. Then, if the use case calls for it, a policy:
  stale-while-revalidate with a TTL, triggered by data that changes often,
  long-lived sessions, or decisions made from the data. You can't apply a
  freshness policy to data whose age you don't track, and the TTL would come
  from the use case, not a guess.
- **Row refresh.** If the data changed often: a refresh on loaded rows with a
  `refreshing` state that keeps the previous data visible, and a failed
  refresh that restores the previous data with a "Couldn't refresh" label
  rather than replacing it with "Unavailable". Pairs with the freshness work.
- **Sorting** by ID, name, email (client-side today) and login (needs the
  aggregator or background loading).
- **Country from IP.** Server-side lookup against a local GeoIP database
  rather than a third-party call per row, cached by IP.
- **429 / Retry-After.** Honor the server's wait instead of our backoff.
- **Scale.** At 100k users `/users` itself needs server-side pagination, and
  client-side pagination stops working.
- **Production fetching.** A data-fetching library (TanStack Query) once the
  team owns the patterns, rather than hand-rolled.
- **Idempotency for writes.** The request token is a read-side ordering guard.
  For money-moving writes, idempotency keys checked transactionally server-side
  so a retried request can't release a draw twice.
- **Page in URL, mobile layout, a ticking clock for humanized times.**

## Anticipated questions

Short answers drawn from the decisions above.

- **Why not fetch all 1,000?** ~1,300 to 1,400 requests per load, minutes to
  settle,
  heavy load on a struggling server. Page-scoped is fast for what the user
  sees.
- **Why 25 per page?** Settles in a few seconds; 40 pages total.
- **Why 3 retries?** Final row failure drops from 2.7% to 0.81% for one more
  attempt; ~0.2 unavailable rows per page.
- **Why a 4s timeout?** Above the observed ~3.3s max. Lower would kill
  responses that were about to succeed.
- **Why not retry invalid responses?** The data is stable, so they'd recur.
- **What's the request token for?** Out-of-order responses: last request wins.
  Not idempotency.
- **Why can't I refresh a row that loaded?** The data is stable, so a
  refresh returns the same thing. Only failed rows get Try again. Row refresh
  is in NEXT_STEPS.md, with how a failed refresh should behave.
- **Why `useReducer` and not XState?** Small machines; a pure reducer and a
  transition table is the whole thing.
- **Where would the fan-out live in your architecture?** A server module that
  aggregates and caches.

## Required deliverables

The brief asks for a working app and a presentation. These documents support
the presentation:

- **README.md**: what it does, how to run it (`npm install`, `npm run dev`,
  `npm test`), the states the app and each row can be in, key decisions in
  brief, the assumptions made (30-day month, stable data, retry numbers,
  labels relative to load time), and the time spent. Facts only, drawn from
  this file, the code, and content Drew provides (the time spent).
- **AI_USAGE.md**: tools used, method (this file and CLAUDE.md as a contract,
  per-step review), useful prompts, what the AI got wrong, what it got right
  that wasn't specified, what was changed by hand. Drew owns it. The agent
  edits it only when Drew asks, with content Drew provides.
- **NEXT_STEPS.md**: the deferred items above, each with why it was deferred
  and what it would take.

## Brief requirements the code must satisfy

Checklist for the final review, in the brief's terms:

- Data from `https://fake-users-api.vercel.app`, handling random failures and
  slow responses.
- Displays per user: User ID, Full name, Email address, last login time, last
  login IP address.
- "Last" means most recent by timestamp.
- Displays a total count of users in the list.
- The states the app and its data can be in are visible and correct.
- Bonus: humanized login time.
- Bonus: users who haven't logged in for at least one month are called out.

## AI usage framing

- Design was worked out in a chat planning session and captured here and in
  CLAUDE.md before any code. The implementing agent works against that
  contract rather than choosing the approach.
- The planning session was itself reviewed: an independent agent assessed the
  plan for brief adherence and over-engineering before any code. It caught
  the First/Last name split (the brief asks for Full name), flagged sorting,
  Refresh all, background loading and auto-refresh as scope the brief didn't
  ask for, and pushed the abort and stale-response rules from undefined to
  specified. Those cuts and rules are reflected above.
- A second independent check after the docs were revised flagged refreshing
  loaded rows as the largest piece of scope left, given stable data. Cut;
  only `unavailable` rows get Try again.
- A read-only reviewer subagent checks drift before each implementation step,
  so drift from the brief and these decisions is caught one step late at
  worst, rather than at the end.