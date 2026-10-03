import path from 'path';

export interface AudioDeviceInfo {
  id: string;
  name: string;
}

export interface NativeModule {
  /** Cheap module-liveness check — does NOT touch CoreAudio. */
  nativeModuleHealthCheck(): boolean;
  getHardwareId(): string;
  verifyGumroadKey(licenseKey: string): Promise<string>;
  // Dodo Payments — all three require a binary rebuild (cargo build --release)
  // They are optional (?) so the module loads even with a stale binary.
  verifyDodoKey?: (licenseKey: string, deviceLabel: string) => Promise<string>;
  validateDodoKey?: (licenseKey: string) => Promise<string>;
  deactivateDodoKey?: (licenseKey: string, instanceId: string) => Promise<string>;
  /** Async — runs CoreAudio enumeration on a libuv worker thread. */
  getInputDevices(): Promise<Array<AudioDeviceInfo>>;
  /** Async — runs CoreAudio enumeration on a libuv worker thread. */
  getOutputDevices(): Promise<Array<AudioDeviceInfo>>;
  // Default-output device id for the system default route. Optional because
  // existing shipped binaries don't have it — main.ts checks `typeof` before
  // calling. Requires a binary rebuild (cargo build --release).
  /** Async — runs CoreAudio query on a libuv worker thread. */
  getDefaultOutputDeviceId?: () => Promise<string>;
  // macOS-only: apply NSPanel-nonactivating + becomesKeyOnlyIfNeeded +
  // hidesOnDeactivate=NO + the right collectionBehavior on the overlay
  // window so clicks/keystrokes don't activate AnswerCue (foreground app
  // keeps key state in dock/menu bar/screen-share). Requires a binary
  // rebuild — WindowHelper checks `typeof` and degrades to plain panel
  // type if missing. Caller passes BrowserWindow.getNativeWindowHandle().
  applyStealthToWindow?: (handle: Buffer) => void;
  // macOS-only: Accessibility permission gate for CGEventTap. Returns
  // true if the process is currently trusted; false otherwise. Cheap;
  // safe to poll to drive UI state.
  isAccessibilityGranted?: () => boolean;
  // macOS-only: CGEventTap-backed stealth keyboard interception.
  // Engaged by StealthKeyboardManager; the foreground app does NOT
  // receive any keystroke while the tap is active. Optional: requires
  // binary rebuild AND Accessibility permission at runtime.
  StealthKeyboardTap?: new () => {
    start(callback: (err: Error | null, ev: CapturedKey) => void, overlayBounds?: OverlayBoundsInput | null): boolean;
    stop(): void;
    readonly isActive: boolean;
  };
  SystemAudioCapture: new (deviceId?: string | null) => {
    getSampleRate(): number;
    start(callback: (...args: any[]) => any, onSpeechEnded?: (...args: any[]) => any): void;
    stop(): void;
  };
  MicrophoneCapture: new (deviceId?: string | null) => {
    getSampleRate(): number;
    start(callback: (...args: any[]) => any, onSpeechEnded?: (...args: any[]) => any): void;
    stop(): void;
  };
}

export interface OverlayBoundsInput {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Mirrors native-module/src/keyboard_tap.rs CapturedKey. */
export interface CapturedKey {
  keyCode: number;
  chars: string;
  flags: number;
  isKeyDown: boolean;
  isOutsideMouseDown?: boolean;
}

// Hard-required: crash the module load if any of these are missing.
// These exist in the ORIGINAL binary (pre-Dodo build).
// NOTE: getInputDevices / getOutputDevices are no longer in REQUIRED_METHODS
// because they are now async (napi Task) and require a core-audio dependency
// that may be unavailable at module-load time. The health-check replaces them
// for the purpose of validating the binary loaded correctly.
const REQUIRED_METHODS = ['nativeModuleHealthCheck', 'getHardwareId', 'verifyGumroadKey'];
const REQUIRED_CONSTRUCTORS = ['SystemAudioCapture', 'MicrophoneCapture'];
// Soft-required: warn (do NOT crash) if missing.
// All three Dodo functions require a binary rebuild (cargo build --release).
// LicenseManager checks these individually with optional chaining (?.) and
// degrades gracefully: falls through to Gumroad if verifyDodoKey is missing,
// skips revocation check if validateDodoKey is missing,
// skips server deactivation if deactivateDodoKey is missing.
const SOFT_REQUIRED_METHODS = ['verifyDodoKey', 'validateDodoKey', 'deactivateDodoKey'];

/**
 * Validates that a loaded native module conforms to the NativeModule interface.
 * Throws immediately if any required method or constructor is missing,
 * or if the functional smoke-test fails (which catches asar-stub false-pass).
 */
function validateNativeModule(mod: any): asserts mod is NativeModule {
    // Hard-required: any missing function here aborts the entire module load.
    for (const fn of REQUIRED_METHODS) {
        if (typeof mod[fn] !== 'function') {
            throw new Error(`NativeModule: missing or invalid method "${fn}" (expected function, got ${typeof mod[fn]})`);
        }
    }
    for (const cls of REQUIRED_CONSTRUCTORS) {
        if (typeof mod[cls] !== 'function') {
            throw new Error(`NativeModule: missing or invalid constructor "${cls}" (expected constructor, got ${typeof mod[cls]})`);
        }
    }

    // Soft-required: warn, but do NOT crash.
    // These are newly-added Dodo functions that require a binary rebuild (cargo build).
    // The app remains fully functional for audio and Gumroad; only Dodo validate/deactivate
    // will be unavailable until the next build ships the new binary.
    for (const fn of SOFT_REQUIRED_METHODS) {
        if (typeof mod[fn] !== 'function') {
            console.warn(
                `[nativeModuleLoader] WARNING: optional method "${fn}" not found in binary — ` +
                `Dodo license validation/deactivation will be unavailable until binary is rebuilt.`
            );
        }
    }

    // Functional smoke-test: call the cheap health-check export to verify the
    // binary actually loaded its native ABI (catches asar-stub false-pass where
    // the JS index.js stub exports the right names but its internal
    // require('./index.*.node') failed silently inside the sealed asar).
    //
    // nativeModuleHealthCheck() does NOT touch CoreAudio, so it is safe to call
    // synchronously on the main thread.
    //
    // NOTE: The guard MUST be separate from the try/catch that wraps the call.
    // Placing the throw INSIDE the try means our own error gets caught by the
    // same catch block, producing a double-wrapped message and losing the stack.
    let healthResult: unknown;
    try {
        healthResult = mod.nativeModuleHealthCheck();
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`NativeModule: health-check threw (${msg}) — likely loaded asar stub instead of real binary`);
    }
    // Guard is OUTSIDE the try block so our throw propagates cleanly.
    if (healthResult !== true) {
        throw new Error(
            `NativeModule: health-check returned ${typeof healthResult} (${String(healthResult)})` +
            ` instead of true — likely loaded asar stub instead of real binary`
        );
    }
}

/**
 * Maps platform+arch to the NAPI-RS compiled binary name.
 * These filenames are produced by \`npx napi build\` in native-module/.
 * Naming convention: index.<platform>-<arch>-<abi>.node
 */
function getNativeBinaryName(): string {
    const { platform, arch } = process;
    const map: Record<string, Record<string, string>> = {
        win32:  {
            x64:   'index.win32-x64-msvc.node',
            ia32:  'index.win32-ia32-msvc.node',
            arm64: 'index.win32-arm64-msvc.node',
        },
        darwin: { x64: 'index.darwin-x64.node', arm64: 'index.darwin-arm64.node' },
        linux:  { x64: 'index.linux-x64-gnu.node', arm64: 'index.linux-arm64-gnu.node' },
    };
    return map[platform]?.[arch] ?? `index.${platform}-${arch}.node`;
}

// undefined = not yet attempted, null = attempted but failed, object = loaded
let cached: NativeModule | null | undefined = undefined;

/**
 * Loads the Rust native module directly from the .node binary file.
 *
 * We bypass `require('natively-audio')` intentionally. That approach relied on
 * npm creating a symlink from node_modules/natively-audio -> native-module/,
 * which breaks on Windows (Git Bash produces POSIX-style symlinks that Node
 * can't resolve). Loading the .node file directly avoids npm entirely.
 *
 * IMPORTANT: `app` is imported inside this function (not at module top-level)
 * so this module is safe to import from renderer processes, workers, and tests.
 *
 * Candidate paths are tried in this order:
 *   1. Production/electron:dev — app.asar.unpacked/ via process.resourcesPath.
 *      This MUST be first: in a packaged app, app.getAppPath() returns the
 *      sealed app.asar archive. Requiring a path inside app.asar causes
 *      Electron's fs interceptor to serve the JS index.js stub (not the native
 *      binary), which exports the right names but cannot dlopen the real ABI.
 *   2. Development — app.getAppPath() returns the raw project root.
 *   3. Development fallback — one level up if launched from a subdirectory.
 *
 * The function returns null on failure rather than throwing, so the app
 * degrades gracefully (audio device enumeration returns empty arrays).
 */
export function loadNativeModule(): NativeModule | null {
    if (cached !== undefined) return cached;

    // Lazily import app to avoid "Cannot use require of electron module" errors
    // when this module is accidentally imported in a renderer or worker context.
    let appPath: string;
    let isDev = false;
    let verboseLogging = false;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { app } = require('electron') as typeof import('electron');
        appPath = app.getAppPath();
        // Match the isDev predicate used in WindowHelper.ts: BOTH
        // NODE_ENV=development AND !app.isPackaged are required.
        isDev = process.env.NODE_ENV === 'development' && !app.isPackaged;
    } catch (e) {
        console.error('[nativeModuleLoader] app.getAppPath() not available:', e);
        cached = null;
        return null;
    }

    // Honor the verboseLogging setting when available. SettingsManager throws
    // if accessed before app.whenReady() — wrap in a try/catch so this loader
    // remains safe to invoke during early boot.
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { SettingsManager } = require('../services/SettingsManager');
        verboseLogging = !!SettingsManager.getInstance().get('verboseLogging');
    } catch {
        // Settings unavailable — default to quiet logging.
    }

    const binary = getNativeBinaryName();

    const packagedPath = process.resourcesPath
        ? path.join(process.resourcesPath, 'app.asar.unpacked', 'native-module', binary)
        : null;
    const devPath = path.join(appPath, 'native-module', binary);
    const devFallbackPath = path.join(appPath, '..', 'native-module', binary);

    // In dev, the packaged path never exists; trying it first produces a
    // scary-looking "Cannot find module" + Require stack on every boot.
    // Order the dev paths first when running unpacked so the happy path
    // logs nothing alarming. In packaged builds the asar.unpacked path
    // MUST be tried first — see the comment block above on why.
    const candidates: string[] = isDev
        ? [devPath, devFallbackPath, ...(packagedPath ? [packagedPath] : [])]
        : [...(packagedPath ? [packagedPath] : []), devPath, devFallbackPath];

    for (const filePath of candidates) {
        try {
            const mod = require(filePath);
            validateNativeModule(mod);
            cached = mod;
            if (verboseLogging) {
                console.log(`[nativeModuleLoader] Loaded ${binary} from: ${filePath}`);
            }
            return cached;
        } catch (err: unknown) {
            // First-attempt failures are expected in dev (packaged path missing)
            // and harmless — only log a one-liner at debug level. The final
            // "failed to load from all paths" error below still fires loudly
            // if every candidate fails.
            const msg = err instanceof Error ? err.message : String(err);
            if (verboseLogging) {
                console.warn(`[nativeModuleLoader] Could not load from ${filePath}: ${msg}`);
            }
        }
    }

    console.error(`[nativeModuleLoader] Failed to load ${binary} from all ${candidates.length} candidate paths.`);
    cached = null;
    return null;
}
