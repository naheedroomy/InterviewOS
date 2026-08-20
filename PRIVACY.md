# Privacy Policy

_Last updated: June 14, 2026_

This policy describes the current AnswerCue desktop app behavior.

## Short Version

AnswerCue is designed to keep interview data on your device by default.

- Prep chat, selected document Markdown, transcripts, AI responses, post-interview chat, settings, and interview history are stored locally.
- Uploaded documents are ingested locally into Markdown.
- Transcription uses the local Moonshine Base model by default. Google Cloud Speech-to-Text is selectable in Settings and sends interview audio to Google when selected.
- LLM prompts are sent to the AI provider the user configures and selects: OpenAI, Google Gemini, or Anthropic Claude.
- A cloud speech provider is used only when you select Google Cloud Speech-to-Text in Settings.
- AnswerCue does not sell user data.

## Data Stored Locally

AnswerCue may store the following on your device:

- AI provider keys saved in Settings.
- Custom Instructions and AI Persona.
- Ingested Custom Instructions file Markdown.
- Uploaded document Markdown and document metadata.
- Prep chat messages.
- Live transcript entries.
- Generated AI responses.
- Interview titles and lifecycle state.
- Post-interview chat history.
- Help Assistant chat history.
- Audio and permission settings.
- Theme and UI preferences.

Protect your machine with full-disk encryption such as FileVault on macOS or BitLocker on Windows.

## Data Sent To AI Providers

When you ask AnswerCue to generate an answer, prep response, post-interview response, or help response, relevant prompt context may be sent to the selected provider.

That context can include:

- Custom Instructions.
- AI Persona.
- Prep chat.
- Selected document Markdown.
- Live transcript.
- AI responses already generated.
- Relevant screenshots attached to a request.
- The current user request.

Review the privacy terms of the provider you configure. AnswerCue cannot control provider-side retention or training policies.

## Transcription

Speech transcription uses the local Moonshine Base model by default. The model weights download during local-STT setup/preflight and are cached locally, so interview audio stays on your device on the local path. If you select Google Cloud Speech-to-Text in Settings, interview audio is streamed to Google for transcription. Review Google's privacy terms for the speech service you configure; AnswerCue cannot control provider-side retention or training policies.

## Documents

Supported document uploads:

- Markdown
- TXT
- PDF
- DOCX

Documents are ingested locally into Markdown and can be reused across interviews. If a document is attached to a message or selected for an interview, its ingested Markdown can be included in prompts sent to the selected LLM provider.

## Permissions

AnswerCue may request:

- Microphone permission for user speech.
- Screen Recording or screen-capture permission for system audio and screen-aware workflows.
- Accessibility permission on macOS for shortcuts or window behavior.
- Network access for LLM provider calls and update checks.

You can revoke permissions in the operating-system settings, but related features may stop working.

## Update Checks

Update checks use GitHub release infrastructure for:

<https://github.com/FarzamHejaziK/AnswerCue/releases>

Update checks can reveal app version, operating system, and architecture to GitHub in the normal way GitHub-hosted release checks work.

## Logs

Debug logs should not contain provider keys or full sensitive payloads. If you share logs for support, review them first and remove private details.

## Open Source

The source code is available at:

<https://github.com/FarzamHejaziK/AnswerCue>

The project is licensed under AGPL-3.0.
