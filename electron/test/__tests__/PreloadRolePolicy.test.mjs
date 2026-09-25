import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { filterPreloadApi, getPreloadRole } = require('../../../dist-electron/electron/PreloadRolePolicy.js');

const fixture = Object.fromEntries([
  'platform', 'getThemeMode', 'onThemeChanged', 'getStoredCredentials',
  'getCustomProviders', 'getCodexCliConfig', 'getAvailableOllamaModels',
  'forceRestartOllama', 'fetchProviderModels', 'getCurrentLlmConfig', 'onModelChanged',
  'setModel', 'getAnalyticsConsent', 'onAnalyticsConsentChanged', 'profileGetStatus',
  'licenseGetDetails', 'licenseCheckPremiumAsync', 'licenseCheckPremium', 'getTrialStatus',
  'getLocalTrial', 'onTrialEnded', 'onOpenSettingsTab', 'onMeetingsUpdated',
  'onOllamaPullProgress', 'onOllamaPullComplete', 'onIncompatibleProviderWarning',
  'onLicenseStatusChanged', 'cropperConfirmed', 'cropperCancelled', 'onResetCropper',
  'fileExists', 'testInjectTranscript', 'deleteScreenshot', 'openScreenshotFile',
  'analyzeImageFile', 'setGeminiApiKey', 'setKeybind', 'setProviderDataScopes',
  'interviewWorkspaceList', 'interviewWorkspaceGetById', 'interviewWorkspaceGetByMeeting',
  'profileGetStatus', 'profileGetProfile', 'profileUploadResume', 'profileSelectFile',
  'updateContentDimensionsCentered', 'ragQueryGlobal', 'startMeeting',
  'switchToGemini', 'getLogFilePath', 'openExternal',
].map((key) => [key, key]));

 test('role arguments fail closed and only accept known main-assigned roles', () => {
  assert.equal(getPreloadRole([]), undefined);
  assert.equal(getPreloadRole(['--answercue-window-role=unknown']), undefined);
  assert.equal(getPreloadRole(['--answercue-window-role=cropper']), 'cropper');
  assert.equal(getPreloadRole(['--answercue-window-role=launcher']), 'launcher');
  assert.equal(getPreloadRole([
    '--answercue-window-role=launcher', '--answercue-window-role=overlay',
  ]), undefined);
});

test('cropper receives exactly its three operation-specific methods', () => {
  assert.deepEqual(Object.keys(filterPreloadApi(fixture, 'cropper')).sort(), [
    'cropperCancelled', 'cropperConfirmed', 'onResetCropper',
  ]);
});

test('model selector receives its UI and shared initialization methods, not general IPC', () => {
  const exposed = filterPreloadApi(fixture, 'model-selector');
  assert.equal(exposed.getStoredCredentials, 'getStoredCredentials');
  assert.equal(exposed.setModel, 'setModel');
  assert.equal(exposed.getThemeMode, 'getThemeMode');
  assert.equal(exposed.startMeeting, undefined);
  assert.equal(exposed.cropperConfirmed, undefined);
  assert.equal(exposed.fileExists, undefined);
});

test('launcher exposes renderer-used methods but not unconsumed preload capabilities', () => {
  const exposed = filterPreloadApi(fixture, 'launcher');
  assert.equal(exposed.openExternal, 'openExternal');
  assert.equal(exposed.startMeeting, 'startMeeting');
  assert.equal(exposed.fileExists, 'fileExists');
  assert.equal(exposed.switchToGemini, undefined);
  assert.equal(exposed.getLogFilePath, undefined);
  assert.equal(exposed.testInjectTranscript, undefined);
});

test('settings excludes live meeting authority while preserving settings operations', () => {
  const exposed = filterPreloadApi(fixture, 'settings');
  for (const key of ['startMeeting', 'endMeeting', 'getRecentMeetings', 'generateWhatToSay', 'ragQueryGlobal',
    'interviewWorkspaceList', 'interviewWorkspaceGetById', 'interviewWorkspaceGetByMeeting', 'fileExists',
    'profileGetProfile', 'profileUploadResume', 'profileSelectFile']) {
    assert.equal(exposed[key], undefined, `${key} must not be exposed to settings`);
  }
  assert.equal(exposed.setGeminiApiKey, 'setGeminiApiKey');
  assert.equal(exposed.setKeybind, 'setKeybind');
  assert.equal(exposed.profileGetStatus, 'profileGetStatus');
});

test('overlay excludes settings mutations and general-purpose dangerous methods', () => {
  const exposed = filterPreloadApi(fixture, 'overlay');
  for (const key of ['setGeminiApiKey', 'setKeybind', 'setProviderDataScopes', 'fileExists',
    'testInjectTranscript', 'cropperConfirmed', 'profileGetProfile', 'profileUploadResume', 'profileSelectFile']) {
    assert.equal(exposed[key], undefined, `${key} must not be exposed to overlay`);
  }
  assert.equal(exposed.ragQueryGlobal, 'ragQueryGlobal');
  assert.equal(exposed.startMeeting, 'startMeeting');
  assert.equal(exposed.updateContentDimensionsCentered, 'updateContentDimensionsCentered');
});

test('the only exposed filesystem-existence check is bound to the configured credential path', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../ipcHandlers.ts'), 'utf8');
  const handler = source.match(/safeHandle\('file-exists',[\s\S]*?\n  \}\);/);
  assert.ok(handler);
  assert.match(handler[0], /getAllCredentials\(\)\.googleServiceAccountPath/);
  assert.match(handler[0], /filePath !== configuredPath/);
});

test('each BrowserWindow helper assigns its trusted preload role', () => {
  const rolesByFile = {
    'electron/WindowHelper.ts': ['launcher', 'overlay'],
    'electron/SettingsWindowHelper.ts': ['settings'],
    'electron/ModelSelectorWindowHelper.ts': ['model-selector'],
    'electron/CropperWindowHelper.ts': ['cropper'],
  };
  for (const [file, roles] of Object.entries(rolesByFile)) {
    const source = fs.readFileSync(path.resolve(__dirname, '../../../', file), 'utf8');
    for (const role of roles) {
      assert.ok(source.includes(`--answercue-window-role=${role}`), `${file} must assign ${role}`);
    }
  }
});

test('preload authority does not derive from URL search parameters', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../preload.ts'), 'utf8');
  assert.match(source, /getPreloadRole\(process\.argv\)/);
  assert.doesNotMatch(source, /location\.search|URLSearchParams/);
  assert.match(source, /if \(!preloadRole\)[\s\S]*renderer bridge disabled/);
});
