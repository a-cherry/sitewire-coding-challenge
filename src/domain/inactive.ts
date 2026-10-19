import { INACTIVE_THRESHOLD_MS } from '../constants.ts'
import type { LatestLoginResult } from './types.ts'

export function isInactive(
  result: Exclude<LatestLoginResult, { kind: 'allFuture' }>,
  now: number,
): boolean {
  switch (result.kind) {
    case 'latest':
      return now - result.login.loginTime >= INACTIVE_THRESHOLD_MS
    case 'none':
      return true
    default: {
      const unhandled: never = result
      return unhandled
    }
  }
}
