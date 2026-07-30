/**
 * Contract tests for live-overlay resize/persistence correctness.
 *
 * These are static source-analysis tests that verify the WindowHelper
 * implementation matches the required invariants without spinning up
 * Electron windows. Run via `node --test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readHelper() {
  return readFileSync(path.resolve(__dirname, '../../WindowHelper.ts'), 'utf8');
}
function readMain() {
  return readFileSync(path.resolve(__dirname, '../../main.ts'), 'utf8');
}

// ── Defect #1: programmatic move+resize suppression ──────────────────────

test('_programmaticResizeCount is a counter (not boolean), guarding against move+resize double-consumption', () => {
  const src = readHelper();
  assert.ok(
    /private\s+_programmaticResizeCount\s*=\s*0\s*;/.test(src),
    '_programmaticResizeCount must be declared as a counter initialized to 0',
  );

  const incMatches = src.match(/_programmaticResizeCount\s*\+\+\s*;/g);
  assert.ok(incMatches && incMatches.length >= 5,
    `Expected at least 5 increment sites; found ${incMatches?.length ?? 0}`,
  );

  const decMatches = src.match(/_programmaticResizeCount\s*--\s*;/g);
  assert.ok(decMatches && decMatches.length === 2,
    `Expected exactly 2 decrement sites (move + resize); found ${decMatches?.length ?? 0}`,
  );

  const badAssign = src.match(/_programmaticResizeCount\s*=\s*(?:true|false)\s*;/g);
  assert.equal(badAssign, null,
    `Found stray boolean assignments: ${badAssign?.join(', ') ?? 'none'}`,
  );
});

test('move handler uses >0 guard and does NOT set _userSizing on user move', () => {
  const src = readHelper();
  const start = src.indexOf("this.overlayWindow.on('move'");
  assert.ok(start >= 0, 'move handler must exist');

  const block = src.slice(start, src.indexOf("this.overlayWindow.on('resize'", start));

  assert.ok(
    /_programmaticResizeCount\s*>\s*0/.test(block),
    'move handler must check _programmaticResizeCount > 0',
  );

  assert.equal(
    block.match(/_userSizing\s*=\s*true/g),
    null,
    'move handler must NOT set _userSizing = true',
  );

  assert.ok(
    /persistOverlayBoundsDebounced\s*\(\s*\)/.test(block),
    'move handler must persist bounds',
  );
});

// ── Defect #2: saved/restored user bounds durability ─────────────────────

test('loadSavedOverlayBounds sets _userSizing when valid saved bounds are loaded', () => {
  const src = readHelper();
  const method = src.slice(
    src.indexOf('private loadSavedOverlayBounds'),
    src.indexOf('// ─────────────────────────────────', src.indexOf('private loadSavedOverlayBounds')),
  );

  assert.ok(
    /this\.overlayBounds\s*=\s*validated/.test(method),
    'method must assign validated bounds',
  );

  const userSizingIdx = method.indexOf('this._userSizing = true');
  const boundsAssignIdx = method.indexOf('this.overlayBounds = validated');
  assert.ok(
    userSizingIdx >= 0 && boundsAssignIdx >= 0 && userSizingIdx > boundsAssignIdx,
    'must set _userSizing = true after overlayBounds = validated',
  );
});

test('restoreFromExpanded sets _userSizing = true in all paths', () => {
  const src = readHelper();

  // Fallback path (no preExpandedBounds)
  const noPreIdx = src.indexOf('No pre-expand bounds');
  assert.ok(noPreIdx >= 0, 'restoreFromExpanded must handle missing preExpandBounds');

  const fallbackBlock = src.slice(noPreIdx, noPreIdx + 500);
  assert.ok(
    /_userSizing\s*=\s*true/.test(fallbackBlock),
    'restoreFromExpanded fallback must set _userSizing = true',
  );

  // Normal restore path (has preExpandBounds)
  const normalBlock = src.slice(
    src.indexOf('clampBoundsToWorkArea(this._preExpandBounds, wa);'),
    src.indexOf('broadcastExpandedState',
      src.indexOf('clampBoundsToWorkArea(this._preExpandBounds, wa);') + 10),
  );
  assert.ok(
    /_userSizing\s*=\s*true/.test(normalBlock),
    'normal restoreFromExpanded must set _userSizing = true',
  );
});

test('switchToOverlay sets _userSizing correctly based on mode', () => {
  const src = readHelper();
  const method = src.slice(
    src.indexOf('public switchToOverlay'),
    src.indexOf('public switchToLauncher'),
  );

  // When expanded → _userSizing = false
  assert.ok(
    /if\s*\(this\._overlayExpanded\)\s*\{[\s\S]{0,300}_userSizing\s*=\s*false/.test(method),
    'expanded mode must set _userSizing = false',
  );

  // When savedBounds exist and not expanded → _userSizing = true
  assert.ok(
    /\}\s*else\s+if\s+\(savedBounds\)\s*\{[\s\S]{0,300}_userSizing\s*=\s*true/.test(method),
    'savedBounds path must set _userSizing = true',
  );

  // When default centered → _userSizing = false
  assert.ok(
    /else\s*\{[\s\S]{0,200}_userSizing\s*=\s*false[\s\S]{0,50}Default centered/.test(method) ||
    /Default centered[\s\S]{0,200}_userSizing\s*=\s*false/.test(method),
    'default centered path must set _userSizing = false',
  );
});

// ── Defect #3: new-meeting preserves user bounds ─────────────────────────

test('main.ts calls prepareForNewMeeting (not resetOverlayPosition) at meeting start', () => {
  const mainSrc = readMain();
  const idx = mainSrc.indexOf('prepareForNewMeeting');
  assert.ok(idx >= 0, 'main.ts must contain prepareForNewMeeting');

  // Verify the call is in the meeting-start section
  const ctx = mainSrc.slice(Math.max(0, idx - 200), idx + 100);
  assert.ok(
    /prepareForNewMeeting/.test(ctx),
    'meeting start must call prepareForNewMeeting',
  );
});

test('prepareForNewMeeting preserves user bounds (no reset)', () => {
  const src = readHelper();
  const method = src.slice(
    src.indexOf('public prepareForNewMeeting'),
    src.indexOf('public getLastOverlayBounds'),
  );

  // Must NOT null overlayBounds
  assert.ok(
    !/overlayBounds\s*=\s*null/.test(method),
    'prepareForNewMeeting must NOT null overlayBounds',
  );
  // Must NOT set _userSizing = false
  assert.ok(
    !/_userSizing\s*=\s*false/.test(method),
    'prepareForNewMeeting must NOT set _userSizing = false',
  );
  // Must set _userSizing = true when overlayBounds exists
  assert.ok(
    /if\s*\(this\.overlayBounds\)\s*\{[\s\S]{0,150}_userSizing\s*=\s*true/.test(method),
    'must set _userSizing = true when overlayBounds exists',
  );
  // Must exit expanded mode
  assert.ok(
    /this\._overlayExpanded\s*=\s*false/.test(method),
    'must exit expanded mode',
  );
});

// ── Defect #4: manual resize while expanded broadcasts & clears preExpand ─

test('resize handler broadcasts state and clears preExpandBounds when exiting expanded', () => {
  const src = readHelper();
  const handler = src.slice(
    src.indexOf("this.overlayWindow.on('resize'"),
    src.indexOf("this.overlayWindow.on('system-context-menu'",
      src.indexOf("this.overlayWindow.on('resize'")),
  );

  assert.ok(
    /_overlayExpanded\s*=\s*false[\s\S]{0,300}broadcastExpandedState/.test(handler),
    'resize handler must broadcastExpandedState after exiting expanded',
  );

  assert.ok(
    /_preExpandBounds\s*=\s*null/.test(handler),
    'resize handler must clear _preExpandBounds',
  );
});

// ── Defect #5: move-only actions persist position without setting sizing ──

test('move handler persists bounds but does NOT set _userSizing', () => {
  const src = readHelper();
  const handler = src.slice(
    src.indexOf("this.overlayWindow.on('move'"),
    src.indexOf("this.overlayWindow.on('resize'", src.indexOf("this.overlayWindow.on('move'")),
  );

  assert.ok(
    /persistOverlayBoundsDebounced\s*\(\s*\)/.test(handler),
    'move handler must persist bounds',
  );

  assert.equal(
    handler.match(/_userSizing\s*=\s*true/g),
    null,
    'move handler must NOT set _userSizing = true',
  );
});

// ── Integrated: resize handler sets _userSizing ──────────────────────────

test('resize handler sets _userSizing on manual resize', () => {
  const src = readHelper();
  const handler = src.slice(
    src.indexOf("this.overlayWindow.on('resize'"),
    src.indexOf("this.overlayWindow.on('system-context-menu'",
      src.indexOf("this.overlayWindow.on('resize'")),
  );

  assert.ok(
    /_userSizing\s*=\s*true/.test(handler),
    'resize handler must set _userSizing on manual resize',
  );
});

// ── Auto-clamp latch (compact growth hits OS height cap) ─────────────────

test('setOverlayDimensions detects OS height cap and latches into viewport mode', () => {
  const src = readHelper();
  // Find the method by its full TypeScript signature
  const dimStart = src.indexOf('public setOverlayDimensions(width: number, height: number)');
  const dimEnd = src.indexOf('// Variant of setOverlayDimensions', dimStart);
  const dimMethod = src.slice(dimStart, dimEnd);

  // Must compare newHeight < height with threshold
  assert.ok(
    /newHeight\s*<\s*height\s*-\s*20/.test(dimMethod),
    'setOverlayDimensions must detect clamp with threshold: newHeight < height - 20',
  );

  // Must set _compactAutoLatched and call broadcastSizingMode
  assert.ok(
    /_compactAutoLatched\s*=\s*true[\s\S]{0,100}broadcastSizingMode/.test(dimMethod),
    'setOverlayDimensions must set _compactAutoLatched and broadcast on clamp',
  );

  // Must set _userSizing when latch triggers
  assert.ok(
    /_compactAutoLatched[\s\S]{0,50}_userSizing\s*=\s*true/.test(dimMethod),
    'setOverlayDimensions must set _userSizing on clamp latch',
  );
});

test('setOverlayDimensionsCentered detects OS height cap and latches into viewport mode', () => {
  const src = readHelper();
  const centeredStart = src.indexOf('public setOverlayDimensionsCentered(width: number, height: number)');
  const centeredEnd = src.indexOf('public createWindow', centeredStart);
  const centeredMethod = src.slice(centeredStart, centeredEnd);

  assert.ok(
    /newHeight\s*<\s*height\s*-\s*20/.test(centeredMethod),
    'setOverlayDimensionsCentered must detect clamp with threshold',
  );

  assert.ok(
    /_compactAutoLatched\s*=\s*true[\s\S]{0,100}broadcastSizingMode/.test(centeredMethod),
    'setOverlayDimensionsCentered must set _compactAutoLatched and broadcast',
  );
});

test('_compactAutoLatched flag exists and is cleared in resetOverlayPosition and prepareForNewMeeting', () => {
  const src = readHelper();

  // Must declare the flag
  assert.ok(
    /private\s+_compactAutoLatched\s*=\s*false/.test(src),
    '_compactAutoLatched flag must be declared',
  );

  // Must clear in resetOverlayPosition
  const resetMethod = src.slice(
    src.indexOf('public resetOverlayPosition'),
    src.indexOf('public getLastOverlayBounds'),
  );
  assert.ok(
    /_compactAutoLatched\s*=\s*false/.test(resetMethod),
    'resetOverlayPosition must clear _compactAutoLatched',
  );

  // Must clear in prepareForNewMeeting
  const prepareMethod = src.slice(
    src.indexOf('public prepareForNewMeeting'),
    src.indexOf('public getLastOverlayBounds'),
  );
  assert.ok(
    /_compactAutoLatched\s*=\s*false/.test(prepareMethod),
    'prepareForNewMeeting must clear _compactAutoLatched',
  );
});

test('clearCompactLatch only clears latch-originated viewport mode', () => {
  const src = readHelper();
  const clearMethod = src.slice(
    src.indexOf('public clearCompactLatch'),
    src.indexOf('public isVisible'),
  );

  // Must guard on _compactAutoLatched
  assert.ok(
    /if\s*\(!\s*this\._compactAutoLatched\s*\)\s*return/.test(clearMethod),
    'clearCompactLatch must guard on _compactAutoLatched',
  );

  // Must clear _userSizing
  assert.ok(
    /_userSizing\s*=\s*false/.test(clearMethod),
    'clearCompactLatch must clear _userSizing',
  );

  // Must broadcast sizing mode
  assert.ok(
    /broadcastSizingMode/.test(clearMethod),
    'clearCompactLatch must broadcastSizingMode',
  );
});

// ── IPC contract verification ────────────────────────────────────────────

test('clear-compact-latch IPC is wired across all layers', () => {
  const helper = readHelper();
  const ipc = readFileSync(
    path.resolve(__dirname, '../../ipcHandlers.ts'), 'utf8',
  );
  const preload = readFileSync(
    path.resolve(__dirname, '../../preload.ts'), 'utf8',
  );
  const types = readFileSync(
    path.resolve(__dirname, '../../../src/types/electron.d.ts'), 'utf8',
  );

  // Main: clearCompactLatch method exists
  assert.ok(
    /public clearCompactLatch/.test(helper),
    'WindowHelper must expose public clearCompactLatch',
  );

  // IPC handler: clear-compact-latch channel
  assert.ok(
    /safeHandle\(['"]clear-compact-latch['"]/.test(ipc),
    'ipcHandlers must register clear-compact-latch handler',
  );

  // Preload: clearCompactLatch API as part of ElectronAPI
  assert.ok(
    /clearCompactLatch/.test(preload),
    'preload must expose clearCompactLatch',
  );

  // Types: clearCompactLatch in interface
  assert.ok(
    /clearCompactLatch/.test(types),
    'electron.d.ts must declare clearCompactLatch',
  );
});
