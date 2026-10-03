import { app } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { readSelectedDocument } from './SelectedDocumentReader';
import { parseDocumentInWorker } from './DocumentParserWorker';

export type InterviewContextDocumentKind =
  | 'resume'
  | 'job_description'
  | 'cover_letter'
  | 'prep_kit'
  | 'project'
  | 'notes'
  | 'other';

export const VALID_DOCUMENT_KINDS: readonly InterviewContextDocumentKind[] = [
  'resume',
  'job_description',
  'cover_letter',
  'prep_kit',
  'project',
  'notes',
  'other',
] as const;

export interface InterviewContextDocument {
  id: string;
  name: string;
  fileType: 'md' | 'txt' | 'pdf' | 'docx';
  markdown: string;
  contextKind?: InterviewContextDocumentKind;
  contextDescription?: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface IngestedMarkdownDocument {
  fileName: string;
  fileType: InterviewContextDocument['fileType'];
  markdown: string;
  sizeBytes: number;
}

const ALLOWED_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.pdf', '.docx']);
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_EXTRACTED_MARKDOWN_BYTES = 1024 * 1024;
const MAX_BATCH_EXTRACTED_BYTES = 5 * 1024 * 1024;

function decodeTextFile(buffer: Buffer, fileName: string, ext: string): string {
  if (buffer.length === 0) {
    throw new Error(`"${fileName}" is empty.`);
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le');
  }

  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(buffer.length - 2);
    for (let i = 2; i + 1 < buffer.length; i += 2) {
      swapped[i - 2] = buffer[i + 1];
      swapped[i - 1] = buffer[i];
    }
    return swapped.toString('utf16le');
  }

  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8');
  }

  const sniffWindow = buffer.subarray(0, Math.min(2048, buffer.length));
  if (sniffWindow.includes(0)) {
    throw new Error(`"${fileName}" looks like a binary file even though its extension is ${ext}.`);
  }

  return buffer.toString('utf8');
}

export function assertBatchOutputLimit(totalBytes: number): void {
  if (totalBytes > MAX_BATCH_EXTRACTED_BYTES) throw new Error('Batch extracts to more than the 5 MB total text limit.');
}

function normalizeMarkdown(input: string, fileName: string): string {
  if (Buffer.byteLength(input, 'utf8') > MAX_EXTRACTED_MARKDOWN_BYTES) {
    throw new Error(`"${fileName}" extracts to more than the 1 MB text limit.`);
  }
  const normalized = input
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();

  if (!normalized) {
    throw new Error(`"${fileName}" parsed to empty text.`);
  }

  return normalized;
}

function plainTextToMarkdown(input: string, fileName: string): string {
  const body = normalizeMarkdown(input, fileName)
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)
    .join('\n\n');
  return body;
}

function extensionToFileType(ext: string): InterviewContextDocument['fileType'] {
  if (ext === '.markdown') return 'md';
  return ext.replace('.', '') as InterviewContextDocument['fileType'];
}

function normalizeDocumentMetadata(contextKind?: InterviewContextDocumentKind, contextDescription?: string) {
  if (contextKind !== undefined && !VALID_DOCUMENT_KINDS.includes(contextKind)) {
    throw new Error('Unsupported document type.');
  }
  const description = typeof contextDescription === 'string' ? contextDescription.trim().slice(0, 500) : '';
  if (contextKind === 'other' && !description) throw new Error('Please describe what this document is.');
  return { contextKind, contextDescription: description || undefined };
}

export class InterviewContextDocsManager {
  private static instance: InterviewContextDocsManager;
  private readonly docsPath: string;

  private constructor() {
    const dir = path.join(app.getPath('userData'), 'interview-context');
    fs.mkdirSync(dir, { recursive: true });
    this.docsPath = path.join(dir, 'documents.json');
  }

  public static getInstance(): InterviewContextDocsManager {
    if (!InterviewContextDocsManager.instance) {
      InterviewContextDocsManager.instance = new InterviewContextDocsManager();
    }
    return InterviewContextDocsManager.instance;
  }

  public listDocuments(): InterviewContextDocument[] {
    try {
      if (!fs.existsSync(this.docsPath)) return [];
      const parsed = JSON.parse(fs.readFileSync(this.docsPath, 'utf8'));
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(doc => doc && typeof doc.id === 'string' && typeof doc.markdown === 'string')
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    } catch (error) {
      console.error('[InterviewContextDocsManager] failed to list documents:', error);
      return [];
    }
  }

  public deleteDocument(id: string): boolean {
    const docs = this.listDocuments();
    const next = docs.filter(doc => doc.id !== id);
    if (next.length === docs.length) return false;
    this.saveDocuments(next);
    return true;
  }

  public updateDocumentMetadata(
    id: string,
    metadata: { contextKind?: InterviewContextDocumentKind; contextDescription?: string },
  ): InterviewContextDocument | null {
    const docs = this.listDocuments();
    const index = docs.findIndex(doc => doc.id === id);
    if (index < 0) return null;

    const contextKind = metadata.contextKind;
    if (contextKind && !VALID_DOCUMENT_KINDS.includes(contextKind)) {
      throw new Error('Unsupported document type.');
    }

    const contextDescription = String(metadata.contextDescription || '').trim();
    if (contextKind === 'other' && !contextDescription) {
      throw new Error('Please describe what this document is.');
    }

    const nextDoc: InterviewContextDocument = {
      ...docs[index],
      contextKind,
      contextDescription: contextKind === 'other' ? contextDescription : contextDescription || undefined,
      updatedAt: new Date().toISOString(),
    };

    docs[index] = nextDoc;
    this.saveDocuments(docs);
    return nextDoc;
  }

  public async addDocumentFromFile(
    filePath: string,
    metadata?: { contextKind?: InterviewContextDocumentKind; contextDescription?: string },
  ): Promise<InterviewContextDocument> {
    const { fileName, fileType, markdown, sizeBytes } = await ingestMarkdownDocument(filePath);

    const now = new Date().toISOString();
    const doc: InterviewContextDocument = {
      id: crypto.randomUUID(),
      name: fileName,
      fileType,
      markdown,
      contextKind: metadata?.contextKind,
      contextDescription: metadata?.contextDescription?.trim() || undefined,
      sizeBytes,
      createdAt: now,
      updatedAt: now,
    };

    const docs = this.listDocuments();
    this.saveDocuments([doc, ...docs]);
    return doc;
  }

  public async addDocumentsFromBuffers(
    items: Array<{ name: string; data: Buffer; contextKind?: InterviewContextDocumentKind; contextDescription?: string }>,
  ): Promise<InterviewContextDocument[]> {
    const newDocs: InterviewContextDocument[] = [];
    let aggregateOutputBytes = 0;
    for (const item of items) {
      const { fileName, fileType, markdown, sizeBytes } = await ingestMarkdownBuffer(item.name, item.data);
      aggregateOutputBytes += Buffer.byteLength(markdown, 'utf8');
      assertBatchOutputLimit(aggregateOutputBytes);
      const context = normalizeDocumentMetadata(item.contextKind, item.contextDescription);
      const now = new Date().toISOString();
      newDocs.push({
        id: crypto.randomUUID(),
        name: fileName,
        fileType,
        markdown,
        contextKind: context.contextKind,
        contextDescription: context.contextDescription,
        sizeBytes,
        createdAt: now,
        updatedAt: now,
      });
    }

    const docs = this.listDocuments();
    this.saveDocuments([...newDocs, ...docs]);
    return newDocs;
  }

  private saveDocuments(documents: InterviewContextDocument[]): void {
    const tmpPath = `${this.docsPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(documents, null, 2));
    fs.renameSync(tmpPath, this.docsPath);
  }
}

export async function ingestMarkdownBuffer(fileNameInput: string, buffer: Buffer): Promise<IngestedMarkdownDocument> {
  const fileName = path.basename(fileNameInput).slice(0, 255);
  const ext = path.extname(fileName).toLowerCase();
  if (!fileName || fileName === '.' || fileName === '..') throw new Error('Invalid document name.');
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file type "${ext || 'none'}". Supported formats: MD, TXT, PDF, DOCX.`);
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error(`"${fileName}" is empty.`);
  if (buffer.length > MAX_FILE_BYTES) throw new Error('File exceeds the 15 MB maximum.');

  let markdown: string;
  if (ext === '.pdf' || ext === '.docx') {
    const parsed = await parseDocumentInWorker(buffer, ext.slice(1) as 'pdf' | 'docx', fileName);
    markdown = parsed.markdown;
  } else {
    const content = decodeTextFile(buffer, fileName, ext);
    markdown = ext === '.md' || ext === '.markdown'
      ? normalizeMarkdown(content, fileName)
      : plainTextToMarkdown(content, fileName);
  }
  return { fileName, fileType: extensionToFileType(ext), markdown, sizeBytes: buffer.length };
}

export async function ingestMarkdownDocument(filePath: string): Promise<IngestedMarkdownDocument> {
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file type "${ext || 'none'}". Supported formats: MD, TXT, PDF, DOCX.`);
  }
  let original: fs.Stats;
  try { original = fs.lstatSync(filePath); } catch {
    throw new Error('Could not read the selected file. It may have moved or been deleted.');
  }
  if (!original.isFile()) throw new Error('Selected path is not a regular file.');
  if (original.size > MAX_FILE_BYTES) throw new Error('File exceeds the 15 MB maximum.');
  const buffer = readSelectedDocument(filePath, { size: original.size, ino: original.ino, dev: original.dev, mtimeMs: original.mtimeMs, ctimeMs: original.ctimeMs });
  return ingestMarkdownBuffer(fileName, buffer);
}
