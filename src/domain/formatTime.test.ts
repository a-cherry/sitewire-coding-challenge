import { describe, expect, test } from 'vitest'
import { formatExact, formatRelative } from './formatTime.ts'

const now = Date.UTC(2026, 9, 19, 12, 0, 0)
const second = 1000
const minute = 60 * second
const hour = 60 * minute
const day = 24 * hour

describe('formatRelative', () => {
  test.each([
    { label: '59 seconds ago', time: now - 59 * second, expected: 'just now' },
    { label: '2 minutes after now', time: now + 2 * minute, expected: 'just now' },
    { label: '60 seconds ago', time: now - 60 * second, expected: '1 minute ago' },
    { label: '90 seconds ago', time: now - 90 * second, expected: '1 minute ago' },
    { label: '59 minutes ago', time: now - 59 * minute, expected: '59 minutes ago' },
    { label: '60 minutes ago', time: now - 60 * minute, expected: '1 hour ago' },
    { label: '23 hours ago', time: now - 23 * hour, expected: '23 hours ago' },
    { label: '24 hours ago', time: now - 24 * hour, expected: '1 day ago' },
    { label: '29 days ago', time: now - 29 * day, expected: '29 days ago' },
    { label: '30 days ago', time: now - 30 * day, expected: '1 month ago' },
    { label: '59 days ago', time: now - 59 * day, expected: '1 month ago' },
    { label: '364 days ago', time: now - 364 * day, expected: '12 months ago' },
    { label: '365 days ago', time: now - 365 * day, expected: '1 year ago' },
  ])('$label is "$expected"', ({ time, expected }) => {
    expect(formatRelative(time, now)).toBe(expected)
  })
})

describe('formatExact', () => {
  test('formats date and time with the time zone', () => {
    expect(formatExact(Date.UTC(2026, 7, 18, 8, 4, 17))).toBe('Aug 18, 2026, 8:04:17 AM UTC')
  })
})
