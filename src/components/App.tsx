import { useState } from 'react'
import { PAGE_SIZE } from '../constants.ts'
import type { User } from '../domain/types.ts'
import { useRowLogins } from '../hooks/useRowLogins.ts'
import { useUsers } from '../hooks/useUsers.ts'
import type { PageState } from '../state/pageReducer.ts'
import { Pagination } from './Pagination.tsx'
import { UsersTable } from './UsersTable.tsx'

export function App() {
  const { page, retry } = useUsers()

  return (
    <main>
      <h1>Users</h1>
      <PageContent page={page} onRetry={retry} />
    </main>
  )
}

function PageContent({ page, onRetry }: { page: PageState; onRetry: () => void }) {
  switch (page.kind) {
    case 'loading':
      return <p className="muted">Loading users…</p>
    case 'error':
      return (
        <p>
          Couldn't load users.{' '}
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        </p>
      )
    case 'loaded':
      return <LoadedUsers users={page.users} loadedAt={page.loadedAt} />
    default: {
      const unhandled: never = page
      return unhandled
    }
  }
}

function LoadedUsers({ users, loadedAt }: { users: readonly User[]; loadedAt: number }) {
  const [pageIndex, setPageIndex] = useState(0)
  const { rows, retry } = useRowLogins(pageIndex, users)
  const count = (
    <p>
      {users.length.toLocaleString()} {users.length === 1 ? 'user' : 'users'}
    </p>
  )

  if (users.length === 0) {
    return (
      <>
        {count}
        <p>No users to show.</p>
      </>
    )
  }

  const start = pageIndex * PAGE_SIZE
  return (
    <>
      {count}
      <Pagination
        pageIndex={pageIndex}
        pageCount={Math.ceil(users.length / PAGE_SIZE)}
        onPageChange={setPageIndex}
      />
      <UsersTable
        users={users.slice(start, start + PAGE_SIZE)}
        rows={rows}
        now={loadedAt}
        onRetry={retry}
      />
    </>
  )
}
