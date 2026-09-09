import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { sliceSafeHandleBlock } from './ipcTestUtils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('interview-docs mutation handlers broadcast interview-docs:changed to all windows', () => {
  const source = read('electron/ipcHandlers.ts');

  // Verify broadcast helper definition
  assert.match(source, /const broadcastInterviewDocsChanged = \(\) =>/);
  assert.match(source, /win\.webContents\.send\(['"]interview-docs:changed['"]\)/);

  // Verify batch-upload broadcasts
  const batchHandler = sliceSafeHandleBlock(source, 'interview-docs:batch-upload');
  assert.ok(batchHandler.length > 0, 'interview-docs:batch-upload handler must exist');
  assert.match(batchHandler, /broadcastInterviewDocsChanged\(\)/, 'batch-upload must invoke broadcastInterviewDocsChanged');

  // Verify delete broadcasts
  const deleteHandler = sliceSafeHandleBlock(source, 'interview-docs:delete');
  assert.ok(deleteHandler.length > 0, 'interview-docs:delete handler must exist');
  assert.match(deleteHandler, /broadcastInterviewDocsChanged\(\)/, 'delete must invoke broadcastInterviewDocsChanged');

  // Verify upload broadcasts
  const uploadHandler = sliceSafeHandleBlock(source, 'interview-docs:upload');
  assert.ok(uploadHandler.length > 0, 'interview-docs:upload handler must exist');
  assert.match(uploadHandler, /broadcastInterviewDocsChanged\(\)/, 'upload must invoke broadcastInterviewDocsChanged');

  // Verify upload-from-path broadcasts
  const pathHandler = sliceSafeHandleBlock(source, 'interview-docs:upload-from-path');
  assert.ok(pathHandler.length > 0, 'interview-docs:upload-from-path handler must exist');
  assert.match(pathHandler, /broadcastInterviewDocsChanged\(\)/, 'upload-from-path must invoke broadcastInterviewDocsChanged');

  // Verify update-metadata broadcasts
  const metaHandler = sliceSafeHandleBlock(source, 'interview-docs:update-metadata');
  assert.ok(metaHandler.length > 0, 'interview-docs:update-metadata handler must exist');
  assert.match(metaHandler, /broadcastInterviewDocsChanged\(\)/, 'update-metadata must invoke broadcastInterviewDocsChanged');
});

test('preload bridge exposes onInterviewDocsChanged listener', () => {
  const source = read('electron/preload.ts');
  assert.match(source, /onInterviewDocsChanged:\s*\(callback:\s*\(\)\s*=>\s*void\)/);
  assert.match(source, /['"]interview-docs:changed['"]/);
});

test('src/types/electron.d.ts defines onInterviewDocsChanged on ElectronAPI', () => {
  const source = read('src/types/electron.d.ts');
  assert.match(source, /onInterviewDocsChanged\?:\s*\(callback:\s*\(\)\s*=>\s*void\)\s*=>\s*\(\)\s*=>\s*void/);
});
