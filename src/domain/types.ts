export type User = {
  id: number
  firstName: string
  lastName: string
  email: string
}

export type Login = {
  // Epoch milliseconds.
  loginTime: number
  ipV4: string
}

export type LatestLoginResult =
  | { kind: 'latest'; login: Login }
  | { kind: 'none' }
  | { kind: 'allFuture' }
