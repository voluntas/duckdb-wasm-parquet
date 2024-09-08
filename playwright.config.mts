import { defineConfig, devices } from '@playwright/test'

// pnpm exec playwright test --ui

export default defineConfig({
  testDir: 'tests/playwright',
  // fullyParallel: true,
  reporter: 'html',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],
  webServer: {
    command: 'pnpm run dev --port 5173',
    url: 'http://localhost:5173/',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
