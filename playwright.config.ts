import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  // The system Edge (Chromium) avoids a browser download; switch to bundled Chromium with `npx playwright install chromium`.
  use: { baseURL: 'http://localhost:5199', trace: 'retain-on-failure', channel: 'msedge' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'msedge', viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'], channel: 'msedge', viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `node -e "require('fs').rmSync('.e2e-data',{recursive:true,force:true})" && npm run build && npx tsx server/index.ts`,
    url: 'http://localhost:5199/api/status',
    reuseExistingServer: false,
    timeout: 180_000,
    env: { PORT: '5199', DATA_DIR: '.e2e-data', MOCK: '1', RATE_PER_MIN: '1000' },
  },
});
