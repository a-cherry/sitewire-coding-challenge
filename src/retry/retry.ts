import type { Failure, Result } from '../api/client.ts'
import { BACKOFF_BASE_MS, MAX_RETRIES } from '../constants.ts'

type RetryOptions = {
  signal: AbortSignal
  random: () => number
  onRetry: (attemptNumber: number) => void
}

export async function withRetry<T>(
  attempt: (signal: AbortSignal) => Promise<Result<T>>,
  { signal, random, onRetry }: RetryOptions,
): Promise<Result<T>> {
  let result = await attempt(signal)
  for (const [index, base] of BACKOFF_BASE_MS.slice(0, MAX_RETRIES).entries()) {
    if (result.ok || !isRetryable(result.failure)) {
      return result
    }
    // Before the backoff, so "Retrying…" shows as soon as the attempt fails.
    onRetry(index + 2)
    const waited = await sleep(base / 2 + random() * (base / 2), signal)
    if (!waited) {
      return { ok: false, failure: { kind: 'aborted' } }
    }
    result = await attempt(signal)
  }
  return result
}

function isRetryable(failure: Failure): boolean {
  switch (failure.kind) {
    case 'http':
      return failure.status >= 500
    case 'network':
    case 'timeout':
      return true
    case 'invalid':
    case 'aborted':
      return false
    default: {
      const unreachable: never = failure
      return unreachable
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    // An already-aborted signal never fires 'abort', so check it first.
    if (signal.aborted) {
      resolve(false)
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      resolve(false)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve(true)
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
