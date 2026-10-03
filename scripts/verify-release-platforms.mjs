#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

// 1. Import website download resolution helpers
const githubLib = await import(path.join(root, 'website/lib/github.ts'));
const { pickAsset, resolveAssetUrl } = githubLib;

console.log('[verify-release-platforms] Starting platform & download verification...');

// 2. Test deterministic asset matching for supported platforms
const sampleAssets = [
  { name: 'InterviewOS-3.3.0-arm64.dmg', browser_download_url: 'https://example.com/InterviewOS-3.3.0-arm64.dmg', size: 1000 },
  { name: 'InterviewOS-3.3.0-arm64-mac.zip', browser_download_url: 'https://example.com/InterviewOS-3.3.0-arm64-mac.zip', size: 900 },
  { name: 'InterviewOS-3.3.0.dmg', browser_download_url: 'https://example.com/InterviewOS-3.3.0.dmg', size: 1100 },
  { name: 'InterviewOS-3.3.0-mac.zip', browser_download_url: 'https://example.com/InterviewOS-3.3.0-mac.zip', size: 950 },
  { name: 'InterviewOS-Setup-3.3.0.exe', browser_download_url: 'https://example.com/InterviewOS-Setup-3.3.0.exe', size: 800 },
  { name: 'latest-mac.yml', browser_download_url: 'https://example.com/latest-mac.yml', size: 100 },
  { name: 'latest.yml', browser_download_url: 'https://example.com/latest.yml', size: 100 },
];

// Test Apple Silicon: native DMG first
const macArm = pickAsset(sampleAssets, 'mac-arm');
assert.equal(macArm?.name, 'InterviewOS-3.3.0-arm64.dmg', 'mac-arm must pick arm64 DMG');
console.log('✔ mac-arm deterministically picks arm64 DMG');

// Test Apple Silicon fallback to ZIP when DMG absent
const macArmNoDmg = pickAsset(sampleAssets.filter(a => !a.name.endsWith('.dmg')), 'mac-arm');
assert.equal(macArmNoDmg?.name, 'InterviewOS-3.3.0-arm64-mac.zip', 'mac-arm must fall back to arm64 zip when DMG absent');
console.log('✔ mac-arm falls back to arm64 zip when DMG is absent');

// Test Intel Mac: non-arm64 DMG
const macIntel = pickAsset(sampleAssets, 'mac-intel');
assert.equal(macIntel?.name, 'InterviewOS-3.3.0.dmg', 'mac-intel must pick non-arm64 Intel DMG');
console.log('✔ mac-intel deterministically picks Intel DMG');

// Test Intel Mac fallback to ZIP when DMG absent
const macIntelNoDmg = pickAsset(sampleAssets.filter(a => !a.name.endsWith('.dmg')), 'mac-intel');
assert.equal(macIntelNoDmg?.name, 'InterviewOS-3.3.0-mac.zip', 'mac-intel must fall back to Intel zip when DMG absent');
console.log('✔ mac-intel falls back to Intel zip when DMG is absent');

// Test Generic Mac: safe Intel DMG compatible with all Macs
const macGeneric = pickAsset(sampleAssets, 'mac');
assert.equal(macGeneric?.name, 'InterviewOS-3.3.0.dmg', 'generic mac must pick universal Intel DMG');
console.log('✔ generic mac deterministically picks compatible DMG');

// Test Windows: setup .exe
const winAsset = pickAsset(sampleAssets, 'windows');
assert.equal(winAsset?.name, 'InterviewOS-Setup-3.3.0.exe', 'windows must pick setup EXE');
console.log('✔ windows deterministically picks setup EXE');

// 3. Test rejection of unsupported or unavailable platforms
const unsupportedPlatforms = ['linux', 'linux-x64', 'deb', 'appimage', 'android', 'ios', 'unknown', ''];
for (const bad of unsupportedPlatforms) {
  const result = pickAsset(sampleAssets, bad);
  assert.equal(result, null, `unsupported platform '${bad}' must return null`);
}
console.log('✔ unsupported platforms are rejected by asset picker (return null)');

// Test unavailable assets
const winOnly = sampleAssets.filter(a => a.name.endsWith('.exe'));
assert.equal(pickAsset(winOnly, 'mac-arm'), null, 'mac-arm must return null when only windows assets exist');
assert.equal(pickAsset(winOnly, 'mac-intel'), null, 'mac-intel must return null when only windows assets exist');

const macOnly = sampleAssets.filter(a => !a.name.endsWith('.exe'));
assert.equal(pickAsset(macOnly, 'windows'), null, 'windows must return null when only mac assets exist');
assert.equal(pickAsset([], 'windows'), null, 'empty assets must return null');
console.log('✔ unavailable platform assets return null (no spurious matching)');

// 4. Test resolveAssetUrl across release history
const multiReleases = [
  {
    tag: 'v3.3.0',
    htmlUrl: 'https://example.com/v3.3.0',
    publishedAt: '2026-09-24T00:00:00Z',
    assets: [
      { name: 'InterviewOS-3.3.0-arm64.dmg', browser_download_url: 'https://example.com/v3.3.0/arm64.dmg', size: 1000 },
      { name: 'InterviewOS-3.3.0.dmg', browser_download_url: 'https://example.com/v3.3.0/intel.dmg', size: 1100 },
    ],
  },
  {
    tag: 'v3.2.0',
    htmlUrl: 'https://example.com/v3.2.0',
    publishedAt: '2026-09-20T00:00:00Z',
    assets: [
      { name: 'InterviewOS-Setup-3.2.0.exe', browser_download_url: 'https://example.com/v3.2.0/setup.exe', size: 800 },
    ],
  },
];

assert.equal(resolveAssetUrl(multiReleases, 'mac-arm'), 'https://example.com/v3.3.0/arm64.dmg');
assert.equal(resolveAssetUrl(multiReleases, 'mac-intel'), 'https://example.com/v3.3.0/intel.dmg');
assert.equal(resolveAssetUrl(multiReleases, 'windows'), 'https://example.com/v3.2.0/setup.exe', 'resolves windows from prior release if missing in latest');
assert.equal(resolveAssetUrl(multiReleases, 'linux'), null, 'unsupported platform returns null from resolveAssetUrl');
console.log('✔ resolveAssetUrl resolves newest available asset and returns null when unavailable');

// 5. Verify website API route enforcement
const routePath = path.join(root, 'website/app/api/download/[platform]/route.ts');
const routeSrc = fs.readFileSync(routePath, 'utf8');
assert.match(routeSrc, /const VALID:\s*Platform\[\]\s*=\s*\["mac",\s*"mac-arm",\s*"mac-intel",\s*"windows"\]/, 'route must specify exact supported platforms');
assert.match(routeSrc, /status:\s*400/, 'route must reject unsupported platforms with 400 Bad Request');
assert.match(routeSrc, /status:\s*404/, 'route must reject unavailable assets with 404 Not Found');
console.log('✔ website download API route enforces valid platform list and status codes');

// 6. Verify single source of truth across package.json and docs
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.ok(packageJson.build?.mac, 'package.json must configure mac targets');
assert.ok(packageJson.build?.win, 'package.json must configure win targets');
assert.equal(packageJson.build?.linux, undefined, 'package.json must NOT declare unsupported linux targets');
console.log('✔ package.json build configuration matches verified platforms (macOS, Windows; no Linux)');

const releaseDoc = fs.readFileSync(path.join(root, 'docs/RELEASE.md'), 'utf8');
assert.match(releaseDoc, /macOS Apple Silicon/, 'RELEASE.md must document macOS Apple Silicon');
assert.match(releaseDoc, /macOS Intel/, 'RELEASE.md must document macOS Intel');
assert.match(releaseDoc, /Windows Intel x64/, 'RELEASE.md must document Windows Intel x64');
assert.match(releaseDoc, /Linux is not a supported target/, 'RELEASE.md must explicitly document that Linux is not a supported target');
console.log('✔ docs/RELEASE.md matches verified platforms and documents Linux boundary');

console.log('\n[verify-release-platforms] ALL RELEASE PLATFORM CHECKS PASSED ✔');
