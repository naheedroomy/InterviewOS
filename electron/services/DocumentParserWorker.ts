import { Worker } from 'worker_threads';
import * as fs from 'fs';
import * as path from 'path';

export interface ParsedDocumentWorkerResult {
  markdown: string;
  fileType: 'pdf' | 'docx';
  fileName: string;
  sizeBytes: number;
}

const PARSE_TIMEOUT_MS = 15_000;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_MARKDOWN_BYTES = 1024 * 1024;
const WORKER_MEMORY_MB = 256;
const WORKER_SCRIPT = path.join(__dirname, 'document-parser-worker.cjs');

function resolveWorkerScript(): string {
  const candidates = [
    WORKER_SCRIPT.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`),
    WORKER_SCRIPT,
  ];
  const script = candidates.find(candidate => fs.existsSync(candidate));
  if (!script) throw new Error('Document parser worker is unavailable.');
  return script;
}

function isWorkerResult(value: unknown, expected: ParsedDocumentWorkerResult): value is ParsedDocumentWorkerResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return result.fileName === expected.fileName && result.fileType === expected.fileType &&
    result.sizeBytes === expected.sizeBytes && typeof result.markdown === 'string' &&
    Buffer.byteLength(result.markdown, 'utf8') <= MAX_MARKDOWN_BYTES;
}

export function parseDocumentInWorker(
  buffer: Buffer,
  fileType: 'pdf' | 'docx',
  fileName: string,
  workerScriptPath = resolveWorkerScript(),
  timeoutMs = PARSE_TIMEOUT_MS,
): Promise<ParsedDocumentWorkerResult> {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_FILE_BYTES) {
    return Promise.reject(new Error('Invalid document parser input.'));
  }

  const expected: ParsedDocumentWorkerResult = { fileName, fileType, sizeBytes: buffer.length, markdown: '' };
  let worker: Worker;
  try {
    // Only bytes and a basename/type cross the boundary; never pass a filesystem path.
    worker = new Worker(workerScriptPath, {
      workerData: { data: buffer, fileType, fileName },
      resourceLimits: { maxOldGenerationSizeMb: WORKER_MEMORY_MB, maxYoungGenerationSizeMb: 48 },
    });
  } catch {
    return Promise.reject(new Error('Document parser worker could not be started.'));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      // terminate() is deliberately fire-and-forget: timeout handling must not await worker teardown.
      void worker.terminate().catch((): void => undefined);
      reject(new Error(`Document parse timed out after ${PARSE_TIMEOUT_MS}ms`));
    }, timeoutMs);
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate().catch((): void => undefined);
      reject(error);
    };
    worker.once('message', (message: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate().catch((): void => undefined);
      if (!isWorkerResult(message, expected)) {
        reject(new Error('Document parser worker returned an invalid response.'));
        return;
      }
      resolve(message);
    });
    worker.once('error', () => fail(new Error('Document parser worker failed.')));
    worker.once('exit', (code: number) => {
      if (!settled) fail(new Error(`Document parser worker exited unexpectedly (${code}).`));
    });
  });
}

