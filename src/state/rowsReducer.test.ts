import { expect, test } from 'vitest'
import type { Login } from '../domain/types.ts'
import { rowsReducer, type RowState, type RowsEvent, type RowsState } from './rowsReducer.ts'

const login: Login = { loginTime: Date.UTC(2026, 7, 18, 8, 4, 17), ipV4: '61.129.200.209' }

function rows(...entries: [number, RowState][]): RowsState {
  return new Map(entries)
}

test('loadStarted on a user with no entry starts loading at attempt 1', () => {
  expect(rowsReducer(rows(), { type: 'loadStarted', userId: 1, token: 7 })).toEqual(
    rows([1, { kind: 'loading', token: 7, attempt: 1 }]),
  )
})

test('loadStarted on an idle row starts loading at attempt 1', () => {
  const state = rows([1, { kind: 'idle' }])

  expect(rowsReducer(state, { type: 'loadStarted', userId: 1, token: 7 })).toEqual(
    rows([1, { kind: 'loading', token: 7, attempt: 1 }]),
  )
})

test('loadStarted on an unavailable row starts loading at attempt 1', () => {
  const state = rows([1, { kind: 'unavailable' }])

  expect(rowsReducer(state, { type: 'loadStarted', userId: 1, token: 7 })).toEqual(
    rows([1, { kind: 'loading', token: 7, attempt: 1 }]),
  )
})

test('attemptFailed copies the attempt from the event without incrementing', () => {
  const state = rows([1, { kind: 'loading', token: 7, attempt: 1 }])

  expect(rowsReducer(state, { type: 'attemptFailed', userId: 1, token: 7, attempt: 3 })).toEqual(
    rows([1, { kind: 'loading', token: 7, attempt: 3 }]),
  )
})

test('succeeded with a latest login goes to loaded', () => {
  const state = rows([1, { kind: 'loading', token: 7, attempt: 2 }])

  expect(
    rowsReducer(state, {
      type: 'succeeded',
      userId: 1,
      token: 7,
      result: { kind: 'latest', login },
    }),
  ).toEqual(rows([1, { kind: 'loaded', login }]))
})

test('succeeded with no logins goes to neverLoggedIn', () => {
  const state = rows([1, { kind: 'loading', token: 7, attempt: 1 }])

  expect(
    rowsReducer(state, { type: 'succeeded', userId: 1, token: 7, result: { kind: 'none' } }),
  ).toEqual(rows([1, { kind: 'neverLoggedIn' }]))
})

test('failed goes to unavailable', () => {
  const state = rows([1, { kind: 'loading', token: 7, attempt: 4 }])

  expect(rowsReducer(state, { type: 'failed', userId: 1, token: 7 })).toEqual(
    rows([1, { kind: 'unavailable' }]),
  )
})

test('pageChanged returns a loading row to idle, never unavailable', () => {
  const state = rows([1, { kind: 'loading', token: 7, attempt: 2 }])

  expect(rowsReducer(state, { type: 'pageChanged' })).toEqual(rows([1, { kind: 'idle' }]))
})

test('pageChanged leaves idle, loaded, neverLoggedIn and unavailable rows unchanged', () => {
  const idle: RowState = { kind: 'idle' }
  const loaded: RowState = { kind: 'loaded', login }
  const neverLoggedIn: RowState = { kind: 'neverLoggedIn' }
  const unavailable: RowState = { kind: 'unavailable' }
  const state = rows(
    [1, loaded],
    [2, neverLoggedIn],
    [3, unavailable],
    [4, { kind: 'loading', token: 7, attempt: 1 }],
    [5, idle],
  )

  const next = rowsReducer(state, { type: 'pageChanged' })

  expect(next).toEqual(
    rows([1, loaded], [2, neverLoggedIn], [3, unavailable], [4, { kind: 'idle' }], [5, idle]),
  )
  expect(next.get(1)).toBe(loaded)
  expect(next.get(2)).toBe(neverLoggedIn)
  expect(next.get(3)).toBe(unavailable)
  expect(next.get(5)).toBe(idle)
})

const tokenEvents: { name: string; event: RowsEvent }[] = [
  { name: 'attemptFailed', event: { type: 'attemptFailed', userId: 1, token: 7, attempt: 2 } },
  { name: 'succeeded', event: { type: 'succeeded', userId: 1, token: 7, result: { kind: 'none' } } },
  { name: 'failed', event: { type: 'failed', userId: 1, token: 7 } },
]

test.each(tokenEvents)('$name with a stale token leaves state unchanged', ({ event }) => {
  const state = rows([1, { kind: 'loading', token: 8, attempt: 1 }])

  expect(rowsReducer(state, event)).toBe(state)
})

const tokenlessRows: RowState[] = [
  { kind: 'idle' },
  { kind: 'loaded', login },
  { kind: 'neverLoggedIn' },
  { kind: 'unavailable' },
]

test.each(
  tokenlessRows.flatMap((row) => tokenEvents.map(({ name, event }) => ({ name, event, row }))),
)('$name on $row.kind, which holds no token, leaves state unchanged', ({ event, row }) => {
  const state = rows([1, row])

  expect(rowsReducer(state, event)).toBe(state)
})

test.each<RowState>([
  { kind: 'loading', token: 8, attempt: 1 },
  { kind: 'loaded', login },
  { kind: 'neverLoggedIn' },
])('loadStarted on $kind leaves state unchanged', (row) => {
  const state = rows([1, row])

  expect(rowsReducer(state, { type: 'loadStarted', userId: 1, token: 7 })).toBe(state)
})
