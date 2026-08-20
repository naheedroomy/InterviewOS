# AnswerCue Local Transcription Setup

_Review date: 2026-08-20_

This guide covers local speech-to-text (STT) setup for AnswerCue. It is part of the [AnswerCue documentation hub](README.md); see [ARCHITECTURE.md](ARCHITECTURE.md) for the transcription pipeline and [TESTING.md](TESTING.md) for the manual transcription check.

AnswerCue can transcribe interviews using the local Moonshine Base model. The local model is downloaded during setup and cached in app data, so you do not need to run a separate local transcription server.

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

`npm install` runs postinstall steps that rebuild native dependencies and download the embedding and classification models. It does **not** package the Moonshine STT model: the local speech model downloads during local-STT preflight into app data when local STT is selected and the model is not cached.

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

- The Moonshine Base model runs locally through a worker. It is downloaded during local-STT preflight into app data when local STT is selected and the model is not cached, and it is preloaded in the background at startup when local STT is selected and the model is cached.
- The default STT provider is the local Moonshine path (`local-whisper`). A cloud Google STT path exists and is selected only when the stored `sttProvider` setting is `google`.
- In Settings, the Speech Provider selector exposes two options: **Moonshine Base** (local) and **Google Cloud Speech-to-Text**. When Google is selected, Settings shows a Service Account JSON picker for the Google credentials. The Audio tab also exposes the input device, the output/system audio device, and audio levels or device status.

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

Local STT keeps **audio** on your device: speech is transcribed by the local Moonshine model, not sent to a cloud speech provider. If you select Google Cloud Speech-to-Text in Settings instead, interview audio is streamed to Google for transcription. Local STT does **not** mean prompts, transcripts, documents, or screenshots stay local. When an external LLM provider is selected and relevant data is included in a request, that data (for example a prompt, transcript, document, or screenshot that is selected or attached) is sent to the provider over the network. See the trust boundaries in [ARCHITECTURE.md](ARCHITECTURE.md) and the privacy policy in [PRIVACY.md](../PRIVACY.md).
