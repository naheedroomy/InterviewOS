#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const requireNative = args.includes('--require-native');
const asarPath = args.find((arg) => !arg.startsWith('--'));

function fail(message) {
  console.error(`[verify-package-inputs] ${message}`);
  process.exitCode = 1;
}

function assertFile(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    fail(`Missing required file: ${relativePath}`);
    return;
  }
  console.log(`[verify-package-inputs] OK ${relativePath}`);
}

function assertAsarFile(archivePath, relativePath) {
  let asar;
  try {
    asar = require('@electron/asar');
  } catch (err) {
    fail(`Unable to load @electron/asar: ${err.message}`);
    return;
  }

  const candidates = [
    relativePath,
    relativePath.replaceAll('/', '\\'),
    relativePath.replaceAll('\\', '/'),
  ];

  for (const candidate of candidates) {
    try {
      const stat = asar.statFile(archivePath, candidate);
      if (stat) {
        console.log(`[verify-package-inputs] OK asar:${relativePath}`);
        return;
      }
    } catch {
      // Try the next path separator style.
    }
  }

  fail(`Missing required file in ${archivePath}: ${relativePath}`);
}

assertFile('dist/index.html');
assertFile('dist-electron/electron/main.js');

if (requireNative) {
  if (process.platform === 'linux') {
    fail('Linux is not a supported release target; native capture is unsupported on Linux.');
  } else if (process.platform === 'win32') {
    assertFile('native-module/index.win32-x64-msvc.node');
  } else if (process.platform === 'darwin') {
    if (args.includes('--all-mac-arches')) {
      assertFile('native-module/index.darwin-arm64.node');
      assertFile('native-module/index.darwin-x64.node');
    } else {
      assertFile(`native-module/index.darwin-${process.arch === 'arm64' ? 'arm64' : 'x64'}.node`);
    }
  } else {
    fail(`Unsupported platform for release package: ${process.platform}`);
  }
}

if (asarPath) {
  const archivePath = path.resolve(root, asarPath);
  if (!fs.existsSync(archivePath)) {
    fail(`Missing asar archive: ${asarPath}`);
  } else {
    assertAsarFile(archivePath, 'dist/index.html');
    assertAsarFile(archivePath, 'dist-electron/electron/main.js');
  }
}
