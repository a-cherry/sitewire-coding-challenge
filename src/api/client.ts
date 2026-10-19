import { API_BASE_URL, REQUEST_TIMEOUT_MS } from '../constants.ts'
import type { Login, User } from '../domain/types.ts'
import { parseUserLogins, parseUsers, type ParseResult } from './validate.ts'

export type Failure =
  | { kind: 'http'; status: number }
  | { kind: 'network' }
  | { kind: 'timeout' }
  | { kind: 'invalid' }
  | { kind: 'aborted' }

export type Result<T> = { ok: true; value: T } | { ok: false; failure: Failure }

export function fetchUsers(signal: AbortSignal): Promise<Result<User[]>> {
  return request(`${API_BASE_URL}/users`, signal, parseUsers)
}

export function fetchUserLogins(userId: number, signal: AbortSignal): Promise<Result<Login[]>> {
  return request(`${API_BASE_URL}/users/${userId}/relationships/logins`, signal, (json) =>
    parseUserLogins(json, userId),
  )
}

async function request<T>(
  url: string,
  signal: AbortSignal,
  parse: (json: unknown) => ParseResult<T>,
): Promise<Result<T>> {
  const timeout = new AbortController()
  // Times the wait for the response only, not reading its body.
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.any([signal, timeout.signal]) })
  } catch {
    return { ok: false, failure: rejection(signal, timeout.signal) }
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    return { ok: false, failure: { kind: 'http', status: response.status } }
  }

  let body: string
  try {
    body = await response.text()
  } catch {
    return { ok: false, failure: rejection(signal, timeout.signal) }
  }

  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    return { ok: false, failure: { kind: 'invalid' } }
  }
  const parsed = parse(json)
  return parsed.ok ? parsed : { ok: false, failure: { kind: 'invalid' } }
}

// Caller first: if they aborted, a timeout that also fired must not be retried.
function rejection(signal: AbortSignal, timeoutSignal: AbortSignal): Failure {
  if (signal.aborted) {
    return { kind: 'aborted' }
  }
  if (timeoutSignal.aborted) {
    return { kind: 'timeout' }
  }
  return { kind: 'network' }
}
