import type { LatestLoginResult, Login } from '../domain/types.ts'

export type RowState =
  | { kind: 'idle' }
  | { kind: 'loading'; token: number; attempt: number }
  | { kind: 'loaded'; login: Login }
  | { kind: 'neverLoggedIn' }
  | { kind: 'unavailable' }

export type RowsState = ReadonlyMap<number, RowState>

export type RowsEvent =
  | { type: 'loadStarted'; userId: number; token: number }
  | { type: 'attemptFailed'; userId: number; token: number; attempt: number }
  | {
      type: 'succeeded'
      userId: number
      token: number
      result: Exclude<LatestLoginResult, { kind: 'allFuture' }>
    }
  | { type: 'failed'; userId: number; token: number }
  | { type: 'pageChanged' }

export function rowState(rows: RowsState, userId: number): RowState {
  return rows.get(userId) ?? { kind: 'idle' }
}

export function rowsReducer(state: RowsState, event: RowsEvent): RowsState {
  switch (event.type) {
    case 'loadStarted': {
      const row = rowState(state, event.userId)
      if (row.kind !== 'idle' && row.kind !== 'unavailable') {
        return state
      }
      return withRow(state, event.userId, { kind: 'loading', token: event.token, attempt: 1 })
    }
    case 'attemptFailed':
      if (!holdsToken(state, event.userId, event.token)) {
        return state
      }
      return withRow(state, event.userId, {
        kind: 'loading',
        token: event.token,
        attempt: event.attempt,
      })
    case 'succeeded':
      if (!holdsToken(state, event.userId, event.token)) {
        return state
      }
      return withRow(
        state,
        event.userId,
        event.result.kind === 'latest'
          ? { kind: 'loaded', login: event.result.login }
          : { kind: 'neverLoggedIn' },
      )
    case 'failed':
      if (!holdsToken(state, event.userId, event.token)) {
        return state
      }
      return withRow(state, event.userId, { kind: 'unavailable' })
    case 'pageChanged':
      return new Map(
        [...state].map(([userId, row]) => [userId, row.kind === 'loading' ? { kind: 'idle' } : row]),
      )
    default: {
      const unhandled: never = event
      return unhandled
    }
  }
}

// Only a loading row holds a token, so every other row ignores token-carrying events.
function holdsToken(rows: RowsState, userId: number, token: number): boolean {
  const row = rowState(rows, userId)
  return row.kind === 'loading' && row.token === token
}

function withRow(rows: RowsState, userId: number, row: RowState): RowsState {
  return new Map(rows).set(userId, row)
}
