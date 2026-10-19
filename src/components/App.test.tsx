import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { App } from './App.tsx'

test('renders the Users heading', () => {
  render(<App />)

  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Users$/)
})
