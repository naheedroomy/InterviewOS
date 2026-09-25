import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';

const appPath = process.env.PACKAGED_APP_PATH;
const executablePath = process.env.PACKAGED_APP_EXECUTABLE;
const expectedUserDataRoot = process.env.PACKAGED_USER_DATA_ROOT;
const artifactDir = process.env.PACKAGED_SMOKE_ARTIFACT_DIR;

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

test('packaged app starts with isolated data and reports permission state through preload IPC', async ({}, testInfo) => {
  expect(process.platform, 'packaged trust-boundary target').toBe('darwin');
  expect(appPath, 'runner must provide a packaged .app').toBeTruthy();
  expect(executablePath, 'runner must provide the inner Electron executable').toBeTruthy();
  expect(expectedUserDataRoot, 'runner must provide an isolated user-data root').toBeTruthy();
  expect(artifactDir, 'runner must provide an evidence directory').toBeTruthy();

  const launchOutput: string[] = [];
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  let page: Page | undefined;
  let traceStarted = false;
  const rendererErrors: string[] = [];
  const tracePath = path.join(artifactDir!, 'packaged-boundary-trace.zip');

  try {
    app = await electron.launch({
      executablePath: executablePath!,
      args: [
        `--user-data-dir=${expectedUserDataRoot}`,
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-sync',
        '--disable-gpu',
      ],
      env: {
        ...process.env,
        HOME: path.dirname(path.dirname(expectedUserDataRoot!)),
        USERPROFILE: path.dirname(path.dirname(expectedUserDataRoot!)),
        INTERVIEWOS_DISABLE_SAFE_STORAGE: '1',
      },
      timeout: 45_000,
    });
    app.process().stdout?.on('data', chunk => launchOutput.push(String(chunk)));
    app.process().stderr?.on('data', chunk => launchOutput.push(String(chunk)));

    await expect.poll(() => {
      page = app!.windows().find(candidate => {
        try {
          const windowName = new URL(candidate.url()).searchParams.get('window');
          return windowName === null || windowName === 'launcher';
        } catch {
          return false;
        }
      });
      return Boolean(page);
    }, { timeout: 45_000, message: 'main launcher renderer should be created during packaged startup' }).toBe(true);
    page!.on('pageerror', error => rendererErrors.push(error.stack ?? error.message));
    await app.context().tracing.start({ screenshots: true, snapshots: true, sources: true });
    traceStarted = true;

    await page.waitForLoadState('domcontentloaded');
    await expect.poll(() => page!.url(), { message: 'packaged UI should load from its local file bundle' })
      .toMatch(/^file:/);

    const runtime = await app.evaluate(({ app: electronApp }) => ({
      isPackaged: electronApp.isPackaged,
      userData: electronApp.getPath('userData'),
    }));
    expect(runtime.isPackaged, 'smoke must launch the packaged application, not development Electron').toBe(true);
    expect(
      isInside(expectedUserDataRoot!, runtime.userData),
      `Electron userData escaped the isolated root: ${runtime.userData}`,
    ).toBe(true);
    const bridge = await page.evaluate(() => {
      const api = (window as Window & { electronAPI?: Record<string, unknown> }).electronAPI;
      return {
        checkPermissions: typeof api?.checkPermissions,
        requestMicPermission: typeof api?.requestMicPermission,
        onSystemAudioPermissionDenied: typeof api?.onSystemAudioPermissionDenied,
      };
    });
    expect(bridge.checkPermissions, `permission status must be available through the real preload (${page.url()}; ${JSON.stringify(bridge)})`).toBe('function');
    expect(bridge.requestMicPermission, `permission failure result must be available through the real preload (${JSON.stringify(bridge)})`).toBe('function');
    expect(bridge.onSystemAudioPermissionDenied, `permission-denied reporting event must be available through the real preload (${JSON.stringify(bridge)})`).toBe('function');

    const permissions = await page.evaluate(async () => {
      const api = (window as Window & { electronAPI: { checkPermissions: () => Promise<Record<string, string>> } }).electronAPI;
      return api.checkPermissions();
    });
    expect(permissions.platform).toBe('darwin');
    for (const capability of ['microphone', 'screen', 'accessibility']) {
      expect(
        ['granted', 'denied', 'not-determined', 'restricted', 'unknown'],
        `Unexpected macOS ${capability} permission state: ${permissions[capability]}`,
      ).toContain(permissions[capability]);
    }

    await page.evaluate(() => {
      const api = (window as Window & {
        electronAPI: { onSystemAudioPermissionDenied: (callback: (message: string) => void) => () => void };
      }).electronAPI;
      api.onSystemAudioPermissionDenied(message => {
        const reports = ((window as Window & { __packagedSmokePermissionReports?: string[] }).__packagedSmokePermissionReports ??= []);
        reports.push(message);
      });
    });

    // Never request microphone access unless macOS already reports it denied:
    // a not-determined status could open a real TCC prompt on the developer's desktop.
    if (permissions.microphone === 'denied') {
      const requestResult = await page.evaluate(async () => {
        const api = (window as Window & { electronAPI: { requestMicPermission: () => Promise<boolean> } }).electronAPI;
        return api.requestMicPermission();
      });
      expect(requestResult, 'already-denied microphone permission should report failure without capture').toBe(false);
    }

    await page.waitForTimeout(300);
    expect(rendererErrors, `Renderer startup errors: ${rendererErrors.join('\n')}`).toEqual([]);
  } catch (error) {
    if (page && artifactDir) {
      await mkdir(artifactDir, { recursive: true });
      await page.screenshot({ path: path.join(artifactDir, 'packaged-boundary-failure.png'), fullPage: true }).catch(() => undefined);
    }
    if (traceStarted && app) {
      await app.context().tracing.stop({ path: tracePath }).catch(() => undefined);
      traceStarted = false;
    }
    await testInfo.attach('electron-launch-output.txt', {
      body: Buffer.from(launchOutput.join('')),
      contentType: 'text/plain',
    });
    const permissionReports = page
      ? await page.evaluate(() => (window as Window & { __packagedSmokePermissionReports?: string[] }).__packagedSmokePermissionReports ?? []).catch(() => [])
      : [];
    await testInfo.attach('permission-events.json', {
      body: Buffer.from(JSON.stringify(permissionReports, null, 2)),
      contentType: 'application/json',
    });
    throw error;
  } finally {
    if (traceStarted && app) {
      await app.context().tracing.stop().catch(() => undefined);
    }
    await app?.close().catch(() => undefined);
  }
});
