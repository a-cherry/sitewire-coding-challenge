import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Result } from '../api/client.ts'
import { withRetry } from './retry.ts'

const success: Result<string> = { ok: true, value: 'logins' }
const serverError: Result<string> = { ok: false, failure: { kind: 'http', status: 500 } }

// Returns the scripted results in order, one per call, then success.
function scripted(...results: Result<string>[]) {
  let call = 0
  return vi.fn<(signal: AbortSignal) => Promise<Result<string>>>(() => {
    const result = results[call] ?? success
    call += 1
    return Promise.resolve(result)
  })
}

function run(
  attempt: (signal: AbortSignal) => Promise<Result<string>>,
  random: () => number = () => 0,
  signal: AbortSignal = new AbortController().signal,
) {
  const onRetry = vi.fn<(attemptNumber: number) => void>()
  const pending = withRetry(attempt, { signal, random, onRetry })
  return { pending, onRetry }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  // No backoff timer outlives withRetry.
  expect(vi.getTimerCount()).toBe(0)
  vi.useRealTimers()
})

test('success on the first try makes one call and no retry', async () => {
  const attempt = scripted(success)

  const { pending, onRetry } = run(attempt)

  expect(await pending).toEqual(success)
  expect(attempt).toHaveBeenCalledTimes(1)
  expect(onRetry).not.toHaveBeenCalled()
})

test('two 500s then success makes three calls, reporting each retry before its backoff', async () => {
  const attempt = scripted(serverError, serverError, success)

  const { pending, onRetry } = run(attempt)

  await vi.advanceTimersByTimeAsync(0)
  expect(onRetry.mock.calls).toEqual([[2]])
  expect(attempt).toHaveBeenCalledTimes(1)

  await vi.advanceTimersByTimeAsync(100)
  expect(onRetry.mock.calls).toEqual([[2], [3]])
  expect(attempt).toHaveBeenCalledTimes(2)

  await vi.advanceTimersByTimeAsync(200)
  expect(await pending).toEqual(success)
  expect(attempt).toHaveBeenCalledTimes(3)
})

test('four 500s makes four calls and returns the last 500', async () => {
  const attempt = scripted(serverError, serverError, serverError, serverError)

  const { pending, onRetry } = run(attempt)
  await vi.runAllTimersAsync()

  expect(await pending).toEqual(serverError)
  expect(attempt).toHaveBeenCalledTimes(4)
  expect(onRetry.mock.calls).toEqual([[2], [3], [4]])
})

test('a 404 makes one call and no retry', async () => {
  const notFound: Result<string> = { ok: false, failure: { kind: 'http', status: 404 } }
  const attempt = scripted(notFound)

  const { pending, onRetry } = run(attempt)

  expect(await pending).toEqual(notFound)
  expect(attempt).toHaveBeenCalledTimes(1)
  expect(onRetry).not.toHaveBeenCalled()
})

test('invalid makes one call and no retry', async () => {
  const invalid: Result<string> = { ok: false, failure: { kind: 'invalid' } }
  const attempt = scripted(invalid)

  const { pending, onRetry } = run(attempt)

  expect(await pending).toEqual(invalid)
  expect(attempt).toHaveBeenCalledTimes(1)
  expect(onRetry).not.toHaveBeenCalled()
})

test('a timeout then success is retried', async () => {
  const attempt = scripted({ ok: false, failure: { kind: 'timeout' } }, success)

  const { pending, onRetry } = run(attempt)
  await vi.runAllTimersAsync()

  expect(await pending).toEqual(success)
  expect(attempt).toHaveBeenCalledTimes(2)
  expect(onRetry.mock.calls).toEqual([[2]])
})

test.each([
  { random: 0, waits: [100, 200, 400] },
  // 199.9ms and so on: setTimeout truncates the delay to whole milliseconds, below each base.
  { random: 0.999, waits: [199, 399, 799] },
])('with random $random the backoffs before retries 1 to 3 end at $waits ms', async ({
  random,
  waits,
}) => {
  const attempt = scripted(serverError, serverError, serverError, serverError)

  const { pending } = run(attempt, () => random)
  await vi.advanceTimersByTimeAsync(0)

  for (const [index, wait] of waits.entries()) {
    expect(attempt).toHaveBeenCalledTimes(index + 1)
    await vi.advanceTimersByTimeAsync(wait - 1)
    expect(attempt).toHaveBeenCalledTimes(index + 1)
    await vi.advanceTimersByTimeAsync(1)
  }
  expect(attempt).toHaveBeenCalledTimes(4)
  expect(await pending).toEqual(serverError)
})

test('an abort during backoff resolves aborted at once and makes no further calls', async () => {
  const attempt = scripted(serverError, success)
  const caller = new AbortController()

  const { pending } = run(attempt, () => 0, caller.signal)
  await vi.advanceTimersByTimeAsync(0)
  caller.abort()

  expect(await pending).toEqual({ ok: false, failure: { kind: 'aborted' } })
  expect(attempt).toHaveBeenCalledTimes(1)
})

test('an abort before the backoff starts resolves aborted at once and makes no further calls', async () => {
  const caller = new AbortController()
  const attempt = vi.fn<(signal: AbortSignal) => Promise<Result<string>>>(() => {
    caller.abort()
    return Promise.resolve(serverError)
  })

  const { pending } = run(attempt, () => 0, caller.signal)

  expect(await pending).toEqual({ ok: false, failure: { kind: 'aborted' } })
  expect(attempt).toHaveBeenCalledTimes(1)
})
