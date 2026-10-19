import { render } from '@testing-library/react'
import { expect, test } from 'vitest'

// These two tests run in order: the second checks what the first left behind.
test('render mounts into the document body', () => {
  render(<p>rendered</p>)

  expect(document.body.innerHTML).toBe('<div><p>rendered</p></div>')
})

test('the previous test is unmounted before the next test runs', () => {
  expect(document.body.innerHTML).toBe('')
})
