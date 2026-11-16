import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 40_000,
  workers: 2,
  use: { baseURL: process.env.POLYMAP_TEST_URL || 'http://127.0.0.1:8080', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'],
      launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } } },
    { name: 'chromium-android', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium',
      launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } } },
    { name: 'webkit-iphone', use: { ...devices['iPhone 14'], defaultBrowserType: 'webkit' } },
  ],
});
