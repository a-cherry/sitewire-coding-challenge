import type { ReactNode } from 'react'
import { formatExact, formatRelative } from '../domain/formatTime.ts'
import { isInactive } from '../domain/inactive.ts'
import type { User } from '../domain/types.ts'
import type { RowState } from '../state/rowsReducer.ts'

type UserRowProps = {
  user: User
  row: RowState
  now: number
  onRetry: () => void
}

export function UserRow({ user, row, now, onRetry }: UserRowProps) {
  const fullName = `${user.firstName} ${user.lastName}`
  const inactive =
    (row.kind === 'loaded' && isInactive({ kind: 'latest', login: row.login }, now)) ||
    (row.kind === 'neverLoggedIn' && isInactive({ kind: 'none' }, now))
  const badge = inactive && <span className="badge">Inactive</span>

  return (
    <tr className={inactive ? 'inactive' : undefined}>
      <td>{user.id}</td>
      <td>{fullName}</td>
      <td>{user.email}</td>
      {loginCells(row, now, badge, fullName, onRetry)}
    </tr>
  )
}

function loginCells(
  row: RowState,
  now: number,
  badge: ReactNode,
  fullName: string,
  onRetry: () => void,
) {
  switch (row.kind) {
    case 'idle':
      return (
        <>
          <td></td>
          <td></td>
        </>
      )
    case 'loading':
      return (
        <>
          <td className="muted">{row.attempt === 1 ? 'Loading…' : 'Retrying…'}</td>
          <td></td>
        </>
      )
    case 'loaded':
      return (
        <>
          <td title={formatExact(row.login.loginTime)}>
            {formatRelative(row.login.loginTime, now)} {badge}
          </td>
          <td>{row.login.ipV4}</td>
        </>
      )
    case 'neverLoggedIn':
      return (
        <>
          <td>
            <span className="muted">Never logged in</span> {badge}
          </td>
          <td></td>
        </>
      )
    case 'unavailable':
      return (
        <>
          <td>
            <span className="muted">Unavailable</span>{' '}
            <button
              type="button"
              className="text-button"
              aria-label={`Try loading login data for ${fullName} again`}
              onClick={onRetry}
            >
              Try again
            </button>
          </td>
          <td></td>
        </>
      )
    default: {
      const unhandled: never = row
      return unhandled
    }
  }
}
