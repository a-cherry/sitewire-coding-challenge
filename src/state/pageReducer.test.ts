import { expect, test } from 'vitest'
import type { User } from '../domain/types.ts'
import { pageReducer, type PageEvent, type PageState } from './pageReducer.ts'

const loadedAt = Date.UTC(2026, 9, 19, 12, 0, 0)
const users: User[] = [{ id: 1, firstName: 'Orazio', lastName: 'Slipper', email: 'os@example.com' }]

test('loading goes to loaded with the users and loadedAt when /users succeeds', () => {
  expect(pageReducer({ kind: 'loading' }, { type: 'usersLoaded', users, loadedAt })).toEqual({
    kind: 'loaded',
    users,
    loadedAt,
  })
})

test('loading goes to error when /users fails', () => {
  expect(pageReducer({ kind: 'loading' }, { type: 'usersFailed' })).toEqual({ kind: 'error' })
})

test('error goes to loading on Try again', () => {
  expect(pageReducer({ kind: 'error' }, { type: 'retryRequested' })).toEqual({ kind: 'loading' })
})

test.each<{ state: PageState; event: PageEvent }>([
  { state: { kind: 'error' }, event: { type: 'usersLoaded', users, loadedAt } },
  { state: { kind: 'loaded', users, loadedAt }, event: { type: 'usersLoaded', users, loadedAt } },
  { state: { kind: 'error' }, event: { type: 'usersFailed' } },
  { state: { kind: 'loaded', users, loadedAt }, event: { type: 'usersFailed' } },
  { state: { kind: 'loading' }, event: { type: 'retryRequested' } },
  { state: { kind: 'loaded', users, loadedAt }, event: { type: 'retryRequested' } },
])('$event.type while $state.kind leaves state unchanged', ({ state, event }) => {
  expect(pageReducer(state, event)).toBe(state)
})
