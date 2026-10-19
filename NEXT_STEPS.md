# Next steps

What was deliberately not built, why, and what it would take.

## In this app

### Sorting

- **Why deferred.** Not in the brief. Sorting by ID, name or email is cheap.
  Sorting by login needs every user's logins, which needs background loading.
- **What it would take.** ID, name and email sorting could be done
  client-side, over the list already loaded. Login sorting needs the backend
  aggregator or background loading below.

### Background loading of all users

- **Why deferred.** ~1,300 to 1,400 requests per visit. At a concurrency cap
  of 10 and ~1.6s per request, that is ~3.5 to 4 minutes.
- **What it would take.** A worker pool with a concurrency cap of 10, and a
  foreground queue for the current page ahead of a background queue. Only
  worth it if the aggregator isn't available.

### Retry budget or circuit breaker

- **The gap.** Each row retries on its own. If the API is fully down, one page
  costs 25 rows x 4 attempts = 100 requests, and every page visit or Try again
  repeats that against a server that is already failing. Retries multiply load
  exactly when the server can least take it.
- **What it would take.** A budget shared across requests: if most of the last
  N requests failed, stop retrying and fail fast for a cooldown period.

### Client telemetry

- **The gap.** Nothing records retry counts, the rate of unavailable rows, or
  latency. The 30% failure rate and ~3.3s max come from a 30-call hand probe.
- **What it would take.** Report those numbers from the client, so the 4s
  timeout and the retry count are tuned from observed traffic rather than a
  sample.

### Country from IP

- **Why deferred.** It adds a third-party geo-IP dependency with its own
  failures, rate limits and possibly a key.
- **What it would take.** A server-side lookup against a local GeoIP database
  rather than a third-party call per row, cached by IP.

### A ticking clock for humanized times

- **Why deferred.** Humanized times and the inactive check use the moment
  `/users` loaded, so nothing reads the clock during render: no ticker, no
  clock effect, and no conflict with React's render-purity lint rule. The
  logins are weeks to months old, so labels are mostly days and months, and an
  hour of drift changes almost nothing.
- **What it would take.** A clock that ticks at the precision shown.

### Page in the URL, mobile layout

Not built.

## Beyond this app

### Backend aggregator

The real fix for N+1: a server endpoint (in Sitewire's terms, a module in the
TypeScript modular monolith) that fans out to the users API once, caches
logins, and serves users with their latest login in one response. It enables
global sorting, removes per-client fan-out, and puts retries where they're
shared.

### Latest login stored on write

Keep `last_login_at` and `last_login_ip` on the user, updated when a login is
recorded. Reads become one indexed query, sorting by login is an index, and
the inactive check becomes a query (`last_login_at < now() - 30 days`). The
cost of finding the latest login is paid once per write instead of on every
read.

### Personal data

Emails and IP addresses are personal data. At scale that means access control
on the endpoint, a retention policy for IPs, and possibly masking IPs in the
UI by default.

### Scale

At 100k users `/users` itself needs server-side pagination, and client-side
pagination stops working.

### Production fetching

A data-fetching library (TanStack Query) once the team owns the patterns,
rather than hand-rolled.

### Idempotency for writes

The request token is a read-side ordering guard, not idempotency. For
money-moving writes, idempotency keys checked transactionally server-side so a
retried request can't release a draw twice.
