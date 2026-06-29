import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// testing-library does not auto-register cleanup under this repo's single
// vitest config, so unmounting between tests is done explicitly here. Keeps
// each test's render isolated (avoids duplicate DOM nodes across `it` blocks).
afterEach(() => cleanup())
