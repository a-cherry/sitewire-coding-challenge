import { FUTURE_LOGIN_TOLERANCE_MS } from '../constants.ts'
import type { LatestLoginResult, Login } from './types.ts'

export function latestLogin(logins: readonly Login[], now: number): LatestLoginResult {
  if (logins.length === 0) {
    return { kind: 'none' }
  }

  let latest: Login | undefined
  for (const login of logins) {
    if (login.loginTime - now > FUTURE_LOGIN_TOLERANCE_MS) {
      continue
    }
    // Strict > so a tie keeps the first entry.
    if (latest === undefined || login.loginTime > latest.loginTime) {
      latest = login
    }
  }

  return latest === undefined ? { kind: 'allFuture' } : { kind: 'latest', login: latest }
}
