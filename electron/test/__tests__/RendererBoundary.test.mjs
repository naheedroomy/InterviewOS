import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  installRendererNavigationGuards,
  isAllowedRendererNavigation,
} = require(path.resolve(process.cwd(), 'dist-electron/electron/RendererNavigationPolicy.js'));

const devAppUrl = 'http://localhost:5180';
const packagedAppUrl = 'file:///Applications/InterviewOS.app/Contents/Resources/app.asar/dist/index.html';

test('navigation policy allows dev localhost and exact packaged app document only', () => {
  assert.equal(isAllowedRendererNavigation('http://localhost:5180/?window=launcher', devAppUrl), true);
  assert.equal(isAllowedRendererNavigation('http://localhost:5181/', devAppUrl), false);
  assert.equal(isAllowedRendererNavigation('http://localhost:5180/other.html', devAppUrl), false);
  assert.equal(isAllowedRendererNavigation('http://localhost:5180/@fs/private.html', devAppUrl), false);
  assert.equal(isAllowedRendererNavigation('http://127.0.0.1:5180/', devAppUrl), false);
  assert.equal(isAllowedRendererNavigation('https://localhost:5180/', devAppUrl), false);
  assert.equal(isAllowedRendererNavigation('https://example.com/', devAppUrl), false);

  assert.equal(isAllowedRendererNavigation(`${packagedAppUrl}?window=overlay`, packagedAppUrl), true);
  assert.equal(isAllowedRendererNavigation('file:///Applications/InterviewOS.app/Contents/Resources/app.asar/evil.html', packagedAppUrl), false);
  assert.equal(isAllowedRendererNavigation('https://example.com/', packagedAppUrl), false);
  assert.equal(isAllowedRendererNavigation('not a URL', packagedAppUrl), false);
});

test('window-open and navigation are denied by default; only approved external links are delegated', async () => {
  const contents = new EventEmitter();
  let windowOpenHandler;
  contents.setWindowOpenHandler = (handler) => { windowOpenHandler = handler; };
  const opened = [];
  installRendererNavigationGuards(contents, devAppUrl, async (url) => opened.push(url));

  const localNavigation = { prevented: false, preventDefault() { this.prevented = true; } };
  contents.emit('will-navigate', localNavigation, 'http://localhost:5180/?window=settings');
  assert.equal(localNavigation.prevented, false);

  const remoteNavigation = { prevented: false, preventDefault() { this.prevented = true; } };
  contents.emit('will-navigate', remoteNavigation, 'https://github.com/naheedroomy/InterviewOS/blob/main/PRIVACY.md');
  assert.equal(remoteNavigation.prevented, true);

  assert.deepEqual(windowOpenHandler({ url: 'https://mail.google.com/mail/' }), { action: 'deny' });
  assert.deepEqual(windowOpenHandler({ url: 'https://evil.example/' }), { action: 'deny' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(opened, [
    'https://github.com/naheedroomy/InterviewOS/blob/main/PRIVACY.md',
    'https://mail.google.com/mail/',
  ]);
});

test('all five renderer window roles install navigation guards and launcher keeps web security enabled', () => {
  const electronRoot = path.resolve(process.cwd(), 'electron');
  const roles = [
    'WindowHelper.ts',
    'SettingsWindowHelper.ts',
    'ModelSelectorWindowHelper.ts',
    'CropperWindowHelper.ts',
  ];
  for (const filename of roles) {
    const source = fs.readFileSync(path.join(electronRoot, filename), 'utf8');
    assert.match(source, /installRendererNavigationGuards\(/, `${filename} must install renderer guards`);
  }

  const windowHelper = fs.readFileSync(path.join(electronRoot, 'WindowHelper.ts'), 'utf8');
  assert.equal((windowHelper.match(/installRendererNavigationGuards\(/g) ?? []).length, 2,
    'launcher and overlay each need guards');
  assert.doesNotMatch(windowHelper, /webSecurity\s*:\s*false|webSecurity\s*:\s*!isDev/);
});
