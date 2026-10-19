import { expect, test } from 'vitest'
import { latestLogin } from './latestLogin.ts'
import type { Login } from './types.ts'

const now = Date.UTC(2026, 9, 19, 12, 0, 0)
const minute = 60 * 1000

function login(loginTime: number, ipV4: string): Login {
  return { loginTime, ipV4 }
}

test('picks the most recent login from unsorted input', () => {
  const logins = [
    login(now - 30 * minute, '10.0.0.1'),
    login(now - 10 * minute, '10.0.0.2'),
    login(now - 20 * minute, '10.0.0.3'),
  ]

  expect(latestLogin(logins, now)).toEqual({
    kind: 'latest',
    login: login(now - 10 * minute, '10.0.0.2'),
  })
})

test('an empty list is none', () => {
  expect(latestLogin([], now)).toEqual({ kind: 'none' })
})

test('a tie on the latest time keeps the first entry', () => {
  const logins = [
    login(now - 20 * minute, '10.0.0.1'),
    login(now - 10 * minute, '10.0.0.2'),
    login(now - 10 * minute, '10.0.0.3'),
  ]

  expect(latestLogin(logins, now)).toEqual({
    kind: 'latest',
    login: login(now - 10 * minute, '10.0.0.2'),
  })
})

test('an entry 4 minutes after now is kept', () => {
  const logins = [
    login(now - 10 * minute, '10.0.0.1'),
    login(now + 4 * minute, '10.0.0.2'),
  ]

  expect(latestLogin(logins, now)).toEqual({
    kind: 'latest',
    login: login(now + 4 * minute, '10.0.0.2'),
  })
})

test('an entry 6 minutes after now is ignored and the next latest wins', () => {
  const logins = [
    login(now + 6 * minute, '10.0.0.1'),
    login(now - 10 * minute, '10.0.0.2'),
    login(now - 20 * minute, '10.0.0.3'),
  ]

  expect(latestLogin(logins, now)).toEqual({
    kind: 'latest',
    login: login(now - 10 * minute, '10.0.0.2'),
  })
})

test('every entry beyond the tolerance is allFuture', () => {
  const logins = [
    login(now + 6 * minute, '10.0.0.1'),
    login(now + 60 * minute, '10.0.0.2'),
  ]

  expect(latestLogin(logins, now)).toEqual({ kind: 'allFuture' })
})
