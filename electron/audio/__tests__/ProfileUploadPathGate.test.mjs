import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ipcHandlersPath = path.resolve(__dirname, '../../../electron/ipcHandlers.ts');
const ipcSource = readFileSync(ipcHandlersPath, 'utf8');
const preloadSource = readFileSync(path.resolve(__dirname, '../../../electron/preload.ts'), 'utf8');
const uiSource = readFileSync(path.resolve(__dirname, '../../../src/components/ProfileIntelligenceSettings.tsx'), 'utf8');

function extractHandler(channel) {
  const start = ipcSource.indexOf(`safeHandle('${channel}'`);
  assert.ok(start >= 0, `could not locate ${channel}`);
  let i = ipcSource.indexOf('{', start);
  let depth = 1;
  const bodyStart = i + 1;
  i++;
  while (i < ipcSource.length && depth > 0) {
    const ch = ipcSource[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  assert.equal(depth, 0, `unbalanced braces while extracting ${channel}`);
  return ipcSource.slice(bodyStart, i - 1);
}

test('profile picker returns only an opaque, sender-bound capability', () => {
  const body = extractHandler('profile:select-file');
  assert.match(ipcSource, /crypto\.randomBytes\(32\)\.toString\(['"]hex['"]\)/, 'token must have cryptographic unpredictability');
  assert.match(ipcSource, /profilePickTokens\.set\(token,\s*\{\s*senderId,\s*filePath:/, 'capability must bind token to the requesting sender');
  assert.match(ipcSource, /PROFILE_PICK_TOKEN_TTL_MS\s*=\s*60_000/);
  assert.match(body, /issueProfilePickToken\(event\.sender\.id,\s*selected\)/);
  assert.match(body, /return\s+\{\s*success:\s*true,\s*token,\s*displayName:\s*path\.basename\(selected\)\s*\}/);
  assert.doesNotMatch(body, /filePath\s*:/, 'renderer result must not expose selected path');
});

test('profile uploads reject forged paths and ingest only a verified private snapshot', () => {
  const consumerStart = ipcSource.indexOf('const consumeProfilePickToken');
  const consumer = ipcSource.slice(consumerStart, ipcSource.indexOf('\n  };', consumerStart));
  assert.match(consumer, /typeof token !== 'string'/, 'non-token strings such as forged paths must fail');
  assert.match(consumer, /profilePickTokens\.delete\(token\)/, 'capability is single-use, including failed attempts');
  assert.match(consumer, /capability\.senderId !== senderId/, 'token from another sender must fail');
  assert.match(consumer, /Date\.now\(\) >= capability\.expiresAt/, 'expired token must fail');

  for (const channel of ['profile:upload-resume', 'profile:upload-jd']) {
    const body = extractHandler(channel);
    assert.match(body, /consumeProfilePickToken\(token,\s*event\.sender\.id\)/, `${channel} must bind capability to IPC sender`);
    assert.match(body, /withProfileSnapshot(?:<[^>]+>)?\(capability, stagedPath => orchestrator\.ingestDocument\(stagedPath,/, `${channel} must ingest only a private snapshot of the selected inode`);
    assert.match(body, /Unable to upload file\. Please select it again\./, `${channel} errors must be generic`);
  }
});

test('profile token validates regular file, extension, size, no-follow open and file identity', () => {
  assert.match(ipcSource, /PROFILE_ALLOWED_EXTENSIONS\s*=\s*new Set\(\[['"]\.pdf['"],\s*['"]\.docx['"],\s*['"]\.txt['"]\]\)/);
  assert.match(ipcSource, /PROFILE_MAX_FILE_BYTES\s*=\s*15 \* 1024 \* 1024/);
  assert.match(ipcSource, /fs\.lstatSync\(filePath\)/);
  assert.match(ipcSource, /fs\.constants\.O_NOFOLLOW/);
  assert.match(ipcSource, /fs\.fstatSync\(fd\)/);
  assert.match(ipcSource, /opened\.dev !== before\.dev \|\| opened\.ino !== before\.ino/);
  assert.match(ipcSource, /readSelectedDocument\(capability\.filePath, capability\)/, 'snapshot must validate original picker inode on its open descriptor');
  assert.match(ipcSource, /fs\.mkdtempSync\(path\.join\(app\.getPath\('userData'\), 'profile-upload-'\)\)/);
  assert.match(ipcSource, /fs\.writeFileSync\(stagedPath, bytes, \{ flag: 'wx', mode: 0o600 \}\)/);
  assert.match(ipcSource, /fs\.rmSync\(temporaryDir, \{ recursive: true, force: true \}\)/);
  assert.match(ipcSource, /sweepExpiredProfileTokens\(Date\.now\(\)\)/);
});

test('preload and profile UI pass capability tokens, never paths', () => {
  assert.match(preloadSource, /profileUploadResume: \(token: string\) => ipcRenderer\.invoke\('profile:upload-resume', token\)/);
  assert.match(preloadSource, /profileUploadJD: \(token: string\) => ipcRenderer\.invoke\('profile:upload-jd', token\)/);
  assert.match(uiSource, /profileUploadResume\?\.\(fileResult\.token\)/);
  assert.match(uiSource, /profileUploadJD\?\.\(fileResult\.token\)/);
  assert.doesNotMatch(uiSource, /fileResult\.filePath/);
});
