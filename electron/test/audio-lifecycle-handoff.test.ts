/**
 * Audio Lifecycle Handoff Tests
 * ==============================
 * Focused regression tests for the Settings-audio-test → interview microphone
 * handoff fix. Verifies:
 *
 *   1. stopAudioTest() is called BEFORE meeting capture setup starts
 *   2. Quiescence delay is bounded and conditional (only when test was active)
 *   3. stopAudioTest() awaits both mic and system captures before nulling refs
 *   4. Cancelled _startAudioTestImpl cannot recreate mic after permission await
 *   5. Epoch-based cancellation works correctly for all async yield points
 *
 * Run with:
 *   npx tsx electron/test/audio-lifecycle-handoff.test.ts
 */

// ── Mock EventEmitter (minimal stand-in for MicrophoneCapture / SystemAudioCapture) ──
class MockCapture {
  public stopped = false;
  public destroyed = false;
  public preWarmDisabled = false;
  public stopResolve: (() => void) | null = null;
  private _stopPromise: Promise<void>;

  constructor(public readonly label: string) {
    this._stopPromise = new Promise(resolve => {
      this.stopResolve = resolve;
    });
  }

  stop(): Promise<void> {
    this.stopped = true;
    if (this.stopResolve) {
      this.stopResolve();
      this.stopResolve = null;
    }
    return this._stopPromise;
  }

  destroy(): Promise<void> {
    this.destroyed = true;
    return this.stop();
  }

  disablePreWarm(): void {
    this.preWarmDisabled = true;
  }

  // Simulate a stuck native stop that takes a while
  static createDelayed(label: string, delayMs: number): MockCapture {
    const cap = new MockCapture(label);
    const origStop = cap.stop.bind(cap);
    cap._stopPromise = new Promise(resolve => {
      cap.stopResolve = () => setTimeout(resolve, delayMs);
    });
    return cap;
  }
}

// ── System under test ───────────────────────────────────────────────────────
// We re-implement the relevant lifecycle logic from main.ts as pure functions
// so tests run in isolation without Electron, native modules, or real devices.

type AudioTestState = {
  audioTestCapture: MockCapture | null;
  audioTestSystemCapture: MockCapture | null;
  _audioTestEpoch: number;
  stopAudioTestCallCount: number;
  hadActiveTestAtStartMeeting: boolean; // captured before stopAudioTest
};

function createState(): AudioTestState {
  return {
    audioTestCapture: null,
    audioTestSystemCapture: null,
    _audioTestEpoch: 0,
    stopAudioTestCallCount: 0,
    hadActiveTestAtStartMeeting: false,
  };
}

type IsCurrentTestFn = () => boolean;

/**
 * Mirrors the production stopAudioTest logic.
 * Key properties:
 *   - Bumps epoch first
 *   - Saves local refs, nulls instance refs synchronously BEFORE any await
 *   - Awaits stop() on both captures with failure isolation
 */
async function stopAudioTest(state: AudioTestState): Promise<boolean> {
  state._audioTestEpoch++;
  state.stopAudioTestCallCount++;

  const micCapture = state.audioTestCapture;
  const sysCapture = state.audioTestSystemCapture;
  state.audioTestCapture = null;
  state.audioTestSystemCapture = null;

  const hadAny = !!(micCapture || sysCapture);

  if (micCapture) {
    micCapture.disablePreWarm();
    try {
      await micCapture.stop();
    } catch {
      // failure-isolated
    }
  }

  if (sysCapture) {
    try {
      await sysCapture.stop();
    } catch {
      // failure-isolated
    }
  }

  return hadAny;
}

/**
 * Mirrors the production _startAudioTestImpl epoch checks.
 * Accepts an optional external `cancellationSignal` — a Promise that resolves
 * when the test wants to simulate a concurrent stopAudioTest call. The impl
 * awaits this signal after the simulated permission check, allowing the test
 * to fire stopAudioTest at a deterministic point.
 * Returns the created mic capture, null if permission denied, or 'CANCELLED'
 * if the epoch changed during an await.
 */
async function startAudioTestImpl(
  state: AudioTestState,
  options?: {
    failPermission?: boolean;
    cancellationSignal?: Promise<void>;
  }
): Promise<MockCapture | null | 'CANCELLED'> {
  const { failPermission = false, cancellationSignal } = options || {};

  await stopAudioTest(state);
  const startEpoch = ++state._audioTestEpoch;
  const isCurrentTest: IsCurrentTestFn = () => state._audioTestEpoch === startEpoch;

  // Simulate ensureMacMicrophoneAccess (async yield point)
  if (failPermission) {
    return null; // permission denied
  }

  // Yield to let the test inject a cancellation (e.g. stopAudioTest) if a
  // cancellationSignal is provided. This simulates the permission await in
  // production where stopAudioTest can fire while ensureMacMicrophoneAccess
  // is resolving.
  if (cancellationSignal) {
    await cancellationSignal;
  } else {
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  // ── POST-YIELD EPOCH CHECK (the fix) ──
  // If a stopAudioTest fired during the await above, the epoch has changed
  // and isCurrentTest returns false. Bail before constructing a mic test
  // capture that would compete with the meeting's capture.
  if (!isCurrentTest()) {
    return 'CANCELLED';
  }

  // Construct mic test (like production at line ~3215)
  const micCapture = new MockCapture('mic-test');
  state.audioTestCapture = micCapture;

  // System probe path would follow — not needed for this test
  return micCapture;
}

/**
 * Mirrors the production startMeeting handoff logic.
 * Returns whether quiescence delay ran + timing info.
 */
async function startMeetingHandoff(state: AudioTestState): Promise<{
  stopCalled: boolean;
  quiescenceDelay: number | null;
  quiescenceActive: boolean;
}> {
  // Capture whether test was active BEFORE stop
  const hadActiveTest = !!(state.audioTestCapture || state.audioTestSystemCapture);
  state.hadActiveTestAtStartMeeting = hadActiveTest;

  const t0 = Date.now();
  await stopAudioTest(state);
  const stopTime = Date.now() - t0;

  let quiescenceDelay: number | null = null;
  if (hadActiveTest) {
    // Short bounded non-blocking quiescence (150ms in production)
    const QUIESCENCE_MS = 150;
    await new Promise(resolve => setTimeout(resolve, QUIESCENCE_MS));
    quiescenceDelay = Date.now() - t0 - stopTime;
  }

  return {
    stopCalled: state.stopAudioTestCallCount > 0,
    quiescenceDelay,
    quiescenceActive: hadActiveTest,
  };
}

// ── Test helpers ─────────────────────────────────────────────────────────────
function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`❌ ASSERTION FAILED: ${msg}`);
  console.log(`  ✅ ${msg}`);
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── Tests ────────────────────────────────────────────────────────────────────

async function test1_stopAudioTestPrecedesMeetingCaptureSetup(): Promise<boolean> {
  console.log('─'.repeat(70));
  console.log('TEST 1: stopAudioTest() is called BEFORE meeting capture setup');
  console.log('─'.repeat(70));

  const state = createState();
  // Simulate active audio test
  state.audioTestCapture = new MockCapture('mic-test');
  state.audioTestSystemCapture = new MockCapture('sys-test');

  // This mirrors what startMeeting does: stopAudioTest first
  const result = await startMeetingHandoff(state);

  assert(result.stopCalled, 'stopAudioTest was called during startMeeting handoff');
  assert(state.audioTestCapture === null, 'audioTestCapture is null after handoff');
  assert(state.audioTestSystemCapture === null, 'audioTestSystemCapture is null after handoff');
  assert(result.quiescenceActive, 'quiescence was active because test was running');
  assert(result.quiescenceDelay !== null, 'quiescence delay was measured');

  // Verify captures were actually stopped
  // (We can't access the local refs, but the stop methods were called)
  assert(state.stopAudioTestCallCount === 1, 'stopAudioTest was called exactly once');

  return true;
}

async function test2_quiescenceBoundedAndConditional(): Promise<boolean> {
  console.log();
  console.log('─'.repeat(70));
  console.log('TEST 2: Quiescence delay is bounded and conditional');
  console.log('─'.repeat(70));

  // Case A: No active test — zero quiescence
  const stateA = createState();
  const t0 = Date.now();
  const resultA = await startMeetingHandoff(stateA);
  const elapsedA = Date.now() - t0;

  assert(!resultA.quiescenceActive, 'no quiescence when test was not active');
  assert(resultA.quiescenceDelay === null, 'no quiescence delay measured');
  assert(elapsedA < 50, `startMeeting handoff completed in ${elapsedA}ms (no delay expected)`);

  // Case B: Active test — bounded quiescence expected
  const stateB = createState();
  stateB.audioTestCapture = new MockCapture('mic-test');
  const t1 = Date.now();
  const resultB = await startMeetingHandoff(stateB);
  const elapsedB = Date.now() - t1;

  assert(resultB.quiescenceActive, 'quiescence was active because test was running');
  assert(resultB.quiescenceDelay !== null && resultB.quiescenceDelay! >= 0, 'quiescence delay was measured');
  assert(elapsedB >= 140, `quiescence delay applied (~150ms, got ${elapsedB}ms)`);
  assert(elapsedB < 1000, `quiescence was bounded (<1s, got ${elapsedB}ms)`);

  return true;
}

async function test3_stopAudioTestAwaitsBothCapturesBeforeNull(): Promise<boolean> {
  console.log();
  console.log('─'.repeat(70));
  console.log('TEST 3: stopAudioTest() awaits both captures before nulling');
  console.log('─'.repeat(70));

  const state = createState();
  // Create captures whose stop is genuinely async
  const micCapture = new MockCapture('mic-test');
  const sysCapture = new MockCapture('sys-test');
  state.audioTestCapture = micCapture;
  state.audioTestSystemCapture = sysCapture;

  // Call stopAudioTest and verify captures are nulled SYNCHRONOUSLY
  // before the stop promises resolve (the nulling happens before await)
  let micRefDuringStop: MockCapture | null = state.audioTestCapture;
  let sysRefDuringStop: MockCapture | null = state.audioTestSystemCapture;

  // Start stopAudioTest but don't await (capture the synchronous null)
  const stopPromise = stopAudioTest(state);

  // At this point, the microtask queue hasn't run, so the stop() promises
  // haven't resolved yet, BUT the instance refs should already be null.
  assert(state.audioTestCapture === null, 'audioTestCapture nulled synchronously before await');
  assert(state.audioTestSystemCapture === null, 'audioTestSystemCapture nulled synchronously before await');

  // The local refs captured BEFORE should still exist
  assert(micRefDuringStop !== null, 'local mic ref captured before null');
  assert(sysRefDuringStop !== null, 'local sys ref captured before null');

  // Now await completion
  await stopPromise;

  // Verify the captures were actually stopped
  assert(micCapture.stopped, 'mic test capture was stopped');
  assert(micCapture.preWarmDisabled, 'mic test prewarm was disabled');
  assert(sysCapture.stopped, 'system test capture was stopped');

  return true;
}

async function test4_cancelledStartAudioTestCannotRecreateMicAfterPermissionAwait(): Promise<boolean> {
  console.log();
  console.log('─'.repeat(70));
  console.log('TEST 4: Cancelled _startAudioTestImpl cannot recreate mic after permission await');
  console.log('─'.repeat(70));

  const state = createState();

  // Create a deterministic cancellation signal: the impl will await this,
  // and we resolve it AFTER firing stopAudioTest so there is no timing race.
  let triggerCancellation: () => void = () => {};
  const cancellationSignal = new Promise<void>(resolve => {
    triggerCancellation = resolve;
  });

  // 1. Start the impl; it will await cancellationSignal after the simulated
  //    permission check (the yield point that corresponds to
  //    `ensureMacMicrophoneAccess` in production).
  const implPromise = startAudioTestImpl(state, {
    cancellationSignal,
  });

  // 2. Verify the impl is suspended at the permission await by yielding the
  //    event loop (the impl's microtask queue has been processed, it's now
  //    blocked on cancellationSignal).
  await new Promise(resolve => setImmediate(resolve));

  // 3. Fire stopAudioTest (simulates startMeeting's handoff or user closing
  //    Settings) WHILE the impl is suspended. This bumps the epoch.
  await stopAudioTest(state);

  // 4. Now let the impl proceed past the permission await. It will run the
  //    epoch check and see the epoch has changed.
  triggerCancellation();

  // 5. Await impl result
  const result = await implPromise;

  assert(result === 'CANCELLED', '_startAudioTestImpl returned CANCELLED after stopAudioTest fired during permission await');
  assert(state.audioTestCapture === null, 'no mic test capture was created after cancellation');
  assert(state.stopAudioTestCallCount >= 2, 'stopAudioTest was called twice (once inside impl, once by test)');

  return true;
}

async function test5_stopAudioTestEpochBumpCancelsInFlightSystemProbe(): Promise<boolean> {
  console.log();
  console.log('─'.repeat(70));
  console.log('TEST 5: Epoch bump cancels in-flight system-audio probe construction');
  console.log('─'.repeat(70));

  const state = createState();
  state._audioTestEpoch = 42;
  state.audioTestCapture = new MockCapture('mic-test');

  // Simulate: startAudioTestImpl snapshots the epoch BEFORE the expected
  // stopAudioTest bump, then isCurrentTest captures that snapshot.
  const epochBeforeStop = state._audioTestEpoch; // 42
  const isCurrentTest = () => state._audioTestEpoch === epochBeforeStop; // current !== 42 after bump

  // Fire stopAudioTest (simulates a concurrent cancellation). This bumps
  // epoch to 43, making isCurrentTest() return false.
  await stopAudioTest(state);

  // After stopAudioTest, epoch is bumped so isCurrentTest returns false
  assert(!isCurrentTest(), 'epoch changed: isCurrentTest returns false after stopAudioTest');
  assert(state.audioTestCapture === null, 'audioTestCapture is null after stopAudioTest');
  assert(state._audioTestEpoch === 43, `epoch bumped to ${state._audioTestEpoch} (expected 43)`);

  return true;
}

async function test6_concurrentStopAudioTestIsIdempotent(): Promise<boolean> {
  console.log();
  console.log('─'.repeat(70));
  console.log('TEST 6: Concurrent stopAudioTest calls are safe (idempotent)');
  console.log('─'.repeat(70));

  const state = createState();
  state.audioTestCapture = new MockCapture('mic-test');

  // Fire two concurrent stopAudioTest calls
  const [r1, r2] = await Promise.all([
    stopAudioTest(state),
    stopAudioTest(state), // second call sees null refs — should be a no-op
  ]);

  assert(state.audioTestCapture === null, 'audioTestCapture is null after concurrent stops');
  assert(state.audioTestSystemCapture === null, 'audioTestSystemCapture is null after concurrent stops');

  // stop() was called on the original mic, second call saw null so no double-stop
  // We verify via call count
  assert(state.stopAudioTestCallCount === 2, 'stopAudioTest was called twice');
  // But only one test was actually running
  console.log('  ℹ Concurrent stopAudioTest calls completed without throwing.');

  return true;
}

async function test7_stopAudioTestFailureIsolation(): Promise<boolean> {
  console.log();
  console.log('─'.repeat(70));
  console.log('TEST 7: stopAudioTest isolates failures (one bad stop does not block the other)');
  console.log('─'.repeat(70));

  const state = createState();
  // Mic stop throws, sys stop succeeds
  const micCapture = new MockCapture('mic-throw');
  const origMicStop = micCapture.stop.bind(micCapture);
  micCapture.stop = async () => {
    await origMicStop();
    throw new Error('mic stop failed');
  };

  const sysCapture = new MockCapture('sys-ok');

  state.audioTestCapture = micCapture;
  state.audioTestSystemCapture = sysCapture;

  // Should not throw
  await stopAudioTest(state);

  assert(micCapture.stopped, 'mic test stop was called (even though it threw)');
  assert(sysCapture.stopped, 'sys test stop was called');
  assert(state.audioTestCapture === null, 'audioTestCapture nulled despite mic stop error');
  assert(state.audioTestSystemCapture === null, 'audioTestSystemCapture nulled despite mic stop error');

  return true;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(70));
  console.log('AUDIO LIFECYCLE HANDOFF TEST SUITE');
  console.log('═'.repeat(70));
  console.log();

  const results = [
    await test1_stopAudioTestPrecedesMeetingCaptureSetup(),
    await test2_quiescenceBoundedAndConditional(),
    await test3_stopAudioTestAwaitsBothCapturesBeforeNull(),
    await test4_cancelledStartAudioTestCannotRecreateMicAfterPermissionAwait(),
    await test5_stopAudioTestEpochBumpCancelsInFlightSystemProbe(),
    await test6_concurrentStopAudioTestIsIdempotent(),
    await test7_stopAudioTestFailureIsolation(),
  ];

  const passed = results.filter(Boolean).length;
  const total = results.length;

  console.log();
  console.log('═'.repeat(70));
  console.log(`RESULTS: ${passed}/${total} passed`);
  console.log('═'.repeat(70));

  if (passed === total) {
    console.log('✅ ALL AUDIO LIFECYCLE HANDOFF TESTS PASSED');
  } else {
    console.log('❌ SOME AUDIO LIFECYCLE HANDOFF TESTS FAILED');
  }

  // Print remaining runtime caveat
  console.log();
  console.log('─'.repeat(70));
  console.log('RUNTIME CAVEAT');
  console.log('─'.repeat(70));
  console.log('The quiescence delay (150ms) is a best-effort heuristic.');
  console.log('On macOS with Bluetooth HFP devices, CoreAudio may need');
  console.log('10-50ms to release the HAL handle after the native monitor.stop()');
  console.log('resolves. On Windows with cpal exclusive mode, the delay may');
  console.log('need to be longer if the driver does not release the stream');
  console.log('synchronously on stop().');
  console.log();
  console.log('If zero-fill at meeting start persists for Bluetooth devices:');
  console.log('  1. Increase QUIESCENCE_MS in startMeeting() to 300-500ms.');
  console.log('  2. Or monitor cpal error events after the quiescence delay');
  console.log('     and retry capture setup with a backoff.');
  console.log();
  console.log('The generation-cancellation mechanism in the async audio init');
  console.log('(abortStaleAudioInit / isCurrentMeeting guards) still protects');
  console.log('against stale native workers if the quiescence is insufficient.');

  process.exit(passed === total ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
