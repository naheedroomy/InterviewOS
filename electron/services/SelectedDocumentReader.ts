import * as fs from 'fs';

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

export interface SelectedFileIdentity {
  size: number;
  ino: number;
  dev: number;
  mtimeMs: number;
  ctimeMs: number;
}

/** Opens the picker-authorized inode once, then reads only from that validated descriptor. */
export function readSelectedDocument(filePath: string, original: SelectedFileIdentity): Buffer {
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
  const fd = fs.openSync(filePath, flags);
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.size <= 0 || before.size > MAX_DOCUMENT_BYTES
      || before.size !== original.size || before.ino !== original.ino || before.dev !== original.dev
      || before.mtimeMs !== original.mtimeMs || before.ctimeMs !== original.ctimeMs) {
      throw new Error('Selected document changed or is no longer valid. Select it again.');
    }

    const output = Buffer.allocUnsafe(before.size);
    let offset = 0;
    while (offset < output.length) {
      const read = fs.readSync(fd, output, offset, output.length - offset, offset);
      if (read === 0) throw new Error('Selected document changed or is no longer valid. Select it again.');
      offset += read;
    }

    const after = fs.fstatSync(fd);
    if (!after.isFile() || after.size !== before.size || after.ino !== before.ino || after.dev !== before.dev
      || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) {
      throw new Error('Selected document changed or is no longer valid. Select it again.');
    }
    return output;
  } finally {
    fs.closeSync(fd);
  }
}
