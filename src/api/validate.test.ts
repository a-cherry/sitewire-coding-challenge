import { describe, expect, test } from 'vitest'
import { parseUserLogins, parseUsers } from './validate.ts'

describe('parseUsers', () => {
  test('a valid payload maps to users', () => {
    const json = [
      { id: 1, first_name: 'Orazio', last_name: 'Slipper', email: 'oslipper0@example.com' },
      { id: 2, first_name: 'Zsa zsa', last_name: "D'Angeli", email: 'zdangeli1@example.com' },
    ]

    expect(parseUsers(json)).toEqual({
      ok: true,
      value: [
        { id: 1, firstName: 'Orazio', lastName: 'Slipper', email: 'oslipper0@example.com' },
        { id: 2, firstName: 'Zsa zsa', lastName: "D'Angeli", email: 'zdangeli1@example.com' },
      ],
    })
  })

  test('a user with a numeric email is invalid', () => {
    const json = [{ id: 1, first_name: 'Orazio', last_name: 'Slipper', email: 42 }]

    expect(parseUsers(json)).toEqual({ ok: false })
  })

  test('duplicate user ids are invalid', () => {
    const json = [
      { id: 1, first_name: 'Orazio', last_name: 'Slipper', email: 'oslipper0@example.com' },
      { id: 1, first_name: 'Zsa zsa', last_name: "D'Angeli", email: 'zdangeli1@example.com' },
    ]

    expect(parseUsers(json)).toEqual({ ok: false })
  })

  test('an empty array is valid', () => {
    expect(parseUsers([])).toEqual({ ok: true, value: [] })
  })
})

describe('parseUserLogins', () => {
  test('valid logins map to logins in epoch milliseconds', () => {
    const json = {
      user_id: 7,
      logins: [
        { login_time: '2026-08-18T08:04:17.000Z', ip_v4: '61.129.200.209' },
        { login_time: '2026-07-01T00:00:00.000Z', ip_v4: '10.0.0.1' },
      ],
    }

    expect(parseUserLogins(json, 7)).toEqual({
      ok: true,
      value: [
        { loginTime: Date.UTC(2026, 7, 18, 8, 4, 17), ipV4: '61.129.200.209' },
        { loginTime: Date.UTC(2026, 6, 1, 0, 0, 0), ipV4: '10.0.0.1' },
      ],
    })
  })

  test('a user_id that differs from the requested id is invalid', () => {
    const json = {
      user_id: 5,
      logins: [{ login_time: '2026-08-18T08:04:17.000Z', ip_v4: '61.129.200.209' }],
    }

    expect(parseUserLogins(json, 7)).toEqual({ ok: false })
  })

  test('one entry with an unparseable login_time invalidates the response', () => {
    const json = {
      user_id: 7,
      logins: [
        { login_time: '2026-08-18T08:04:17.000Z', ip_v4: '61.129.200.209' },
        { login_time: 'not a date', ip_v4: '10.0.0.1' },
      ],
    }

    expect(parseUserLogins(json, 7)).toEqual({ ok: false })
  })

  test('missing logins is invalid', () => {
    expect(parseUserLogins({ user_id: 7 }, 7)).toEqual({ ok: false })
  })

  test('an empty logins array is valid', () => {
    expect(parseUserLogins({ user_id: 7, logins: [] }, 7)).toEqual({ ok: true, value: [] })
  })
})
