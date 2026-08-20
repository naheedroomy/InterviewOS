# AnswerCue Local Transcription Setup

_Review date: 2026-08-20_

This guide covers local speech-to-text (STT) setup for AnswerCue. It is part of the [AnswerCue documentation hub](README.md); see [ARCHITECTURE.md](ARCHITECTURE.md) for the transcription pipeline and [TESTING.md](TESTING.md) for the manual transcription check.

AnswerCue uses a packaged local Moonshine Base model for transcription. The user should not need to choose a cloud speech provider or configure a separate local transcription server.

## Prerequisites

- Node.js 20+ or 22 LTS and npm.
- Rust/Cargo for the native audio module.
- Xcode Command Line Tools on macOS.
- Microphone and system-audio permissions for the app (macOS: Microphone, Screen Recording, and Accessibility if prompted).

## Setup

Install dependencies:

```bash
npm install
```

`npm install` runs postinstall steps that download the local transcription model and rebuild native dependencies.

Build native audio support:

```bash
npm run build:native
```

Run the app:

```bash
npm start
```

This starts Vite on `http://localhost:5180` and launches Electron.

## Supported local-model behavior

- The packaged Moonshine Base model runs locally through a worker and is preloaded in the background at startup.
- The default STT provider is the local Moonshine path (`local-whisper`). A cloud Google STT path exists and is selected only when the stored `sttProvider` setting is `google`.
- In Settings, Audio should focus on the input device, the output/system audio device, and audio levels or device status. It should not expose speech-provider selection, WhisperLive setup, cloud transcription keys, test-sound controls that are no longer part of the current UI, or SCK backend controls that were removed from the current right panel.

## Manual transcription check

1. Open Settings.
2. Confirm the microphone input device.
3. Confirm the output/system audio device used by the meeting app.
4. Create a New Interview.
5. Add a short prep-chat note.
6. Start the interview.
7. Speak into the selected microphone and confirm your voice appears.
8. Play meeting audio through the selected output device and confirm interviewer audio appears.
9. End the interview.
10. Confirm the transcript and post-interview chat persist after reopening the interview.

## Troubleshooting

If your voice appears but the interviewer does not:

- The microphone path is working.
- Check the meeting app output device.
- Match that output device in AnswerCue.
- Check macOS Screen Recording/system-audio permission if applicable.

If the interviewer appears but your voice does not:

- Check the selected input device.
- Check microphone permission.
- Confirm another app is not exclusively using the mic.

If neither side appears:

- Confirm the interview is started.
- Restart the app after changing permissions.
- Rebuild the native audio module if local development audio capture is missing.

## Local speech recognition vs. external LLM data transfer

Local STT keeps **audio** on your device: speech is transcribed by the packaged local model, not sent to a cloud speech provider. This does **not** mean prompts, transcripts, documents, or screenshots stay local. When an external LLM provider is selected and relevant data is included in a request, that data (for example a prompt, transcript, document, or screenshot that is selected or attached) is sent to the provider over the network. See the trust boundaries in [ARCHITECTURE.md](ARCHITECTURE.md) and the privacy policy in [PRIVACY.md](../PRIVACY.md).
