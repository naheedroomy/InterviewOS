import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { parseDocumentInWorker } = require(path.resolve(process.cwd(), 'dist-electron/electron/services/DocumentParserWorker.js'));
const { ingestMarkdownBuffer } = require(path.resolve(process.cwd(), 'dist-electron/electron/services/InterviewContextDocsManager.js'));

function makePdf() {
  const { jsPDF } = require('jspdf');
  const pdf = new jsPDF();
  pdf.text('Parser worker PDF fixture', 20, 20);
  return Buffer.from(pdf.output('arraybuffer'));
}

test('valid PDF is parsed in a worker and returns normalized bounded fields', async () => {
  const result = await ingestMarkdownBuffer('resume.pdf', makePdf());
  assert.equal(result.fileName, 'resume.pdf');
  assert.equal(result.fileType, 'pdf');
  assert.match(result.markdown, /Parser worker PDF fixture/);
  assert.ok(result.markdown.length > 0);
  assert.ok(result.sizeBytes > 0);
});

test('valid DOCX is parsed in the isolated worker', async () => {
  const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/parser-worker-valid.docx'));
  const result = await ingestMarkdownBuffer('resume.docx', fixture);
  assert.equal(result.fileType, 'docx');
  assert.match(result.markdown, /Parser worker DOCX fixture/);
  assert.equal(result.sizeBytes, fixture.length);
});

test('malformed PDF and DOCX fail safely', async () => {
  await assert.rejects(ingestMarkdownBuffer('broken.pdf', Buffer.from('%PDF-1.7\nnot a pdf')), /worker|parse|PDF/i);
  await assert.rejects(ingestMarkdownBuffer('broken.docx', Buffer.from('not a zip archive')), /worker|parse|DOCX/i);
});

test('non-responding parser worker is terminated at the deadline', async () => {
  const fixturePath = path.join(__dirname, 'document-parser-never-responds.cjs');
  const before = Date.now();
  await assert.rejects(
    parseDocumentInWorker(Buffer.from('bytes'), 'docx', 'fixture.docx', fixturePath, 100),
    /timed out after 15000ms/,
  );
  assert.ok(Date.now() - before < 2000, 'test deadline override should not wait for the production timeout');
});

test('worker rejects an unexpected response and tears it down', async () => {
  const fixture = path.join(__dirname, 'document-parser-invalid-response.cjs');
  await assert.rejects(parseDocumentInWorker(Buffer.from('x'), 'pdf', 'x.pdf', fixture), /invalid response/);
  assert.ok(fs.existsSync(fixture));
});
