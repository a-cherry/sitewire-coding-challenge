import type { User } from '../domain/types.ts'
import { rowState, type RowsState } from '../state/rowsReducer.ts'
import { UserRow } from './UserRow.tsx'

type UsersTableProps = {
  users: readonly User[]
  rows: RowsState
  now: number
  onRetry: (userId: number) => void
}

export function UsersTable({ users, rows, now, onRetry }: UsersTableProps) {
  return (
    <table>
      <thead>
        <tr>
          <th scope="col">ID</th>
          <th scope="col">Full name</th>
          <th scope="col">Email</th>
          <th scope="col">Last login</th>
          <th scope="col">IP</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <UserRow
            key={user.id}
            user={user}
            row={rowState(rows, user.id)}
            now={now}
            onRetry={() => onRetry(user.id)}
          />
        ))}
      </tbody>
    </table>
  )
}
