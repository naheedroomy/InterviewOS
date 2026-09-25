import { before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const handlers = new Map();
const opened = [];

before(() => {
  const { registerExternalUrlHandler } = require(path.resolve(process.cwd(), 'dist-electron/electron/ipcHandlers.js'));
  registerExternalUrlHandler((channel, listener) => handlers.set(channel, listener), async (url) => {
    opened.push(url);
  });
});
beforeEach(() => { opened.length = 0; });

test('registered IPC opens exact canonical legal documents and Gmail', async () => {
  const invoke = handlers.get('open-external');
  const approved = [
    'https://github.com/naheedroomy/InterviewOS/blob/main/termsandcondition.md',
    'https://github.com/naheedroomy/InterviewOS/blob/main/PRIVACY.md',
    'https://mail.google.com/mail/',
  ];
  for (const url of approved) await invoke({}, url);
  assert.deepEqual(opened, approved);
});

test('registered IPC blocks malformed, lookalike, redirect, and arbitrary destinations without logging raw URL', async () => {
  const invoke = handlers.get('open-external');
  const blocked = [
    null,
    'not a url',
    'http://github.com/naheedroomy/InterviewOS/blob/main/PRIVACY.md',
    'https://github.com/naheedroomy/InterviewOS/blob/main/PRIVACY.md?redirect=https://evil.invalid',
    'https://github.com/naheedroomy/InterviewOS/blob/main/PRIVACY.md.evil',
    'https://github.com/attacker/InterviewOS/blob/main/PRIVACY.md',
    'https://mail.google.com/mail/attacker',
    'javascript:alert(1)',
  ];
  const warnings = [];
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    for (const url of blocked) await invoke({}, url);
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(opened, []);
  assert.equal(warnings.length, blocked.length);
  assert.doesNotMatch(JSON.stringify(warnings), /evil\.invalid|attacker/);
});
