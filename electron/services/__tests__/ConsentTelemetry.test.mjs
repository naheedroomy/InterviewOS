import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const handlers = new Map();
const sends = [];
const telemetryCalls = [];
let settingsValues = {};
let persistFailure = null;
let persistCalls = [];

const settings = {
  get(key) {
    return settingsValues[key];
  },
  setAtomic(updates) {
    persistCalls.push(updates);
    if (persistFailure) throw persistFailure;
    settingsValues = { ...settingsValues, ...updates };
  },
};

before(() => {
  const { registerAnalyticsConsentHandlers } = require(
    path.resolve(process.cwd(), 'dist-electron/electron/ipcHandlers.js'),
  );
  registerAnalyticsConsentHandlers(
    (channel, listener) => handlers.set(channel, listener),
    {
      getSettings: () => settings,
      configureTelemetry: (config) => telemetryCalls.push(config),
      getWindows: () => [
        { isDestroyed: () => false, webContents: { send: (...args) => sends.push(args) } },
        { isDestroyed: () => true, webContents: { send: (...args) => sends.push(args) } },
      ],
    },
  );
});

function reset(settingsState = {}) {
  settingsValues = settingsState;
  persistFailure = null;
  persistCalls = [];
  sends.length = 0;
  telemetryCalls.length = 0;
}

test('get-analytics-consent normalizes malformed persisted state to unset without legal acceptance', async () => {
  reset({ analyticsConsent: 'enabled-by-legacy-bug', legalConsentVersion: '2026-09-01', legalConsentAt: 'not-a-date' });

  const result = await handlers.get('get-analytics-consent')({});

  assert.deepEqual(result, {
    consent: 'unset',
    legalAccepted: false,
    legalAcceptanceVersion: null,
    enabled: false,
    localTelemetryEnabled: false,
  });
});

test('a stored grant without valid legal acceptance is never enabled', async () => {
  reset({ analyticsConsent: 'granted', telemetryEnabled: true, legalConsentVersion: '2026-09-01', legalConsentAt: 'invalid' });

  assert.deepEqual(await handlers.get('get-analytics-consent')({}), {
    consent: 'unset', legalAccepted: false, legalAcceptanceVersion: null, enabled: false,
    localTelemetryEnabled: false,
  });
  assert.deepEqual(await handlers.get('set-analytics-consent')({}, 'granted'), {
    success: false, error: 'legal_acceptance_required',
  });
  assert.equal(persistCalls.length, 0);
  assert.equal(telemetryCalls.length, 0);
});

test('restart policy retains only marked local telemetry after legal reacceptance, never legacy opt-in', async () => {
  const { isLocalTelemetryEnabledAtStartup } = require(
    path.resolve(process.cwd(), 'dist-electron/electron/ipcHandlers.js'),
  );
  const accepted = {
    legalConsentVersion: '2026-09-01',
    legalConsentAt: '2026-09-01T12:00:00.000Z',
    analyticsConsent: 'denied',
    telemetryEnabled: true,
    localTelemetryConsent: true,
  };
  const get = (state) => ({ get: (key) => state[key] });

  assert.equal(isLocalTelemetryEnabledAtStartup(get(accepted)), true);
  assert.equal(isLocalTelemetryEnabledAtStartup(get({ ...accepted, localTelemetryConsent: false })), false);
  assert.equal(isLocalTelemetryEnabledAtStartup(get({ ...accepted, analyticsConsent: 'unset' })), false);
  assert.equal(isLocalTelemetryEnabledAtStartup(get({ ...accepted, legalConsentAt: 'invalid' })), false);
  assert.equal(isLocalTelemetryEnabledAtStartup(get({
    ...accepted,
    analyticsConsent: 'unset',
    localTelemetryConsent: undefined,
  })), false);
});

test('failed atomic persistence rejects before runtime telemetry configuration or renderer broadcast', async () => {
  reset();
  persistFailure = new Error('simulated atomic rename failure');

  await assert.rejects(
    handlers.get('set-analytics-consent')({}, 'denied'),
    /simulated atomic rename failure/,
  );

  assert.equal(telemetryCalls.length, 0);
  assert.equal(sends.length, 0);
});

test('fresh legal acceptance leaves local telemetry disabled without soliciting GA consent', async () => {
  reset();

  const result = await handlers.get('set-analytics-consent')({}, 'denied', { version: '2026-09-01' });

  assert.deepEqual(result, { success: true, consent: 'denied', enabled: false });
  assert.equal(settingsValues.analyticsConsent, 'denied');
  assert.equal(settingsValues.telemetryEnabled, false);
  assert.equal(settingsValues.localTelemetryConsent, false);
  assert.deepEqual(telemetryCalls, [{ enabled: false, localEnabled: true }]);
});

test('legal re-acceptance preserves an existing local telemetry grant while GA remains denied', async () => {
  reset({
    telemetryEnabled: true,
    analyticsConsent: 'granted',
    legalConsentVersion: '2026-09-01',
    legalConsentAt: '2026-09-01T12:00:00.000Z',
  });

  const result = await handlers.get('set-analytics-consent')({}, 'denied', { version: '2026-09-01' });

  assert.deepEqual(result, { success: true, consent: 'denied', enabled: false });
  assert.equal(settingsValues.analyticsConsent, 'denied');
  assert.equal(settingsValues.telemetryEnabled, true);
  assert.equal(settingsValues.localTelemetryConsent, true);
  assert.deepEqual(telemetryCalls, [{ enabled: true, localEnabled: true }]);
  assert.deepEqual(sends, [['analytics-consent-changed', 'denied']]);
});

test('legacy telemetry is not preserved by legal reacceptance without a prior explicit grant', async () => {
  reset({
    telemetryEnabled: true,
    analyticsConsent: 'denied',
    legalConsentVersion: '2026-09-01',
    legalConsentAt: '2026-09-01T12:00:00.000Z',
  });

  await handlers.get('set-analytics-consent')({}, 'denied', { version: '2026-09-01' });

  assert.equal(settingsValues.telemetryEnabled, false);
  assert.equal(settingsValues.localTelemetryConsent, false);
  assert.deepEqual(telemetryCalls, [{ enabled: false, localEnabled: true }]);
});

test('valid persisted consent configures telemetry and broadcasts only after persistence', async () => {
  reset();
  const order = [];
  const dependencies = {
    getSettings: () => ({
      get: (key) => settingsValues[key],
      setAtomic: (updates) => {
        order.push('persist');
        persistCalls.push(updates);
        settingsValues = { ...settingsValues, ...updates };
      },
    }),
    configureTelemetry: (config) => {
      order.push('configure');
      telemetryCalls.push(config);
    },
    getWindows: () => [{
      isDestroyed: () => false,
      webContents: { send: (...args) => { order.push('broadcast'); sends.push(args); } },
    }],
  };
  const { registerAnalyticsConsentHandlers } = require(path.resolve(process.cwd(), 'dist-electron/electron/ipcHandlers.js'));
  registerAnalyticsConsentHandlers((channel, listener) => handlers.set(channel, listener), dependencies);

  const result = await handlers.get('set-analytics-consent')({}, 'granted', { version: '2026-09-01' });
  assert.deepEqual(result, { success: true, consent: 'granted', enabled: true });
  assert.deepEqual(persistCalls, [{
    analyticsConsent: 'granted',
    telemetryEnabled: true,
    localTelemetryConsent: true,
    legalConsentVersion: '2026-09-01',
    legalConsentAt: settingsValues.legalConsentAt,
  }]);
  assert.match(settingsValues.legalConsentAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(telemetryCalls, [{ enabled: true, localEnabled: true }]);
  assert.deepEqual(sends, [['analytics-consent-changed', 'granted']]);
  assert.deepEqual(order, ['persist', 'configure', 'broadcast']);
});
