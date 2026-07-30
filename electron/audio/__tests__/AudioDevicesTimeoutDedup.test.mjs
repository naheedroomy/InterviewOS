// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.resolve(__dirname, '../../../dist-electron/electron/audio');

// ── Test the timeout/dedup/cache logic directly by constructing
//    AudioDevices with a mocked native module through Module._load
//    (the pattern used by SystemAudioOrphanHandleOnStartFailure.test.mjs).

import Module from 'node:module';
const origLoad = Module._load;

let calls = { inputCalls: 0, outputCalls: 0 };
let delay = 0;
let shouldThrow = false;

Module._load = function patched(request, _parent, _isMain) {
  if (request.endsWith('.node') || request.includes('native-module')) {
    return {
      nativeModuleHealthCheck() { return true; },
      getHardwareId: () => 'fake-hw',
      verifyGumroadKey: async () => 'OK',
      getInputDevices() {
        calls.inputCalls++;
        if (shouldThrow) return Promise.reject(new Error('simulated-failure'));
        if (delay > 0) return new Promise(r => setTimeout(r, delay)).then(() => [
          { id: 'default', name: 'Default Microphone' },
          { id: 'mic1', name: 'Built-in Microphone' },
          { id: 'usb-mic', name: 'USB Audio Device' },
        ]);
        return Promise.resolve([
          { id: 'default', name: 'Default Microphone' },
          { id: 'mic1', name: 'Built-in Microphone' },
          { id: 'usb-mic', name: 'USB Audio Device' },
        ]);
      },
      getOutputDevices() {
        calls.outputCalls++;
        if (shouldThrow) return Promise.reject(new Error('simulated-failure'));
        if (delay > 0) return new Promise(r => setTimeout(r, delay)).then(() => [
          { id: 'default', name: 'Default Speakers' },
          { id: 'hdmi', name: 'HDMI Display Audio' },
        ]);
        return Promise.resolve([
          { id: 'default', name: 'Default Speakers' },
          { id: 'hdmi', name: 'HDMI Display Audio' },
        ]);
      },
      getDefaultOutputDeviceId() { return Promise.resolve('default'); },
      SystemAudioCapture: class Fake {
        constructor() { this.getSampleRate = () => 48000; }
        start() {}
        stop() {}
      },
      MicrophoneCapture: class Fake {
        constructor() { this.getSampleRate = () => 48000; }
        start() {}
        stop() {}
      },
    };
  }
  if (request === 'electron') {
    return {
      app: {
        getAppPath: () => '/tmp/fake',
        isPackaged: false,
        isReady: () => false,
      },
    };
  }
  return origLoad.apply(this, arguments);
};

// Import once at module scope (ESM cache means all tests share the instance).
const { AudioDevices } = await import(path.join(distRoot, 'AudioDevices.js'));

describe('AudioDevices — timeout / dedup / cache', () => {

  it('returns device arrays on first call', async () => {
    calls.inputCalls = 0;
    calls.outputCalls = 0;
    AudioDevices.clearCache();

    const inputs = await AudioDevices.getInputDevices();
    const outputs = await AudioDevices.getOutputDevices();

    assert.equal(calls.inputCalls, 1, 'should call native once');
    assert.equal(calls.outputCalls, 1, 'should call native once');
    assert.ok(Array.isArray(inputs));
    assert.equal(inputs.length, 3);
    assert.equal(outputs.length, 2);
  });

  it('deduplicates concurrent input calls', async () => {
    calls.inputCalls = 0;
    AudioDevices.clearCache();
    delay = 50;

    const [r1, r2] = await Promise.all([
      AudioDevices.getInputDevices(),
      AudioDevices.getInputDevices(),
    ]);
    delay = 0;

    assert.equal(calls.inputCalls, 1, 'concurrent calls should deduplicate');
    assert.deepEqual(r1, r2);
    assert.equal(r1.length, 3);
  });

  it('deduplicates concurrent output calls', async () => {
    calls.outputCalls = 0;
    AudioDevices.clearCache();
    delay = 50;

    const [r1, r2] = await Promise.all([
      AudioDevices.getOutputDevices(),
      AudioDevices.getOutputDevices(),
    ]);
    delay = 0;

    assert.equal(calls.outputCalls, 1, 'concurrent calls should deduplicate');
    assert.deepEqual(r1, r2);
  });

  it('uses cached result on repeated calls within TTL', async () => {
    calls.inputCalls = 0;
    AudioDevices.clearCache();

    await AudioDevices.getInputDevices();
    assert.equal(calls.inputCalls, 1, 'first call touches native');

    await AudioDevices.getInputDevices();
    assert.equal(calls.inputCalls, 1, 'second call is a cache hit');
  });

  it('returns empty array on native error', async () => {
    calls.inputCalls = 0;
    AudioDevices.clearCache();
    shouldThrow = true;

    const result = await AudioDevices.getInputDevices();
    shouldThrow = false;

    assert.equal(calls.inputCalls, 1, 'should have called native');
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 0, 'should return empty on error');
  });

  it('clearCache() forces next call to go native', async () => {
    calls.inputCalls = 0;
    AudioDevices.clearCache();

    await AudioDevices.getInputDevices();
    assert.equal(calls.inputCalls, 1, 'first call touches native');

    AudioDevices.clearCache();
    await AudioDevices.getInputDevices();
    assert.equal(calls.inputCalls, 2, 'post-clear call touches native again');
  });
});
