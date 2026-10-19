import { useEffect, useEffectEvent, useReducer, useRef } from 'react'
import { fetchUserLogins } from '../api/client.ts'
import { PAGE_SIZE } from '../constants.ts'
import { latestLogin } from '../domain/latestLogin.ts'
import type { User } from '../domain/types.ts'
import { withRetry } from '../retry/retry.ts'
import { rowState, rowsReducer, type RowState } from '../state/rowsReducer.ts'

export function useRowLogins(pageIndex: number, users: readonly User[]) {
  const [rows, dispatch] = useReducer(rowsReducer, new Map<number, RowState>())
  const lastToken = useRef(0)
  // The current page's in-flight requests, so its cleanup can abort loads started by retry too.
  const pageRequests = useRef(new Set<AbortController>())

  function load(userId: number) {
    lastToken.current += 1
    const token = lastToken.current
    const controller = new AbortController()
    const requests = pageRequests.current
    requests.add(controller)
    dispatch({ type: 'loadStarted', userId, token })
    void withRetry((signal) => fetchUserLogins(userId, signal), {
      signal: controller.signal,
      random: Math.random,
      onRetry: (attempt) => dispatch({ type: 'attemptFailed', userId, token, attempt }),
    }).then((result) => {
      requests.delete(controller)
      if (!result.ok) {
        if (result.failure.kind !== 'aborted') {
          dispatch({ type: 'failed', userId, token })
        }
        return
      }
      const latest = latestLogin(result.value, Date.now())
      if (latest.kind === 'allFuture') {
        dispatch({ type: 'failed', userId, token })
      } else {
        dispatch({ type: 'succeeded', userId, token, result: latest })
      }
    })
  }

  // Reads rows without depending on them, so a row update doesn't re-run the
  // page effect and abort the page's requests.
  const loadMissing = useEffectEvent((userIds: readonly number[]) => {
    for (const userId of userIds) {
      const kind = rowState(rows, userId).kind
      if (kind === 'idle' || kind === 'unavailable') {
        load(userId)
      }
    }
  })

  useEffect(() => {
    const requests = new Set<AbortController>()
    pageRequests.current = requests
    const start = pageIndex * PAGE_SIZE
    loadMissing(users.slice(start, start + PAGE_SIZE).map((user) => user.id))
    return () => {
      for (const controller of requests) {
        controller.abort()
      }
      dispatch({ type: 'pageChanged' })
    }
  }, [pageIndex, users])

  function retry(userId: number) {
    if (rowState(rows, userId).kind === 'unavailable') {
      load(userId)
    }
  }

  return { rows, retry }
}
