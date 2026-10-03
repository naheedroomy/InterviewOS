import { loadNativeModule, type AudioDeviceInfo } from './nativeModuleLoader';

const NativeModule = loadNativeModule();

// ── Timeout  ──────────────────────────────────────────────────────────────────
const ENUMERATION_TIMEOUT_MS = 8000; // CoreAudio HAL must respond within 8 s

// ── Caching ───────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 3500; // 3.5 s — covers typical 5 s polling gap

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

let inputCache: CacheEntry<AudioDevice[]> | null = null;
let outputCache: CacheEntry<AudioDevice[]> | null = null;

// ── In-flight dedup ───────────────────────────────────────────────────────────
let inputPromise: Promise<AudioDevice[]> | null = null;
let outputPromise: Promise<AudioDevice[]> | null = null;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AudioDevice {
  id: string;
  name: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Wraps a promise with a timeout rejection and a helpful tag for diagnostics.
 * This is the same `withTimeout` pattern used elsewhere in main.ts.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, tag: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[AudioDevices] ${tag} timed out after ${ms}ms`));
    }, ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Read a cache entry. Returns cached value if still within TTL, null otherwise.
 */
function cacheHit<T>(entry: CacheEntry<T> | null): T | null {
  if (entry && Date.now() < entry.expiresAt) return entry.value;
  return null;
}

function cacheSet<T>(entry: CacheEntry<T> | null, value: T, ttlMs: number): CacheEntry<T> {
  return { value, expiresAt: Date.now() + ttlMs };
}

// ── Public API ────────────────────────────────────────────────────────────────

export class AudioDevices {
  /**
   * Resolve the async getInputDevices export from the native module.
   * Gracefully degrades to [] when the module is unavailable.
   */
  private static getNativeInputFn(): ((...args: any[]) => Promise<AudioDeviceInfo[]>) | null {
    const mod = loadNativeModule();
    if (!mod || typeof mod.getInputDevices !== 'function') {
      console.warn('[AudioDevices] Native getInputDevices not available');
      return null;
    }
    return mod.getInputDevices.bind(mod);
  }

  /**
   * Resolve the async getOutputDevices export from the native module.
   * Gracefully degrades to [] when the module is unavailable.
   */
  private static getNativeOutputFn(): ((...args: any[]) => Promise<AudioDeviceInfo[]>) | null {
    const mod = loadNativeModule();
    if (!mod || typeof mod.getOutputDevices !== 'function') {
      console.warn('[AudioDevices] Native getOutputDevices not available');
      return null;
    }
    return mod.getOutputDevices.bind(mod);
  }

  /**
   * Enumerate input devices. Returns cached data if recent; otherwise fires
   * at most one in-flight CoreAudio enumeration task per direction.
   *
   * Timeout: 8 s — if CoreAudio HAL stays hung, returns empty array so the
   *          app never blocks waiting for device enumeration.
   * Dedup:   concurrent callers share the same pending promise.
   * Cache:   3.5 s TTL so rapid polling (Launcher focus, 5 s watcher) does not
   *          queue unlimited native tasks.
   */
  public static async getInputDevices(): Promise<AudioDevice[]> {
    // 1. Check cache
    const cached = cacheHit(inputCache);
    if (cached) return cached;

    // 2. Dedup: join an in-flight request
    if (inputPromise) return inputPromise;

    const fn = AudioDevices.getNativeInputFn();
    if (!fn) {
      inputCache = cacheSet(inputCache, [], CACHE_TTL_MS);
      return [];
    }

    // 3. Fire the async native task (runs on libuv worker — does NOT block event loop)
    inputPromise = (async () => {
      try {
        const devices = await withTimeout(fn(), ENUMERATION_TIMEOUT_MS, 'getInputDevices');
        const mapped = devices.map((d) => ({ id: d.id, name: d.name }));
        inputCache = cacheSet(inputCache, mapped, CACHE_TTL_MS);
        return mapped;
      } catch (e) {
        console.error('[AudioDevices] Failed to enumerate input devices:', e);
        // Return empty array; cache briefly so we don't retry immediately
        inputCache = cacheSet(inputCache, [], CACHE_TTL_MS);
        return [];
      } finally {
        inputPromise = null;
      }
    })();

    return inputPromise;
  }

  /**
   * Enumerate output devices. Same timeout/dedup/cache scheme as getInputDevices.
   */
  public static async getOutputDevices(): Promise<AudioDevice[]> {
    // 1. Check cache
    const cached = cacheHit(outputCache);
    if (cached) return cached;

    // 2. Dedup: join an in-flight request
    if (outputPromise) return outputPromise;

    const fn = AudioDevices.getNativeOutputFn();
    if (!fn) {
      outputCache = cacheSet(outputCache, [], CACHE_TTL_MS);
      return [];
    }

    // 3. Fire the async native task
    outputPromise = (async () => {
      try {
        const devices = await withTimeout(fn(), ENUMERATION_TIMEOUT_MS, 'getOutputDevices');
        const mapped = devices.map((d) => ({ id: d.id, name: d.name }));
        outputCache = cacheSet(outputCache, mapped, CACHE_TTL_MS);
        return mapped;
      } catch (e) {
        console.error('[AudioDevices] Failed to enumerate output devices:', e);
        outputCache = cacheSet(outputCache, [], CACHE_TTL_MS);
        return [];
      } finally {
        outputPromise = null;
      }
    })();

    return outputPromise;
  }

  /**
   * Force-clear both caches.  Useful when the user changes audio devices or
   * the app detects a route change so the next call fetches fresh data.
   */
  public static clearCache(): void {
    inputCache = null;
    outputCache = null;
  }
}
