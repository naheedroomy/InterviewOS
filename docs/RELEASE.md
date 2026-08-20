# AnswerCue Release Process

_Review date: 2026-08-20_

This is the canonical release checklist for AnswerCue. It covers build/package commands, platform prerequisites, signing/notarization requirements, artifact checks, release-note requirements, and known limitation handling. Historical signing/notarization reports are archived under `docs/archive/` and are evidence only — they must not be used to claim signing or notarization is complete. See [README.md](README.md) for the documentation index and [PROJECT_STATUS.md](PROJECT_STATUS.md) for the current release-readiness status.

## Release channel

This app ships through GitHub Releases from the `FarzamHejaziK/AnswerCue` release channel. The update metadata must point to this repository so installed apps never read update notes or installers from the upstream project.

## Platform prerequisites

- Node.js 20+ or 22 LTS and npm.
- Rust/Cargo for the native audio module (`npm run build:native`).
- Xcode Command Line Tools/Xcode on macOS.
- For signed macOS builds: a Developer ID Application certificate in the login keychain (or `ANSWERCUE_SIGN_IDENTITY` / `CSC_NAME`), and a notarytool keychain profile (`answercue-notary`) or App Store Connect API key credentials.
- For signed Windows builds: Azure Trusted Signing credentials (see `electron-builder.windows.cjs`).

## Build and package commands

| Command | Purpose |
| --- | --- |
| `npm run app:build` | Unsigned/dev packaging via `electron-builder` (default config keeps `mac.identity: null`). |
| `npm run app:build:signed` | Production macOS packaging via `electron-builder.signed.cjs` (Developer ID + hardened runtime + notarization). |
| `npm run dist` | Alias for `npm run app:build`. |
| `npm run dist:signed` | Alias for `npm run app:build:signed`. |

Both commands run the full pipeline: `npm run build` (renderer), `npm run build:electron` (main/preload), `ANSWERCUE_BUILD_ALL_MAC_ARCHES=1 npm run build:native` (Rust module for both macOS arches), model download, sharp dependency setup, then `electron-builder`.

## Signing and notarization

**Signing/notarization state is unresolved and must be verified for each release.** Do not assume a previous build's signing status carries forward.

### macOS

The production signing path is `electron-builder.signed.cjs` (`npm run dist:signed`). It requires:

- **Signing identity:** Developer ID Application certificate, auto-discovered or set via `ANSWERCUE_SIGN_IDENTITY` / `CSC_NAME`.
- **Hardened runtime:** `hardenedRuntime: true` (required for notarization), with `build/entitlements.mac.plist` and `build/entitlements.mac.inherit.plist`.
- **Notarization:** `notarize: true` — electron-builder runs notarytool and staples the `.app`. Credentials come from the `answercue-notary` keychain profile (`APPLE_KEYCHAIN_PROFILE`) or App Store Connect API key environment variables.
- **DMG handling:** electron-builder's own DMG creation corrupts the embedded app signature, so the signed config builds only the `zip` target; `scripts/afterAllArtifactBuild.cjs` rebuilds the styled DMGs from the pristine signed `.app` via `create-dmg`, then signs, notarizes, and staples them, and verifies the updater ZIP manifest.

The default `package.json` `build.mac` keeps `identity: null` and `hardenedRuntime: false`; the default/dev path is intentionally unsigned.

### Windows

Windows packaging uses `electron-builder.windows.cjs`. When the Azure Trusted Signing environment variables are present, `azureSignOptions` is applied; otherwise the build is unsigned. Verify the signing state of the produced `.exe` for each release.

## Release checklist

1. Update the version in `package.json` and `package-lock.json`.
2. Add a top entry to `CHANGELOG.md`.
3. Add a release body under `.github/releases/vX.Y.Z.md`.
4. Commit the app, docs, icon, and workflow changes.
5. Push `main` and a matching `vX.Y.Z` tag.
6. Let GitHub Actions build and attach platform installers (`release-macos.yml` for macOS, `build-windows.yml` for Windows).
7. Verify the GitHub Release contains the artifacts below.

## Creating a release

```bash
npm version X.Y.Z --no-git-tag-version

git add package.json package-lock.json CHANGELOG.md .github/releases/vX.Y.Z.md
git commit -m "Release AnswerCue vX.Y.Z"
git push origin main

git tag vX.Y.Z
git push origin vX.Y.Z
```

If the release workflow is configured to create the GitHub Release from the tag, wait for Actions to finish. Otherwise create it manually:

```bash
gh release create vX.Y.Z \
  --repo FarzamHejaziK/AnswerCue \
  --title "AnswerCue vX.Y.Z" \
  --notes-file .github/releases/vX.Y.Z.md
```

## Platform artifacts

| Platform | Artifact | Notes |
| --- | --- | --- |
| macOS Apple Silicon | `AnswerCue-X.Y.Z-arm64-mac.zip` | Primary Apple Silicon build |
| macOS Intel | `AnswerCue-X.Y.Z.dmg`, `AnswerCue-X.Y.Z-mac.zip` | Intel x64 DMG plus updater ZIP |
| macOS update metadata | `latest-mac.yml` | Used by Electron updater |
| Windows Intel x64 | `AnswerCue-Setup-X.Y.Z.exe` | NSIS installer and updater target |
| Windows update metadata | `latest.yml` | Used by Electron updater |
| Linux AppImage | `AnswerCue-X.Y.Z.AppImage` | Portable Linux app |
| Linux Debian | `answercue_X.Y.Z_amd64.deb` | Debian/Ubuntu package |

## Artifact checks

For signed macOS builds, verify before publishing:

```bash
codesign -dv --verbose=4 /path/to/AnswerCue.app
codesign --verify --deep --strict --verbose=4 /path/to/AnswerCue.app
spctl -a -vvv -t execute /path/to/AnswerCue.app   # expect: accepted / source=Notarized Developer ID
xcrun stapler validate /path/to/AnswerCue.app
xcrun stapler validate /path/to/AnswerCue.dmg
```

The CI workflow (`release-macos.yml`) runs these checks and fails the build when signing/notarization secrets are present but verification fails. When signing secrets are absent, CI publishes unsigned artifacts with a warning — verify which case applies to each release.

## Release-note requirements

Every new release must include detailed release notes that explain:

- User-visible changes and fixed bugs.
- Packaging/signing status (signed + notarized, or unsigned with the reason).
- Supported platforms.
- Any known limitations.

Before creating a new public release, inspect existing GitHub releases for stale legacy branding, duplicate/broken assets, draft junk, and missing release notes. Clean up obvious junk releases or junk assets before publishing, but do not delete a release still needed for testing without explicit approval. If previous releases are missing useful notes, add or improve them when feasible before marking a new release as the primary/latest one.

## Known limitation handling

- **Unsigned macOS builds** may require a manual install step after download:

  ```bash
  xattr -cr /Applications/AnswerCue.app
  ```

- **Signed macOS builds** can use the standard Electron updater flow; unsigned builds may require the manual step above.
- **Windows** uses the NSIS installer and `latest.yml` metadata for in-place updates.
- **Signing/notarization must be verified for each release** — never assume it from an earlier build or from archived reports.

## Update behavior

AnswerCue checks the GitHub Releases feed for newer versions. Updates are shown inside the app as a quiet sidebar row, not as a modal promotion. Clicking the row downloads the newest installer/update metadata from the AnswerCue release channel.

## Versioning

Use semantic versioning:

```text
MAJOR.MINOR.PATCH
MAJOR.MINOR.PATCH-beta.N
```

Examples:

```text
2.7.3
2.8.0
3.0.0-beta.1
```

Stable public builds should use a plain version. Pre-release builds should be marked as pre-release on GitHub.