import { defineConfig } from '@playwright/test';
import path from 'node:path';

const artifactDir = process.env.PACKAGED_SMOKE_ARTIFACT_DIR;
if (!artifactDir) {
  throw new Error('Use scripts/run-packaged-smoke.mjs to set up the packaged smoke environment.');
}

export default defineConfig({
  testDir: '.',
  testMatch: 'packaged-boundary.spec.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: process.env.PLAYWRIGHT_HTML_OUTPUT_DIR ?? path.join(artifactDir, 'html-report'), open: 'never' }],
  ],
  outputDir: path.join(artifactDir, 'playwright-results'),
  use: {
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});
