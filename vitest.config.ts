import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Tests run outside Electron, so they need the same aliases that
// electron.vite.config.ts defines for the app.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@': resolve(__dirname, 'src/renderer/src')
    }
  },
  test: {
    // UI tests ask for jsdom with `// @vitest-environment jsdom` at the top.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}']
  }
})
