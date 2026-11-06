import { defineConfig } from '@playwright/test'

// These browser tests use the built-in mock adapter, never a real account.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    launchOptions: {
      executablePath: '/Users/caiomaia/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    },
  },
  webServer: {
    command: 'VITE_USE_MOCK_API=true npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
})
