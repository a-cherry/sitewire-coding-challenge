const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const MONTH_MS = 30 * DAY_MS
const YEAR_MS = 365 * DAY_MS

// Largest first: the first unit that fits is the one shown.
const UNITS = [
  ['year', YEAR_MS],
  ['month', MONTH_MS],
  ['day', DAY_MS],
  ['hour', HOUR_MS],
  ['minute', MINUTE_MS],
] as const

export function formatRelative(time: number, now: number): string {
  const elapsed = now - time
  for (const [unit, unitMs] of UNITS) {
    if (elapsed >= unitMs) {
      const format = new Intl.RelativeTimeFormat(undefined, { style: 'long', numeric: 'always' })
      return format.format(-Math.floor(elapsed / unitMs), unit)
    }
  }
  return 'just now'
}

export function formatExact(time: number): string {
  const format = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'long' })
  return format.format(new Date(time))
}
