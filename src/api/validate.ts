import type { Login, User } from '../domain/types.ts'

export type ParseResult<T> = { ok: true; value: T } | { ok: false }

const invalid = { ok: false } as const

// Array.isArray narrows to any[]; this keeps the entries unknown.
function isArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

export function parseUsers(json: unknown): ParseResult<User[]> {
  if (!isArray(json)) {
    return invalid
  }

  const users: User[] = []
  const ids = new Set<number>()
  for (const entry of json) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      !('id' in entry) ||
      !('first_name' in entry) ||
      !('last_name' in entry) ||
      !('email' in entry)
    ) {
      return invalid
    }
    const { id, first_name, last_name, email } = entry
    if (
      typeof id !== 'number' ||
      typeof first_name !== 'string' ||
      typeof last_name !== 'string' ||
      typeof email !== 'string'
    ) {
      return invalid
    }
    // Row state, the cache and React keys all assume unique ids.
    if (ids.has(id)) {
      return invalid
    }
    ids.add(id)
    users.push({ id, firstName: first_name, lastName: last_name, email })
  }
  return { ok: true, value: users }
}

export function parseUserLogins(json: unknown, requestedId: number): ParseResult<Login[]> {
  if (typeof json !== 'object' || json === null || !('user_id' in json) || !('logins' in json)) {
    return invalid
  }
  if (json.user_id !== requestedId || !isArray(json.logins)) {
    return invalid
  }

  const logins: Login[] = []
  // One bad entry invalidates the response: skipping it could hide the real most recent login.
  for (const entry of json.logins) {
    if (typeof entry !== 'object' || entry === null || !('login_time' in entry) || !('ip_v4' in entry)) {
      return invalid
    }
    const { login_time, ip_v4 } = entry
    if (typeof login_time !== 'string' || typeof ip_v4 !== 'string') {
      return invalid
    }
    const loginTime = Date.parse(login_time)
    if (Number.isNaN(loginTime)) {
      return invalid
    }
    logins.push({ loginTime, ipV4: ip_v4 })
  }
  return { ok: true, value: logins }
}
