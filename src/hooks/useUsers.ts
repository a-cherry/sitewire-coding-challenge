import { useEffect, useReducer } from 'react'
import { fetchUsers } from '../api/client.ts'
import { withRetry } from '../retry/retry.ts'
import { pageReducer } from '../state/pageReducer.ts'

export function useUsers() {
  const [page, dispatch] = useReducer(pageReducer, { kind: 'loading' })
  const loading = page.kind === 'loading'

  // Runs on mount and again whenever Try again returns the page to loading.
  useEffect(() => {
    if (!loading) {
      return
    }
    const controller = new AbortController()
    void withRetry(fetchUsers, {
      signal: controller.signal,
      random: Math.random,
      // /users retries aren't shown; the page stays on "Loading users…" until it settles.
      onRetry: () => {},
    }).then((result) => {
      if (result.ok) {
        dispatch({ type: 'usersLoaded', users: result.value, loadedAt: Date.now() })
      } else if (result.failure.kind !== 'aborted') {
        dispatch({ type: 'usersFailed' })
      }
    })
    return () => controller.abort()
  }, [loading])

  function retry() {
    dispatch({ type: 'retryRequested' })
  }

  return { page, retry }
}
