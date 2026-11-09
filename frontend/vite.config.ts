/// <reference types="vitest/config" />

import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Keep Playwright browser specs out of Vitest's unit-test discovery.
  test: {
    // Unit tests exercise the deterministic demo adapter explicitly.
    env: {
      VITE_USE_MOCK_API: 'true',
    },
    exclude: [
      '**/node_modules/**',
      'e2e/**',
      'e2e-auth/**',
    ],
  },
})
