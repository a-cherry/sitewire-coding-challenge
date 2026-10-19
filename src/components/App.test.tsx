import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { App } from './App.tsx'

type RawUser = { id: number; first_name: string; last_name: string; email: string }
type RawLogin = { login_time: string; ip_v4: string }
type FakeApi = {
  users: RawUser[]
  usersFail: boolean
  failingLogins: Set<number>
  logins: Map<number, RawLogin[]>
}

const now = Date.UTC(2026, 9, 19, 12, 0, 0)
const serverError = { status: 500, body: { error: 'Internal Server Error' } }

let api: FakeApi

function reply(path: string): { status: number; body: unknown } {
  if (path === '/users') {
    return api.usersFail ? serverError : { status: 200, body: api.users }
  }
  const match = /^\/users\/(\d+)\/relationships\/logins$/.exec(path)
  if (match === null) {
    return { status: 404, body: {} }
  }
  const userId = Number(match[1])
  if (api.failingLogins.has(userId)) {
    return serverError
  }
  return { status: 200, body: { user_id: userId, logins: api.logins.get(userId) ?? [] } }
}

function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { status, body } = reply(new URL(String(input)).pathname)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(new Response(JSON.stringify(body), { status })), 10)
    init?.signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    })
  })
}

function rawUsers(count: number): RawUser[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    first_name: `First${index + 1}`,
    last_name: 'Last',
    email: `user${index + 1}@example.com`,
  }))
}

function renderApp() {
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

function requestsTo(path: string): number {
  return vi.mocked(fetch).mock.calls.filter(([input]) => new URL(String(input)).pathname === path)
    .length
}

function advance(ms: number) {
  return act(() => vi.advanceTimersByTimeAsync(ms))
}

// Position 0 is the header row; data rows follow in user order.
function tableRow(position: number): HTMLElement {
  const row = screen.getAllByRole('row')[position]
  if (row === undefined) {
    throw new Error(`No table row at position ${position}`)
  }
  return row
}

function cellTexts(row: HTMLElement): string[] {
  return within(row)
    .getAllByRole('cell')
    .map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim())
}

beforeEach(() => {
  api = { users: [], usersFail: false, failingLogins: new Set(), logins: new Map() }
  vi.useFakeTimers()
  vi.setSystemTime(now)
  vi.spyOn(Math, 'random').mockReturnValue(0)
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(fakeFetch))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('a /users failure after all retries shows the page error, and Try again recovers', async () => {
  api.users = rawUsers(2)
  api.usersFail = true
  renderApp()

  expect(screen.getByText('Loading users…')).toBeInTheDocument()

  await advance(1000)

  // StrictMode's first request, aborted, then four attempts.
  expect(requestsTo('/users')).toBe(5)
  expect(screen.getByText("Couldn't load users.")).toBeInTheDocument()
  expect(screen.queryByText('2 users')).not.toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()

  api.usersFail = false
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

  expect(screen.getByText('Loading users…')).toBeInTheDocument()

  await advance(10)

  expect(screen.queryByText("Couldn't load users.")).not.toBeInTheDocument()
  expect(screen.getByText('2 users')).toBeInTheDocument()
  expect(screen.getByRole('table')).toBeInTheDocument()
})

test('a loaded page shows the total count, the first 25 users and the page position', async () => {
  api.users = rawUsers(1000)
  renderApp()

  await advance(10)

  expect(screen.getByText('1,000 users')).toBeInTheDocument()
  expect(screen.getByText('Page 1 of 40')).toBeInTheDocument()
  const ids = screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => cellTexts(row)[0])
  expect(ids).toEqual(Array.from({ length: 25 }, (_, index) => String(index + 1)))
  // Rows are still loading here; Next must not wait for them.
  expect(screen.getByRole('button', { name: 'Prev' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
})

test('a list of one user shows the singular count', async () => {
  api.users = rawUsers(1)
  renderApp()

  await advance(10)

  expect(screen.getByText('1 user')).toBeInTheDocument()
})

test('a row whose latest login is 30 days old shows the Inactive badge and tint', async () => {
  api.users = rawUsers(1)
  api.logins.set(1, [{ login_time: '2026-09-19T12:00:00.000Z', ip_v4: '61.129.200.209' }])
  renderApp()

  await advance(10)
  await advance(10)

  const row = tableRow(1)
  expect(cellTexts(row)).toEqual([
    '1',
    'First1 Last',
    'user1@example.com',
    '1 month ago Inactive',
    '61.129.200.209',
  ])
  expect(row).toHaveClass('inactive', { exact: true })
})

test('a row that fails all retries shows Unavailable and Try again loads it; an empty row is Never logged in and Inactive', async () => {
  api.users = [
    { id: 1, first_name: 'Orazio', last_name: 'Slipper', email: 'oslipper0@example.com' },
    { id: 2, first_name: 'Zsa zsa', last_name: 'de Voiels', email: 'zdevoiels1@example.com' },
  ]
  api.failingLogins.add(1)
  api.logins.set(1, [{ login_time: '2026-10-16T12:00:00.000Z', ip_v4: '61.129.200.209' }])
  renderApp()

  await advance(10)
  await advance(10)

  expect(cellTexts(tableRow(1))).toEqual(['1', 'Orazio Slipper', 'oslipper0@example.com', 'Retrying…', ''])
  expect(cellTexts(tableRow(2))).toEqual([
    '2',
    'Zsa zsa de Voiels',
    'zdevoiels1@example.com',
    'Never logged in Inactive',
    '',
  ])
  expect(tableRow(2)).toHaveClass('inactive', { exact: true })

  await advance(1000)

  // StrictMode's first request, aborted, then four attempts.
  expect(requestsTo('/users/1/relationships/logins')).toBe(5)
  expect(cellTexts(tableRow(1))).toEqual([
    '1',
    'Orazio Slipper',
    'oslipper0@example.com',
    'Unavailable Try again',
    '',
  ])

  api.failingLogins.delete(1)
  fireEvent.click(screen.getByRole('button', { name: 'Try loading login data for Orazio Slipper again' }))

  expect(cellTexts(tableRow(1))).toEqual(['1', 'Orazio Slipper', 'oslipper0@example.com', 'Loading…', ''])

  await advance(10)

  const row = tableRow(1)
  expect(cellTexts(row)).toEqual([
    '1',
    'Orazio Slipper',
    'oslipper0@example.com',
    '3 days ago',
    '61.129.200.209',
  ])
  expect(within(row).getAllByRole('cell')[3]).toHaveAttribute('title', 'Oct 16, 2026, 12:00:00 PM UTC')
  expect(within(row).queryByRole('button')).not.toBeInTheDocument()
  expect(row).not.toHaveClass('inactive')
})
