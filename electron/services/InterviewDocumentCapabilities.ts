import * as crypto from 'crypto';

export interface DocumentCapability {
  token: string;
  senderId: number;
  filePath: string;
  name: string;
  size: number;
  ino: number;
  dev: number;
  mtimeMs: number;
  ctimeMs: number;
  ext: string;
  expiresAt: number;
}

export class InterviewDocumentCapabilities {
  private readonly capabilities = new Map<string, DocumentCapability>();

  constructor(private readonly ttlMs = 5 * 60 * 1000, private readonly now = () => Date.now()) {}

  issue(senderId: number, filePath: string, name: string, size: number, ext: string, ino = 0, dev = 0, mtimeMs = 0, ctimeMs = 0): DocumentCapability {
    this.pruneExpired();
    const token = crypto.randomBytes(32).toString('hex');
    const capability = { token, senderId, filePath, name, size, ino, dev, mtimeMs, ctimeMs, ext, expiresAt: this.now() + this.ttlMs };
    this.capabilities.set(token, capability);
    return capability;
  }

  peek(token: unknown, senderId: number): DocumentCapability | null {
    if (typeof token !== 'string') return null;
    const capability = this.capabilities.get(token);
    if (!capability || capability.senderId !== senderId || capability.expiresAt <= this.now()) return null;
    return capability;
  }

  consume(token: unknown, senderId: number): DocumentCapability | null {
    if (typeof token !== 'string') return null;
    const capability = this.capabilities.get(token);
    if (!capability) return null;
    this.capabilities.delete(token);
    if (capability.senderId !== senderId || capability.expiresAt <= this.now()) return null;
    return capability;
  }

  private pruneExpired(): void {
    const now = this.now();
    for (const [token, capability] of this.capabilities) {
      if (capability.expiresAt <= now) this.capabilities.delete(token);
    }
  }
}
