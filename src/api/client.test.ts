import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { fetchUserLogins, fetchUsers } from './client.ts'

const usersBody = JSON.stringify([
  { id: 1, first_name: 'Orazio', last_name: 'Slipper', email: 'oslipper0@example.com' },
])

function respondWith(status: number, body: string) {
  return vi.fn<typeof fetch>(() => Promise.resolve(new Response(body, { status })))
}

// Settles after delayMs like the real API, or rejects the way fetch does when its signal aborts.
function respondAfter(delayMs: number, body: string) {
  return vi.fn<typeof fetch>(
    (_input, init) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(new Response(body, { status: 200 })), delayMs)
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        })
      }),
  )
}

// Headers arrive after headersMs and the body bodyMs later. As with real fetch, an abort errors the body.
function respondInParts(headersMs: number, bodyMs: number, body: string) {
  return vi.fn<typeof fetch>(
    (_input, init) =>
      new Promise((resolve) => {
        setTimeout(() => {
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              const timer = setTimeout(() => {
                controller.enqueue(new TextEncoder().encode(body))
                controller.close()
              }, bodyMs)
              init?.signal?.addEventListener('abort', () => {
                clearTimeout(timer)
                controller.error(new DOMException('The operation was aborted.', 'AbortError'))
              })
            },
          })
          resolve(new Response(stream, { status: 200 }))
        }, headersMs)
      }),
  )
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  // The client's timeout timer is cleared on every exit path.
  expect(vi.getTimerCount()).toBe(0)
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

test('200 with a valid users body is the users', async () => {
  const fetchMock = respondWith(200, usersBody)
  vi.stubGlobal('fetch', fetchMock)

  const result = await fetchUsers(new AbortController().signal)

  expect(result).toEqual({
    ok: true,
    value: [{ id: 1, firstName: 'Orazio', lastName: 'Slipper', email: 'oslipper0@example.com' }],
  })
  expect(fetchMock.mock.calls[0]?.[0]).toBe('https://fake-users-api.vercel.app/users')
})

test('200 with a valid logins body is the logins for the requested user', async () => {
  const body = JSON.stringify({
    user_id: 7,
    logins: [{ login_time: '2026-08-18T08:04:17.000Z', ip_v4: '61.129.200.209' }],
  })
  const fetchMock = respondWith(200, body)
  vi.stubGlobal('fetch', fetchMock)

  const result = await fetchUserLogins(7, new AbortController().signal)

  expect(result).toEqual({
    ok: true,
    value: [{ loginTime: Date.UTC(2026, 7, 18, 8, 4, 17), ipV4: '61.129.200.209' }],
  })
  expect(fetchMock.mock.calls[0]?.[0]).toBe(
    'https://fake-users-api.vercel.app/users/7/relationships/logins',
  )
})

test('500 with a non-JSON body is http 500', async () => {
  vi.stubGlobal('fetch', respondWith(500, 'Internal Server Error'))

  const result = await fetchUsers(new AbortController().signal)

  expect(result).toEqual({ ok: false, failure: { kind: 'http', status: 500 } })
})

test('a network rejection is network', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() => Promise.reject(new TypeError('Failed to fetch'))),
  )

  const result = await fetchUsers(new AbortController().signal)

  expect(result).toEqual({ ok: false, failure: { kind: 'network' } })
})

test('a response slower than 4s is timeout', async () => {
  vi.stubGlobal('fetch', respondAfter(5000, usersBody))

  const pending = fetchUsers(new AbortController().signal)
  vi.advanceTimersByTime(4000)

  expect(await pending).toEqual({ ok: false, failure: { kind: 'timeout' } })
})

test('a response that arrives within 4s is not timed out while its body is read', async () => {
  vi.stubGlobal('fetch', respondInParts(3000, 2000, usersBody))

  const pending = fetchUsers(new AbortController().signal)
  await vi.advanceTimersByTimeAsync(5000)

  expect(await pending).toEqual({
    ok: true,
    value: [{ id: 1, firstName: 'Orazio', lastName: 'Slipper', email: 'oslipper0@example.com' }],
  })
})

test('a body that fails while being read is network', async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new TypeError('network error'))
    },
  })
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() => Promise.resolve(new Response(body, { status: 200 }))),
  )

  const result = await fetchUsers(new AbortController().signal)

  expect(result).toEqual({ ok: false, failure: { kind: 'network' } })
})

test('a caller abort is aborted', async () => {
  vi.stubGlobal('fetch', respondAfter(1000, usersBody))
  const caller = new AbortController()

  const pending = fetchUsers(caller.signal)
  caller.abort()

  expect(await pending).toEqual({ ok: false, failure: { kind: 'aborted' } })
})

test('the timeout and a caller abort in the same tick is aborted', async () => {
  vi.stubGlobal('fetch', respondAfter(5000, usersBody))
  const caller = new AbortController()

  const pending = fetchUsers(caller.signal)
  // Both fire before the fetch rejection is classified.
  vi.advanceTimersByTime(4000)
  caller.abort()

  expect(await pending).toEqual({ ok: false, failure: { kind: 'aborted' } })
})

test('200 with a body that fails validation is invalid', async () => {
  vi.stubGlobal('fetch', respondWith(200, JSON.stringify({ users: [] })))

  const result = await fetchUsers(new AbortController().signal)

  expect(result).toEqual({ ok: false, failure: { kind: 'invalid' } })
})

test('200 with a non-JSON body is invalid', async () => {
  vi.stubGlobal('fetch', respondWith(200, '<html>not json</html>'))

  const result = await fetchUsers(new AbortController().signal)

  expect(result).toEqual({ ok: false, failure: { kind: 'invalid' } })
})
