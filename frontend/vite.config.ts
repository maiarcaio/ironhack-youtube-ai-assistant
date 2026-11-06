/// <reference types="vitest/config" />

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Keep Playwright browser specs out of Vitest's unit-test discovery.
  test: {
    exclude: [
      '**/node_modules/**',
      'e2e/**',
      'e2e-auth/**',
    ],
  },
})
