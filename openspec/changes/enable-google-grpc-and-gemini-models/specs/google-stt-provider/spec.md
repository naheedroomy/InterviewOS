## ADDED Requirements

### Requirement: Provider options are limited to Moonshine Base and Google Cloud

The system SHALL present exactly two STT provider choices before an interview: **Moonshine Base** (internal ID `local-whisper`) as the default and **Google Cloud**. No other provider labels or options SHALL be shown in the provider selector.

#### Scenario: Two choices rendered in provider selector
- **WHEN** the user opens the pre-interview STT provider selector
- **THEN** the selector SHALL display exactly two options labeled "Moonshine Base" and "Google Cloud"

#### Scenario: Moonshine Base is preselected by default
- **WHEN** the user has not previously selected an STT provider
- **THEN** Moonshine Base SHALL be preselected and the persisted value SHALL be `local-whisper`

### Requirement: Provider selection persists and is pre-interview only

The system SHALL persist the user's STT provider choice across app restarts. Provider selection SHALL be settable only before an interview starts; the system SHALL NOT allow changing the provider while an interview is in progress. Unknown or legacy persisted provider values (any value other than `local-whisper` or `google`) SHALL normalize to `local-whisper` on read.

#### Scenario: Selection persists between sessions
- **WHEN** the user selects Google Cloud and restarts the application
- **THEN** the provider selector SHALL show Google Cloud as the selected option

#### Scenario: Provider change blocked during an active interview
- **WHEN** the user attempts to change the STT provider while an interview is running
- **THEN** the system SHALL reject the change and the provider selector SHALL be disabled or hidden

#### Scenario: Unknown legacy ID normalizes to local-whisper
- **WHEN** the persisted provider value is an unrecognized string (e.g., `"whisper.cpp"`, `"azure-stt"`, or `""`)
- **THEN** the system SHALL treat the selection as `local-whisper` (canonical ID `google` is the only alternate valid value) and display "Moonshine Base" as selected

### Requirement: Google Cloud uses external service-account JSON file picker

When Google Cloud is selected, the system SHALL provide a file-picker widget for selecting a Google service-account JSON file. The picker SHALL use the existing Natively-style external file-path behavior: the path is stored as a string, no custom JSON content validation is performed on the file contents at selection time, and the "Start Interview" button SHALL be disabled when no valid saved path exists.

#### Scenario: Service-account file picker is shown for Google Cloud
- **WHEN** Google Cloud is the selected provider
- **THEN** the system SHALL display a file-picker widget labelled for Google service-account JSON selection

#### Scenario: File picker uses Natively-style external path storage
- **WHEN** the user selects a service-account JSON file via the picker
- **THEN** the system SHALL store the absolute file path as a string and SHALL NOT parse or validate the JSON contents at selection time

#### Scenario: Start is unavailable without a saved path
- **WHEN** Google Cloud is selected and no service-account JSON path has been saved
- **THEN** the "Start Interview" button SHALL be disabled and the UI SHALL display a message indicating a service-account file is required

#### Scenario: Start is available once a path is saved
- **WHEN** Google Cloud is selected and a service-account JSON path has been saved
- **THEN** the "Start Interview" button SHALL be enabled

### Requirement: Connection and auth failures surface to the user

The system SHALL attempt gRPC connection and authentication when an interview starts with Google Cloud selected. If the connection or authentication fails (invalid credentials, network unreachable, project misconfigured, etc.), the system SHALL surface a descriptive error to the user and SHALL NOT silently fall back to Moonshine Base or any other provider. The system SHALL NOT transmit audio to any provider other than the one explicitly selected.

#### Scenario: Auth failure surfaces error and does not fall back
- **WHEN** the interview starts with Google Cloud selected and authentication fails (e.g., invalid service-account JSON or revoked key)
- **THEN** the system SHALL display an error message describing the authentication failure and SHALL NOT start the interview or fall back to Moonshine Base

#### Scenario: Network failure surfaces error
- **WHEN** the interview starts with Google Cloud selected and the gRPC endpoint is unreachable
- **THEN** the system SHALL display a network-connection error message and SHALL NOT start the interview

#### Scenario: Audio never sent to a non-selected provider
- **WHEN** Google Cloud is selected and connection/auth fails
- **THEN** the system SHALL NOT transmit any audio to Moonshine Base or any other STT provider

### Requirement: Google STT opens gRPC streams for both interviewer and user channels

When an interview starts with Google Cloud selected, the system SHALL create two bidirectional gRPC streams using the existing transcript contracts: one for the interviewer/system audio channel and one for the user/mic audio channel. The system SHALL use the selected service-account credentials to authenticate these streams. When the interview ends, the system SHALL flush any trailing final transcription results before closing the streams.

#### Scenario: Two gRPC streams are created on start
- **WHEN** an interview starts with Google Cloud selected and credentials are valid
- **THEN** the system SHALL open one gRPC `StreamingRecognize` stream for the interviewer/system channel and one for the user/mic channel, both authenticated with the saved service account

#### Scenario: End of interview flushes trailing finals
- **WHEN** the interview ends while Google Cloud STT streams are active
- **THEN** the system SHALL send a final recognition request to flush pending results and wait for final transcription responses before closing each stream

### Requirement: Moonshine preload is skipped when Google Cloud is selected

The system SHALL NOT preload or initialize Moonshine Base models when the selected STT provider is Google Cloud.

#### Scenario: Moonshine model not loaded for Google Cloud
- **WHEN** Google Cloud is selected as the STT provider
- **THEN** the system SHALL skip any Moonshine model preloading or initialization steps

#### Scenario: Moonshine is preloaded normally for local-whisper
- **WHEN** Moonshine Base (`local-whisper`) is selected as the STT provider
- **THEN** the system SHALL preload and initialize the Moonshine model as usual

### Requirement: Byte-exact all-zero PCM chunks are dropped before Google STT

The system SHALL drop byte-exact all-zero PCM audio chunks before sending them to the Google Cloud STT gRPC stream. Non-zero chunks SHALL be forwarded without modification.

#### Scenario: All-zero chunk is dropped
- **WHEN** a PCM audio chunk consists entirely of zero-valued bytes
- **THEN** the system SHALL discard the chunk and SHALL NOT send it to the Google STT gRPC stream

#### Scenario: Non-zero chunk is preserved
- **WHEN** a PCM audio chunk contains any non-zero byte
- **THEN** the system SHALL forward the chunk unchanged to the Google STT gRPC stream
