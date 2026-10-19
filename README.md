# Sitewire coding challenge

A React and TypeScript single-page app that lists the users from
`https://fake-users-api.vercel.app`, each with their most recent login time and
IP address, plus a total count of users. The API fails roughly 25 to 30% of
requests and takes up to ~3s to respond, failures included. The app retries
those failures and shows the state of every row as it loads.

## Demo

[add demo here]

Recorded with Playwright against the live API, from a production build. Page
1 fills in as rows load, some showing "Retrying…" first, and logins 30 days
or older get the "Inactive" badge and tint. Paging forward leaves page 2
mid-load. Going back, page 2 loads its unfinished rows again and page 1
renders from the cache with no requests. No row ended up "Unavailable" in
this recording.

## Running it

```
npm install
npm run dev
npm test
```

`npm run typecheck`, `npm run lint` and `npm run build` are also available.

`npm test` sets `TZ=UTC LC_ALL=en_US.UTF-8` inline so formatting tests are
deterministic. That syntax works on macOS and Linux, not Windows `cmd`.

## What it shows

Columns: ID, Full name, Email, Last login, IP. Full name is
`first_name + " " + last_name` in one column. The total count ("1,000 users",
or "1 user") is `users.length` from `/users`.

Users are paginated client-side, 25 per page, over the full `/users` list.
Logins are fetched only for the rows on the current page.

## States

### The page

| State | What you see |
|---|---|
| `loading` | Loading users… |
| `error` | Couldn't load users. and a Try again button |
| `loaded` | The count, Prev / "Page N of M" / Next, and the table |
| `loaded`, zero users | "0 users" and "No users to show.", with no pagination |

`error` is the only error message in the app. The count renders only in
`loaded`. Try again returns the page to `loading`.

### Each row

| State | Last login cell | IP cell |
|---|---|---|
| `idle` | blank (momentary) | blank |
| `loading`, attempt 1 | Loading… | blank |
| `loading`, attempt 2+ | Retrying… | blank |
| `loaded` | a humanized time, e.g. "3 months ago" | the IP |
| `neverLoggedIn` | Never logged in | blank |
| `unavailable` | Unavailable and a Try again button | blank |

- Hovering a loaded login cell shows the exact local time with its time zone,
for example "Aug 18, 2026, 2:04:17 AM MDT". Every state is visible as text
without hovering.
- Try again appears only on `unavailable` rows. Its accessible label names
the user ("Try loading login data for {full name} again").
- `loaded` and `neverLoggedIn` are final for the session. Visiting a page
loads its `idle` and `unavailable` rows. Loaded rows render from the cache
with no request.
- Leaving a page aborts its in-flight requests and returns those rows to
`idle` at once. They load again when you come back. An aborted request is
never shown as a failure.
- Users who haven't logged in for at least 30 days, and users who have never
logged in, get an "Inactive" text badge and a light row tint.

The row and page state machines are pure reducers in `src/state/`, tested
without React. The transition table is in DECISIONS.md, "Row state machine".

## Key decisions

- **Page-scoped loading.** `/users` has no login data, so each user's login
costs one more request. Loading all 1,000 users would take ~1,300 to 1,400
requests including retries. Only the visible 25 are fetched.
- **Retry policy, for both endpoints.** A 4s timeout per attempt, up to 3
retries (4 attempts), and a backoff before retry n of 200, 400 or 800ms with
equal jitter (a wait between half the base and the full base). Only 5xx
responses, network errors and timeouts are retried. On rows, "Retrying…"
shows as soon as an attempt fails, before the backoff wait.
- **Validated responses.** Responses are validated into domain types in
`src/api/`. An invalid 200 is a final failure and is not retried. Duplicate
user ids make `/users` invalid. One bad login entry invalidates the whole
logins response, and a `user_id` that differs from the requested id is
invalid.
- **Most recent login** is the maximum by parsed timestamp, never array
position or string comparison. Ties keep the first entry. Entries more than
5 minutes after the current time are ignored. If every entry is ignored,
the row is "Unavailable", not "Never logged in".
- **Out-of-order responses.** Every row load carries a request token, and a
response is applied only if its token is still that row's current one.
- **Hand-rolled fetching and retry,** `useReducer` **state machines.** No
data-fetching or state library, so every transition is visible and owned.
Runtime dependencies are `react` and `react-dom` only.
- **StrictMode is on.** In development the first set of requests shows as
cancelled in the network tab and the second set completes.

The full reasoning is in DECISIONS.md. Deferred work is in NEXT_STEPS.md.

## Assumptions

- **A month is 30 days** for both the inactive rule and humanized times. A
year is 365 days.
- **The data is stable.** User 1's logins were identical 60 seconds apart, so
a row that loaded is not refreshed.
- **Retry numbers** come from a hand probe of the API: 9 of 30 logins calls
failed (30%), latency max ~3.3s, and failures were as slow as successes. At
30% a row fails all 4 attempts 0.81% of the time, about 0.2 unavailable rows
per page.
- **Labels are relative to load time.** Humanized times and the inactive check
use the moment `/users` loaded, not a ticking clock. Labels drift by however
long the page has been open. A login at or after that moment shows as "just
now".
- **The 5-minute future tolerance** exists because the current time comes from
the user's clock, not the server's.
- Names are displayed as given.

## Tests

Unit tests on the pure modules: latest login, inactive rule, time formatting,
response validation, retry, and both reducers. The API client's failure
classification is tested with `fetch` stubbed. A few React Testing Library
tests in `src/components/App.test.tsx` cover the page error and recovery, a
loaded page, the inactive badge, and an unavailable row recovering through Try
again. `fetch` is stubbed, so no test calls the real API. Time and randomness
are controlled with fake timers, `vi.setSystemTime` and a mocked
`Math.random`.
