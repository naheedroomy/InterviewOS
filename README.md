<p align="center">
  <img src="assets/readme/answercue-banner.png" alt="InterviewOS Desktop Workspace" width="100%">
</p>

# InterviewOS

**Open-source desktop interview operating system for prep, live transcription, real-time answer support, and post-interview follow-up.**

[![License](https://img.shields.io/badge/License-AGPL--3.0-blue?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-6D5DF6?style=flat-square)](https://github.com/naheedroomy/InterviewOS/releases)
[![Latest Release](https://img.shields.io/github/v/release/naheedroomy/InterviewOS?style=flat-square&color=22C55E)](https://github.com/naheedroomy/InterviewOS/releases/latest)

[Download Latest Release](https://github.com/naheedroomy/InterviewOS/releases/latest) ·
[Report an Issue](https://github.com/naheedroomy/InterviewOS/issues) ·
[View Source](https://github.com/naheedroomy/InterviewOS)

Requires macOS 12+ on Apple Silicon or Intel, or Windows 10/11 on Intel/AMD 64-bit.

InterviewOS is a desktop interview workspace for preparing context, transcribing live interviews, and continuing the conversation afterward with relevant history available as context, subject to retrieval and context limits.

It is designed around one flow:

1. Configure your AI provider, audio devices, and permissions.
2. Create a new interview workspace.
3. Build context in the prep chat and attach reusable documents from the Knowledge Bank.
4. Start the live interview when your meeting app is ready.
5. Review transcript, AI answers, and follow-up chat after the interview ends.

## Download

Installers are published from GitHub Releases.

| Platform | Download | Notes |
| --- | --- | --- |
| Windows 10/11 x64 | [Latest release assets](https://github.com/naheedroomy/InterviewOS/releases/latest) | NSIS installer. Current builds are configured for Azure Artifact Signing through the repository signing secrets. |
| macOS Apple Silicon | [Latest release assets](https://github.com/naheedroomy/InterviewOS/releases/latest) | Use the Apple Silicon ZIP/DMG artifact when available. |
| macOS Intel | [Latest release assets](https://github.com/naheedroomy/InterviewOS/releases/latest) | Use the Intel DMG/ZIP artifact when available. |

If your operating system warns about an unsigned or newly signed build, make sure you downloaded it from the official InterviewOS release page.

## Why InterviewOS?

- **Interview-first flow:** prep chat, reusable docs, live interview transcript, AI answers, and post-interview follow-up all stay in one interview timeline.
- **Dedicated Knowledge Bank:** manage resumes, cheat sheets, and job descriptions in one library with cross-interview usage badges.
- **Role & Persona Overrides:** tune AI instructions and candidate background per interview workspace.
- **Executive Charcoal & Amber UI:** minimalist, distraction-free desktop interface built to the Impeccable craft standard.
- **Bring your own provider key:** OpenAI, Google Gemini, and Anthropic Claude are supported from Settings.
- **Local transcription path:** Moonshine Base runs locally after setup, so live transcription works without a cloud speech provider; Google Cloud Speech-to-Text is also selectable in Settings when you prefer cloud transcription.
- **Reusable document context:** Markdown, TXT, PDF, and DOCX files are ingested into Markdown locally and can be attached across interviews.
- **Persistent interview memory:** prep chat, selected docs, transcript, AI responses, and post-interview chat are saved so you can reopen an interview later.
- **Help assistant:** a persistent help chat backed by the in-app InterviewOS Help Guide and your selected main LLM.

## Privacy

InterviewOS is designed to keep interview data on your device by default: prep chat, documents, transcripts, AI responses, settings, and interview history are stored locally, and transcription uses the local Moonshine Base model by default (Google Cloud Speech-to-Text is selectable in Settings and sends audio to Google when selected). When you generate an answer, relevant prompt context — including transcripts, documents, or screenshots when included — is sent to the AI provider you configure and select. See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md) for details.

## Documentation

Current architecture, status, roadmap, testing, release, and local transcription details live in the [documentation hub](docs/README.md).

- [Project status](docs/PROJECT_STATUS.md) — verified shipped capabilities, known gaps, and validation state.
- [Architecture](docs/ARCHITECTURE.md) — system boundaries, core flows, and trust boundaries.
- [Testing](docs/TESTING.md) — test commands, test layers, and manual Electron checks.
- [Release](docs/RELEASE.md) — build, signing, and packaging checklist.
- [Local transcription setup](docs/LOCAL_STT_ANSWERCUE_SETUP.md) — local STT setup and troubleshooting.

## Local Development

Recommended stack:

- Node.js 20+ or 22 LTS
- npm
- Rust and Cargo for the native audio module
- Xcode Command Line Tools on macOS

Install dependencies:

```bash
npm install
```

Build the native audio module:

```bash
npm run build:native
```

Run locally:

```bash
npm start
```

This starts Vite on `http://localhost:5180` and launches Electron.

Fast checks:

```bash
npm run build:electron
npx tsc --noEmit
```

Run the full service test suite only when needed:

```bash
npm test
```

## Repository and Git Workflow

Main repository:

```bash
https://github.com/naheedroomy/InterviewOS
```

Clone:

```bash
git clone https://github.com/naheedroomy/InterviewOS.git
cd InterviewOS
```

This checkout tracks `origin` (`https://github.com/naheedroomy/InterviewOS.git`). Push InterviewOS work to `origin`. Prefer merge over rebase on shared/public branches so public history is not rewritten.

## License

This fork remains under the original AGPL-3.0 license. If you publish modified versions, keep the license notices and make corresponding source available as required by AGPL-3.0.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before opening issues or pull requests.
