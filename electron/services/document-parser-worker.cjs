'use strict';

const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createRequire } = require('node:module');

// The Worker entrypoint must be a physical file outside app.asar, but its
// dependencies are packaged inside app.asar. Anchor module lookup at the
// virtual package root rather than app.asar.unpacked/node_modules.
const packageRoot = path.resolve(__dirname, '../../..')
  .replace(`${path.sep}app.asar.unpacked`, `${path.sep}app.asar`);
const packageRequire = createRequire(path.join(packageRoot, 'package.json'));

const MAX_MARKDOWN_BYTES = 1024 * 1024;
const MAX_DOCX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
const MAX_DOCX_ENTRIES = 10_000;
const MAX_PDF_PAGES = 200;

function normalizeMarkdown(input, fileName) {
  if (Buffer.byteLength(input, 'utf8') > MAX_MARKDOWN_BYTES) {
    throw new Error(`"${fileName}" extracts to more than the 1 MB text limit.`);
  }
  const normalized = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
  if (!normalized) throw new Error(`"${fileName}" parsed to empty text.`);
  return normalized;
}

function plainTextToMarkdown(input, fileName) {
  return normalizeMarkdown(input, fileName).split(/\n{2,}/).map(part => part.trim())
    .filter(Boolean).join('\n\n');
}

function configurePdfWorker(PDFParse) {
  if (typeof PDFParse?.setWorker !== 'function') return;
  const unpackedDir = __dirname.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
  const candidates = [
    path.join(unpackedDir, '..', 'pdf.worker.mjs'),
    path.join(__dirname, '..', 'pdf.worker.mjs'),
    path.join(process.cwd(), 'node_modules/pdf-parse/dist/pdf-parse/cjs/pdf.worker.mjs'),
  ];
  const workerPath = candidates.find(candidate => fs.existsSync(candidate));
  if (!workerPath) throw new Error('PDF parser worker module is unavailable.');
  PDFParse.setWorker(pathToFileURL(workerPath).href);
}

function validateDocxArchive(buffer, fileName) {
  const yauzl = packageRequire('yauzl');
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (openError, zipFile) => {
      if (openError || !zipFile) return reject(new Error(`"${fileName}" is not a valid DOCX archive.`));
      let entries = 0;
      let uncompressedBytes = 0;
      let settled = false;
      const fail = error => {
        if (settled) return;
        settled = true;
        zipFile.close();
        reject(error);
      };
      zipFile.on('error', () => fail(new Error(`"${fileName}" is not a valid DOCX archive.`)));
      zipFile.on('entry', entry => {
        entries++;
        uncompressedBytes += entry.uncompressedSize;
        if (entries > MAX_DOCX_ENTRIES || uncompressedBytes > MAX_DOCX_UNCOMPRESSED_BYTES) {
          return fail(new Error(`"${fileName}" exceeds DOCX archive limits.`));
        }
        zipFile.readEntry();
      });
      zipFile.on('end', () => { if (!settled) { settled = true; resolve(); } });
      zipFile.readEntry();
    });
  });
}

async function parse() {
  const { data, fileType, fileName } = workerData || {};
  if (!(data instanceof Uint8Array) || !['pdf', 'docx'].includes(fileType) || typeof fileName !== 'string' ||
      fileName.length > 255 || fileName !== path.basename(fileName)) {
    throw new Error('Invalid document parser input.');
  }
  const buffer = Buffer.from(data);
  let markdown;
  if (fileType === 'pdf') {
    const { PDFParse } = packageRequire('pdf-parse');
    configurePdfWorker(PDFParse);
    const parser = new PDFParse({ data: buffer });
    try {
      const info = await parser.getInfo();
      if (!Number.isInteger(info.total) || info.total > MAX_PDF_PAGES) {
        throw new Error(`"${fileName}" exceeds the 200-page PDF limit.`);
      }
      const pages = [];
      let extractedBytes = 0;
      for (let page = 1; page <= info.total; page++) {
        const result = await parser.getText({ partial: [page] });
        const text = result.text || '';
        extractedBytes += Buffer.byteLength(text, 'utf8');
        if (extractedBytes > MAX_MARKDOWN_BYTES) {
          throw new Error(`"${fileName}" extracts to more than the 1 MB text limit.`);
        }
        pages.push(text);
      }
      markdown = plainTextToMarkdown(pages.join('\n'), fileName);
    } finally {
      // Worker termination is the hard stop if destroy stalls.
      void parser.destroy().catch(() => undefined);
    }
  } else {
    await validateDocxArchive(buffer, fileName);
    const mammoth = packageRequire('mammoth');
    const result = await mammoth.convertToMarkdown({ buffer });
    markdown = normalizeMarkdown(result.value || '', fileName);
  }
  return { markdown, fileType, fileName, sizeBytes: buffer.length };
}

parse().then(result => parentPort.postMessage(result)).catch(() => {
  // Do not return parser/library errors or input content across the worker boundary.
  parentPort.postMessage({ error: 'Document parsing failed.' });
});
