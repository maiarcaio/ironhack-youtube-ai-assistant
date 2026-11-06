import { defineConfig } from '@playwright/test'

// Backend-mode browser tests intercept Supabase. They never contact an account.
export default defineConfig({
  testDir: './e2e-auth',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    headless: true,
    launchOptions: {
      executablePath: '/Users/caiomaia/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    },
  },
  webServer: {
    command: 'VITE_USE_MOCK_API=false VITE_SUPABASE_URL=http://supabase.test VITE_SUPABASE_PUBLISHABLE_KEY=offline-public-key npm run dev -- --host 127.0.0.1 --port 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
  },
})
