export const API_BASE_URL = 'https://fake-users-api.vercel.app'

export const PAGE_SIZE = 25

export const REQUEST_TIMEOUT_MS = 4000
export const MAX_RETRIES = 3
// Index is retry number minus 1.
export const BACKOFF_BASE_MS = [200, 400, 800] as const

export const INACTIVE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000
export const FUTURE_LOGIN_TOLERANCE_MS = 5 * 60 * 1000
