import type { User } from '../domain/types.ts'

export type PageState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'loaded'; users: User[]; loadedAt: number }

export type PageEvent =
  | { type: 'usersLoaded'; users: User[]; loadedAt: number }
  | { type: 'usersFailed' }
  | { type: 'retryRequested' }

export function pageReducer(state: PageState, event: PageEvent): PageState {
  switch (event.type) {
    case 'usersLoaded':
      return state.kind === 'loading'
        ? { kind: 'loaded', users: event.users, loadedAt: event.loadedAt }
        : state
    case 'usersFailed':
      return state.kind === 'loading' ? { kind: 'error' } : state
    case 'retryRequested':
      return state.kind === 'error' ? { kind: 'loading' } : state
    default: {
      const unhandled: never = event
      return unhandled
    }
  }
}
