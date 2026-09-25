import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { InterviewDocumentCapabilities } = require(path.resolve(process.cwd(), 'dist-electron/electron/services/InterviewDocumentCapabilities.js'));
const { ingestMarkdownBuffer, assertBatchOutputLimit } = require(path.resolve(process.cwd(), 'dist-electron/electron/services/InterviewContextDocsManager.js'));
const { readSelectedDocument } = require(path.resolve(process.cwd(), 'dist-electron/electron/services/SelectedDocumentReader.js'));

test('capabilities are unpredictable, sender-bound, one-use, and reject forged paths', () => {
  const caps = new InterviewDocumentCapabilities();
  const issued = caps.issue(21, '/safe/selected.md', 'selected.md', 6, '.md');
  assert.match(issued.token, /^[a-f0-9]{64}$/);
  assert.equal(caps.consume('/etc/passwd', 21), null);
  assert.equal(caps.consume(issued.token, 22), null);
  assert.equal(caps.consume(issued.token, 21), null);
});

test('expired capabilities cannot be peeked or consumed', () => {
  let now = 1000;
  const caps = new InterviewDocumentCapabilities(50, () => now);
  const issued = caps.issue(7, '/safe/doc.txt', 'doc.txt', 4, '.txt');
  now = 1050;
  assert.equal(caps.peek(issued.token, 7), null);
  assert.equal(caps.consume(issued.token, 7), null);
});

test('valid native selection capability resolves to bounded content for main-process parsing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'interview-doc-cap-'));
  const selectedPath = path.join(dir, 'resume.md');
  const source = Buffer.from('# Selected resume\nExperience');
  fs.writeFileSync(selectedPath, source);
  try {
    const caps = new InterviewDocumentCapabilities();
    const issued = caps.issue(4, selectedPath, 'resume.md', source.length, '.md');
    const authorized = caps.consume(issued.token, 4);
    assert.ok(authorized);
    const parsed = await ingestMarkdownBuffer(authorized.name, fs.readFileSync(authorized.filePath));
    assert.equal(parsed.fileName, 'resume.md');
    assert.equal(parsed.markdown, '# Selected resume\nExperience');
    assert.equal(parsed.sizeBytes, source.length);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('selected-file reader rejects symlink and inode replacement races without following paths', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'interview-doc-race-'));
  const selectedPath = path.join(dir, 'selected.txt');
  const replacementPath = path.join(dir, 'replacement.txt');
  const original = Buffer.from('original');
  fs.writeFileSync(selectedPath, original);
  const stat = fs.lstatSync(selectedPath);
  const identity = { size: stat.size, ino: stat.ino, dev: stat.dev, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs };
  try {
    fs.renameSync(selectedPath, replacementPath);
    fs.symlinkSync(replacementPath, selectedPath);
    assert.throws(() => readSelectedDocument(selectedPath, identity));
    fs.unlinkSync(selectedPath);
    fs.writeFileSync(selectedPath, 'changed!');
    assert.throws(() => readSelectedDocument(selectedPath, identity), /changed|valid/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('extracted markdown and aggregate batch output are bounded', async () => {
  await assert.rejects(ingestMarkdownBuffer('large.txt', Buffer.from('x'.repeat(1024 * 1024 + 1))), /1 MB text limit/);
  assert.throws(() => assertBatchOutputLimit(5 * 1024 * 1024 + 1), /5 MB total text limit/);
  assert.doesNotThrow(() => assertBatchOutputLimit(5 * 1024 * 1024));
});

test('drag-and-drop byte content is parsed without a filesystem path', async () => {
  const bytes = new Uint8Array(Buffer.from('Drop-in notes\n\nSecond paragraph'));
  const parsed = await ingestMarkdownBuffer('dropped.txt', Buffer.from(bytes));
  assert.equal(parsed.fileName, 'dropped.txt');
  assert.equal(parsed.markdown, 'Drop-in notes\n\nSecond paragraph');
  assert.equal(parsed.sizeBytes, bytes.byteLength);
});

test('in-memory ingestion rejects unsupported extensions and oversized bytes', async () => {
  await assert.rejects(ingestMarkdownBuffer('payload.exe', Buffer.from('x')), /Unsupported file type/);
  await assert.rejects(ingestMarkdownBuffer('large.txt', Buffer.alloc(15 * 1024 * 1024 + 1)), /15 MB maximum/);
});

test('document IPC never exposes or accepts renderer filesystem paths and keeps direct picker upload', () => {
  const ipc = fs.readFileSync(path.resolve(process.cwd(), 'electron/ipcHandlers.ts'), 'utf8');
  const docsManager = fs.readFileSync(path.resolve(process.cwd(), 'electron/services/InterviewContextDocsManager.ts'), 'utf8');
  const parserWorker = fs.readFileSync(path.resolve(process.cwd(), 'electron/services/document-parser-worker.cjs'), 'utf8');
  const preload = fs.readFileSync(path.resolve(process.cwd(), 'electron/preload.ts'), 'utf8');
  const types = fs.readFileSync(path.resolve(process.cwd(), 'src/types/electron.d.ts'), 'utf8');
  const renderer = [
    fs.readFileSync(path.resolve(process.cwd(), 'src/components/KnowledgeBankView.tsx'), 'utf8'),
    fs.readFileSync(path.resolve(process.cwd(), 'src/components/Launcher.tsx'), 'utf8'),
  ].join('\n');
  assert.match(ipc, /return \{ token: capability\.token, name: capability\.name/);
  assert.doesNotMatch(ipc, /interview-docs:upload-from-path/);
  assert.match(ipc, /safeHandle\('interview-docs:upload',/);
  assert.doesNotMatch(preload + types, /getPathForFile|interviewDocsUploadFromPath/);
  assert.doesNotMatch(renderer, /getPathForFile|filePath: file\.path|\.path\)/);
  assert.match(ipc, /item\.data\.byteLength > MAX_INTERVIEW_DOCUMENT_BYTES/);
  assert.match(ipc, /items\.length > MAX_INTERVIEW_DOCUMENTS_PER_BATCH/);
  assert.match(ipc, /VALID_DOCUMENT_KINDS\.includes\(item\.contextKind\)/);
  assert.match(ipc, /item\.contextKind === 'other'.*contextDescription/);
  assert.match(ipc, /contextDescription\.length > 1000/);
  assert.match(ipc, /readSelectedDocument\(capability\.filePath, capability\)/);
  assert.doesNotMatch(ipc, /readFileSync\(capability\.filePath/);
  assert.match(ipc, /for \(const item of items\) \{\s*if \(typeof item\?\.token === 'string' && !interviewDocumentCapabilities\.peek\(item\.token, event\.sender\.id\)\) \{\s*pickerTokenRequiresReselection = true;/);
  assert.match(ipc, /requiresReselection: tokensConsumed \|\| pickerTokenRequiresReselection/);
  assert.match(ipc, /if \(!capability\) \{\s*pickerTokenRequiresReselection = true;/);
  assert.match(ipc, /code: error\?\.code \|\| 'UNKNOWN'/);
  assert.doesNotMatch(ipc, /errorMessage = error instanceof Error/);
  const docsHandlers = ipc.split("safeHandle('interview-docs:list'")[1].split('// ─── Interview Workspace')[0];
  assert.doesNotMatch(docsHandlers, /error\?\.message|error\.message/);
  assert.match(docsManager, /parseDocumentInWorker\(buffer, ext\.slice\(1\)/);
  assert.match(parserWorker, /parser\.getText\(\{ partial: \[page\] \}\)/);
  assert.match(parserWorker, /void parser\.destroy\(\)\.catch/);
  assert.match(renderer, /requiresReselection/);
  assert.match(renderer, /Selected files must be chosen again/);
});
