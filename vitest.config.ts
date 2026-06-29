import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    server: {
      deps: {
        external: [/^node:/],
      },
    },
  },
  // vite 5.4 ships a builtin-modules list (from an older Node) that omits
  // node:sqlite, so vitest tries to resolve it as a file and fails with
  // "Failed to load url sqlite". Intercept the id and emit a tiny ESM shim
  // that pulls the real native module via createRequire at runtime.
  plugins: [
    {
      name: 'node-sqlite-loader',
      enforce: 'pre',
      resolveId(id) {
        if (id === 'node:sqlite' || id === 'sqlite') return '\0node:sqlite'
        return null
      },
      load(id) {
        if (id === '\0node:sqlite') {
          return [
            "import { createRequire } from 'node:module'",
            "const require = createRequire(import.meta.url)",
            "const m = require('node:sqlite')",
            'export const DatabaseSync = m.DatabaseSync',
            'export const StatementSync = m.StatementSync',
            'export default m',
          ].join('\n')
        }
        return null
      },
    },
  ],
})
