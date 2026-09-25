#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const testConfig = path.join(repoRoot, 'tests/e2e/packaged-boundary.config.ts');
const specPath = path.join(repoRoot, 'tests/e2e/packaged-boundary.spec.ts');
const cliPath = path.join(repoRoot, 'node_modules/@playwright/test/cli.js');

function usage() {
  console.log('Usage: node scripts/run-packaged-smoke.mjs [--app <path-to-InterviewOS.app>]');
  console.log('macOS only. Defaults to the host-architecture app under release/.');
}

function fail(message) {
  console.error(`[packaged-smoke] ERROR: ${message}`);
  process.exit(1);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  usage();
  process.exit(0);
}

if (process.platform !== 'darwin') {
  fail('packaged Electron smoke is supported only on macOS; refusing to skip.');
}

let appPath = process.env.PACKAGED_APP_PATH;
for (let index = 2; index < process.argv.length; index += 1) {
  if (process.argv[index] === '--app') {
    appPath = process.argv[++index];
    if (!appPath) fail('--app requires a path to InterviewOS.app.');
  } else {
    fail(`unknown argument: ${process.argv[index]}`);
  }
}

if (!appPath) {
  const archFolder = process.arch === 'arm64' ? 'mac-arm64' : 'mac';
  const defaultPath = path.join(repoRoot, 'release', archFolder, 'InterviewOS.app');
  if (existsSync(defaultPath)) {
    appPath = defaultPath;
  } else {
    const candidates = [
      path.join(repoRoot, 'release', archFolder, 'InterviewOS.app'),
      path.join(repoRoot, 'release', archFolder, 'AnswerCue.app'),
      path.join(repoRoot, 'release', 'mac-arm64', 'InterviewOS.app'),
      path.join(repoRoot, 'release', 'mac-arm64', 'AnswerCue.app'),
      path.join(repoRoot, 'release', 'mac', 'InterviewOS.app'),
      path.join(repoRoot, 'release', 'mac', 'AnswerCue.app'),
    ];
    appPath = candidates.find(candidate => existsSync(candidate)) ?? defaultPath;
  }
}

appPath = path.resolve(appPath);
if (!existsSync(appPath)) {
  fail(`packaged app not found at ${appPath}. Build it first; see the smoke prerequisites.`);
}
const appBundle = realpathSync(appPath);
let executablePath = path.join(appBundle, 'Contents/MacOS/InterviewOS');
if (!existsSync(executablePath)) {
  const altExecutable = path.join(appBundle, 'Contents/MacOS/AnswerCue');
  if (existsSync(altExecutable)) {
    executablePath = altExecutable;
  }
}
const asarPath = path.join(appBundle, 'Contents/Resources/app.asar');
for (const required of [executablePath, asarPath, testConfig, specPath, cliPath]) {
  if (!existsSync(required)) fail(`required packaged smoke input is missing: ${required}`);
}

const runId = new Date().toISOString().replaceAll(/[:.]/g, '-');
const artifactBase = path.resolve(
  process.env.PACKAGED_SMOKE_ARTIFACTS ?? path.join(repoRoot, 'test-results/packaged-smoke'),
);
const artifactDir = path.join(artifactBase, runId);
const homeDir = path.join(artifactDir, 'isolated-home');
const userDataDir = path.join(homeDir, 'Library/Application Support');
mkdirSync(userDataDir, { recursive: true });

console.log(`[packaged-smoke] App bundle: ${appBundle}`);
console.log(`[packaged-smoke] ASAR: ${asarPath}`);
console.log(`[packaged-smoke] Isolated HOME: ${homeDir}`);
console.log(`[packaged-smoke] Artifacts: ${artifactDir}`);

const result = spawnSync(
  process.execPath,
  [
    cliPath,
    'test',
    '--config', testConfig,
    '--reporter=list,html',
    '--output', path.join(artifactDir, 'playwright-results'),
    specPath,
  ],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
      PACKAGED_APP_PATH: appBundle,
      PACKAGED_APP_EXECUTABLE: executablePath,
      PACKAGED_USER_DATA_ROOT: userDataDir,
      PACKAGED_SMOKE_ARTIFACT_DIR: artifactDir,
      PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(artifactDir, 'html-report'),
      // Chromium background services are unnecessary for this local file:// smoke.
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
    },
  },
);

const summary = {
  appBundle,
  executablePath,
  asarPath,
  isolatedHome: homeDir,
  expectedUserDataRoot: userDataDir,
  artifactDir,
  exitCode: result.status,
  signal: result.signal,
};
mkdirSync(artifactDir, { recursive: true });
await import('node:fs/promises').then(({ writeFile }) =>
  writeFile(path.join(artifactDir, 'runner-summary.json'), `${JSON.stringify(summary, null, 2)}\n`),
);

if (result.error) fail(`could not start Playwright: ${result.error.message}`);
if (result.status !== 0) {
  console.error(`[packaged-smoke] Failed. Preserve evidence in ${artifactDir}`);
  process.exit(result.status ?? 1);
}
console.log(`[packaged-smoke] Passed. Report and evidence: ${artifactDir}`);
