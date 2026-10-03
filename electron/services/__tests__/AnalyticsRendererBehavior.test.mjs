import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { transformSync } from 'esbuild';

const require = createRequire(import.meta.url);
const sourcePath = path.resolve(process.cwd(), 'src/lib/analytics/analytics.service.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = transformSync(source, {
  loader: 'ts',
  format: 'cjs',
  target: 'es2022',
  define: { 'import.meta.env.DEV': 'false' },
}).code;
const analyticsModule = new Module(sourcePath);
analyticsModule.filename = sourcePath;
analyticsModule.paths = Module._nodeModulePaths(path.dirname(sourcePath));
analyticsModule._compile(compiled, sourcePath);
const { AnalyticsService, detectProviderType } = analyticsModule.exports;

let scripts;
let networkCalls;
let events;

test('analytics API remains callable but never creates runtime state or sends events', async () => {
  scripts = [];
  networkCalls = [];
  events = [];
  Object.assign(globalThis, {
    window: {
      electronAPI: {
        getAnalyticsConsent: async () => ({ enabled: true }),
        getAppVersion: async () => '3.2.0',
      },
      gtag: (...args) => events.push(args),
      dataLayer: [],
    },
    document: {
      createElement: (...args) => {
        scripts.push(args);
        return { async: false, src: '', onerror: null };
      },
      head: { appendChild: (script) => scripts.push(script) },
    },
    fetch: (...args) => networkCalls.push(args),
  });
  const analytics = new AnalyticsService();

  await analytics.initAnalytics();
  analytics.trackAppOpen();
  analytics.trackAssistantStart();
  analytics.trackAssistantStop();
  analytics.trackModeSelected('launcher');
  analytics.trackModelUsed({ model_name: 'gpt', provider: 'openai', provider_type: 'cloud', latency_ms: 12 });
  analytics.trackCopyAnswer();
  analytics.trackCommandExecuted('test');
  analytics.trackConversationStarted();
  analytics.trackCalendarConnected();
  analytics.trackMeetingStarted();
  analytics.trackMeetingEnded();
  analytics.trackPdfExported();
  analytics.trackAppClose();
  analytics.handleConsentChanged('granted');
  await analytics.initAnalytics();

  assert.deepEqual(scripts, [], 'no executable script is created or appended');
  assert.deepEqual(networkCalls, [], 'no network request is made');
  assert.deepEqual(events, [], 'no gtag event is emitted');
  assert.deepEqual(window.dataLayer, [], 'no event is queued');
});

test('renderer policy removes remote analytics sources and keeps theme setup self-hosted', () => {
  const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
  const themeScript = fs.readFileSync(path.resolve(process.cwd(), 'public/theme-init.js'), 'utf8');
  const csp = html.match(/Content-Security-Policy[\s\S]*?content="([^"]+)"/i)?.[1];

  assert.ok(csp, 'CSP meta policy exists');
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
  assert.doesNotMatch(csp, /google-analytics|googletagmanager/);
  assert.match(html, /<script src="\/theme-init\.js"><\/script>/);
  assert.doesNotMatch(html, /<script>([\s\S]*?)<\/script>/i);
  assert.match(themeScript, /localStorage\.getItem\('natively_resolved_theme'\)/);
  assert.doesNotMatch(source, /googletagmanager|google-analytics|gtag\(['"]event/);
});

test('provider identity classification does not infer local execution from a model-shaped name', () => {
  assert.equal(detectProviderType('ollama'), 'local');
  assert.equal(detectProviderType('codex-cli'), 'local');
  assert.equal(detectProviderType('openai', true), 'local');
  assert.equal(detectProviderType('llama-cloud-proxy'), 'cloud');
});
