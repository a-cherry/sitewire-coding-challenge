import { expect, test } from 'vitest'
import { isInactive } from './inactive.ts'

const now = Date.UTC(2026, 9, 19, 12, 0, 0)
const thirtyDays = 30 * 24 * 60 * 60 * 1000

test('a login exactly 30 days before now is inactive', () => {
  const result = {
    kind: 'latest',
    login: { loginTime: now - thirtyDays, ipV4: '10.0.0.1' },
  } as const

  expect(isInactive(result, now)).toBe(true)
})

test('a login 30 days minus 1ms before now is not inactive', () => {
  const result = {
    kind: 'latest',
    login: { loginTime: now - thirtyDays + 1, ipV4: '10.0.0.1' },
  } as const

  expect(isInactive(result, now)).toBe(false)
})

test('never logged in is inactive', () => {
  expect(isInactive({ kind: 'none' }, now)).toBe(true)
})
