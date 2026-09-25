export type PreloadRole = 'launcher' | 'overlay' | 'settings' | 'model-selector' | 'cropper';

const CROPPER_API_KEYS = ['cropperConfirmed', 'cropperCancelled', 'onResetCropper'] as const;

// The selector is a separate, short-lived surface. These are its UI methods and
// the app/theme initialization methods used by App and useResolvedTheme.
const MODEL_SELECTOR_API_KEYS = [
  'platform',
  'getThemeMode',
  'onThemeChanged',
  'getStoredCredentials',
  'getCustomProviders',
  'getCodexCliConfig',
  'getAvailableOllamaModels',
  'forceRestartOllama',
  'fetchProviderModels',
  'getCurrentLlmConfig',
  'onModelChanged',
  'setModel',
  'getAnalyticsConsent',
  'onAnalyticsConsentChanged',
  'profileGetStatus',
  'licenseGetDetails',
  'licenseCheckPremiumAsync',
  'licenseCheckPremium',
  'getTrialStatus',
  'getLocalTrial',
  'onTrialEnded',
  'onOpenSettingsTab',
  'onMeetingsUpdated',
  'onOllamaPullProgress',
  'onOllamaPullComplete',
  'onIncompatibleProviderWarning',
  'onLicenseStatusChanged',
] as const;

// Renderer usage inventory from src/**. This keeps ordinary windows from
// inheriting bridge methods that have no renderer caller; newly added methods
// are denied until a renderer use is reviewed and added here.
const RENDERER_API_KEYS = new Set([
  'acceptDynamicAction', 'calendarConnect', 'calendarDisconnect', 'calendarRefresh', 'cancelChatStream',
  'checkForUpdates', 'checkPermissions', 'clearCompactLatch', 'convertTrial', 'cropperCancelled',
  'cropperConfirmed', 'dismissDynamicAction', 'downloadUpdate', 'endMeeting', 'endTrialByok',
  'fetchProviderModels', 'fileExists', 'forceRestartOllama', 'generateBrainstorm', 'generateClarify',
  'generateCodeHint', 'generateFollowUp', 'generateFollowUpQuestions', 'generateRecap', 'generateWhatToSay',
  'getActionButtonMode', 'getAiResponseLanguage', 'getAiResponseLanguages', 'getAnalyticsConsent', 'getAnswerCueUsage',
  'getArch', 'getAvailableOllamaModels', 'getCalendarStatus', 'getCanAutoUpdate', 'getCodexCliConfig',
  'getCurrentLlmConfig', 'getCustomProviders', 'getDefaultModel', 'getDisguise', 'getDonationStatus',
  'getInputDevices', 'getKeybinds', 'getLocalTrial', 'getMeetingActive', 'getMeetingDetails',
  'getMeetingRetention', 'getNativeAudioStatus', 'getOpenAtLogin', 'getOsVersion', 'getOutputDevices',
  'getOverlayExpanded', 'getOverlayMousePassthrough', 'getOverlaySizingMode', 'getProviderDataScopes', 'getRecentMeetings',
  'getRecognitionLanguages', 'getStoredCredentials', 'getSttLanguage', 'getThemeMode', 'getTrialStatus',
  'getUndetectable', 'getUpcomingEvents', 'getVerboseLogging', 'hideWindow', 'interviewDocsBatchUpload',
  'interviewDocsDelete', 'interviewDocsList', 'interviewDocsSelectFiles', 'interviewDocsUpdateMetadata', 'interviewWorkspaceAddRound',
  'interviewWorkspaceBeginRun', 'interviewWorkspaceCreate', 'interviewWorkspaceDelete', 'interviewWorkspaceFinishMeeting', 'interviewWorkspaceGetById',
  'interviewWorkspaceGetByMeeting', 'interviewWorkspaceList', 'interviewWorkspaceRename', 'interviewWorkspaceRenameRound', 'interviewWorkspaceResolveDraft',
  'interviewWorkspaceSave', 'interviewWorkspaceSetActiveRound', 'interviewWorkspaceStartMeeting', 'interviewWorkspaceSyncLlmContext', 'interviewWorkspaceUpdateDocuments',
  'interviewWorkspaceUpdateModelOverride', 'interviewWorkspaceUpdatePersonaOverrides', 'interviewWorkspaceUpdatePrep', 'interviewWorkspaceUpdateRoundPrep', 'knowledgeBankGetDocumentUsage',
  'licenseCheckPremium', 'licenseCheckPremiumAsync', 'licenseGetDetails', 'localWhisperDeleteModel', 'localWhisperGetHardware',
  'localWhisperGetModels', 'localWhisperSetModel', 'localWhisperStartDownload', 'markDonationToastShown', 'modelSelectorCloseIfOpen',
  'modesSetActive', 'moveWindowDown', 'moveWindowLeft', 'moveWindowRight', 'moveWindowUp',
  'onActionButtonModeChanged', 'onAnalyticsConsentChanged', 'onAudioCaptureFailed', 'onAudioTestLevel', 'onAudioTestSystemError',
  'onAudioTestSystemLevel', 'onCaptureAndProcess', 'onCredentialsChanged', 'onDeviceSelectionApplied', 'onDisguiseChanged',
  'onDownloadProgress', 'onEnsureExpanded', 'onGeminiStreamDone', 'onGeminiStreamError', 'onGeminiStreamToken',
  'onGlobalShortcut', 'onGroqFastTextChanged', 'onIncompatibleProviderWarning', 'onIntelligenceClarify', 'onIntelligenceDynamicAction',
  'onIntelligenceError', 'onIntelligenceFollowUpQuestionsToken', 'onIntelligenceFollowUpQuestionsUpdate', 'onIntelligenceManualResult', 'onIntelligenceNegotiationCoaching',
  'onIntelligenceRecap', 'onIntelligenceRecapToken', 'onIntelligenceRefinedAnswer', 'onIntelligenceRefinedAnswerToken', 'onIntelligenceSuggestedAnswer',
  'onIntelligenceSuggestedAnswerToken', 'onIntelligenceTokenBatch', 'onInterviewDocsChanged', 'onKeybindRegistrationFailed', 'onLicenseStatusChanged',
  'onLocalWhisperDownloadComplete', 'onLocalWhisperDownloadError', 'onLocalWhisperDownloadProgress', 'onMeetingInterfaceThemeChanged', 'onMeetingRetentionChanged',
  'onMeetingStateChanged', 'onMeetingsUpdated', 'onModelChanged', 'onNativeAudioConnected', 'onNativeAudioDisconnected',
  'onNativeAudioTranscript', 'onOllamaPullComplete', 'onOllamaPullProgress', 'onOpenSettingsTab', 'onOverlayExpandedChanged',
  'onOverlayMousePassthroughChanged', 'onOverlayOpacityChanged', 'onOverlaySizingModeChanged', 'onPhoneMirrorIncomingChat', 'onPhoneMirrorStatus',
  'onProviderDataScopesChanged', 'onRAGStreamChunk', 'onRAGStreamComplete', 'onRAGStreamError', 'onResetCropper',
  'onScreenshotAttached', 'onScreenshotTaken', 'onSessionReset', 'onSettingsVisibilityChange', 'onStealthKeyCaptured',
  'onStealthTapState', 'onSttConfigChanged', 'onSttLanguageAutoDetected', 'onSttStatusChanged', 'onSuggestionError',
  'onSuggestionGenerated', 'onSuggestionProcessingStart', 'onSystemAudioPermissionDenied', 'onThemeChanged', 'onToggleExpand',
  'onTrialEnded', 'onUndetectableChanged', 'onUpdateAvailable', 'onUpdateChecking', 'onUpdateDownloaded',
  'onUpdateError', 'onUpdateNotAvailable', 'onWindowMaximizedChanged', 'openExternal', 'openLogFile',
  'openSettingsTab', 'phoneMirrorDisable', 'phoneMirrorEnable', 'phoneMirrorGetInfo', 'phoneMirrorRotateToken',
  'phoneMirrorSetLan', 'platform', 'profileDelete', 'profileDeleteJD', 'profileGenerateNegotiation',
  'profileGetNotes', 'profileGetPersona', 'profileGetProfile', 'profileGetStatus', 'profileImportMarkdownContext',
  'profileResearchCompany', 'profileSaveNotes', 'profileSavePersona', 'profileSelectFile', 'profileSetMode',
  'profileUploadJD', 'profileUploadResume', 'quitApp', 'ragQueryGlobal', 'ragQueryLive',
  'ragQueryMeeting', 'reindexIncompatibleMeetings', 'requestMicPermission', 'resetIntelligence', 'resetKeybinds',
  'restartAndInstall', 'saveScreenshotFile', 'seedDemo', 'selectServiceAccount', 'setActionButtonMode',
  'setAiResponseLanguage', 'setAnalyticsConsent', 'setAzureApiKey', 'setClaudeApiKey', 'setDeepgramApiKey',
  'setDefaultModel', 'setDisguise', 'setDonationComplete', 'setElevenLabsApiKey', 'setGeminiApiKey',
  'setGroqSttApiKey', 'setIbmWatsonApiKey', 'setKeybind', 'setMeetingInterfaceTheme', 'setMeetingRetention',
  'setModel', 'setOpenAiSttApiKey', 'setOpenAtLogin', 'setOpenaiApiKey', 'setOverlayMousePassthrough',
  'setOverlayOpacity', 'setProviderDataScopes', 'setProviderPreferredModel', 'setRecognitionLanguage', 'setSonioxApiKey',
  'setSttProvider', 'setTavilyApiKey', 'setThemeMode', 'setUndetectable', 'setVerboseLogging',
  'setWindowMode', 'showWindow', 'skillsOpenFolder', 'skillsRefresh', 'startAudioTest',
  'startMeeting', 'startTrial', 'stealthTapOpenSettings', 'stealthTapShouldAutoEngage', 'stealthTapStart',
  'stealthTapStop', 'stopAudioTest', 'streamGeminiChat', 'takeScreenshot', 'takeSelectiveScreenshot',
  'testLlmConnection', 'testReleaseFetch', 'testSttConnection', 'toggleModelSelector', 'toggleOverlayExpand',
  'toggleSettingsWindow', 'toggleWindow', 'updateContentDimensions', 'updateContentDimensionsCentered', 'updateMeetingSummary', 'updateMeetingTitle',
  'windowClose', 'windowIsMaximized', 'windowMaximize', 'windowMinimize', 'wipeTrialProfileData',
]);

// Methods excluded from all non-cropper windows: raw test hooks, file-path
// probing/opening/deletion, arbitrary source-file analysis, and cropper replies.
const GENERAL_DENY_KEYS = new Set([
  'testInjectTranscript', 'testGetModeContext', 'testCodexCli', 'testReleaseFetch',
  'openScreenshotFile', 'deleteScreenshot', 'analyzeImageFile',
  'seedDemo', 'flushDatabase', 'getLogFilePath', 'openLogFile', 'getArch', 'getOsVersion',
  ...CROPPER_API_KEYS,
]);

// Settings has no live interview surface. Removing these methods prevents a
// compromised settings renderer from starting/stopping meetings, controlling
// the overlay, reading meeting transcripts, or driving live AI/RAG operations.
const SETTINGS_MEETING_DENY_KEYS = new Set([
  'takeScreenshot', 'takeSelectiveScreenshot', 'getScreenshots', 'saveScreenshotFile',
  'onScreenshotTaken', 'onScreenshotAttached', 'onCaptureAndProcess', 'onSolutionsReady',
  'onResetView', 'onSolutionStart', 'onDebugStart', 'onDebugSuccess', 'onDebugError',
  'onSolutionError', 'onProcessingNoScreenshots', 'onProblemExtracted', 'onSolutionSuccess',
  'onUnauthorized', 'toggleWindow', 'showWindow', 'hideWindow', 'showOverlay', 'hideOverlay',
  'getMeetingActive', 'onMeetingStateChanged', 'toggleOverlayExpand', 'getOverlayExpanded',
  'getOverlaySizingMode', 'onOverlaySizingModeChanged', 'clearCompactLatch',
  'onOverlayExpandedChanged', 'setOverlayMousePassthrough', 'toggleOverlayMousePassthrough',
  'getOverlayMousePassthrough', 'phoneMirrorPushScreenshot', 'onPhoneMirrorIncomingChat',
  'onSettingsVisibilityChange', 'onToggleExpand', 'onNativeAudioTranscript',
  'onNativeAudioSuggestion', 'onNativeAudioConnected', 'onNativeAudioDisconnected',
  'onSuggestionGenerated', 'onSuggestionProcessingStart', 'onSuggestionError',
  'generateSuggestion', 'getNativeAudioStatus', 'getInputDevices', 'getOutputDevices',
  'onAudioCaptureFailed', 'onSttStatusChanged', 'generateAssist', 'generateWhatToSay',
  'generateClarify', 'generateCodeHint', 'generateBrainstorm', 'generateFollowUp',
  'generateFollowUpQuestions', 'generateRecap', 'submitManualQuestion', 'getIntelligenceContext',
  'resetIntelligence', 'interviewWorkspaceStartMeeting', 'interviewWorkspaceFinishMeeting',
  'startMeeting', 'endMeeting', 'finalizeMicSTT', 'getRecentMeetings', 'getMeetingDetails',
  'updateMeetingTitle', 'updateMeetingSummary', 'deleteMeeting', 'setWindowMode',
  'onIntelligenceAssistUpdate', 'onIntelligenceDynamicAction', 'acceptDynamicAction',
  'dismissDynamicAction', 'listDynamicActions', 'onIntelligenceSuggestedAnswerToken',
  'onIntelligenceSuggestedAnswer', 'onIntelligenceNegotiationCoaching',
  'onIntelligenceTokenBatch', 'onIntelligenceRefinedAnswerToken', 'onIntelligenceRefinedAnswer',
  'onIntelligenceRecapToken', 'onIntelligenceRecap', 'onIntelligenceClarifyToken',
  'onIntelligenceClarify', 'onIntelligenceFollowUpQuestionsToken',
  'onIntelligenceFollowUpQuestionsUpdate', 'onIntelligenceManualStarted',
  'onIntelligenceManualResult', 'onIntelligenceModeChanged', 'onIntelligenceError',
  'onSessionReset', 'streamGeminiChat', 'onGeminiStreamToken', 'onGeminiStreamDone',
  'onGeminiStreamError', 'ragQueryMeeting', 'ragQueryLive', 'ragQueryGlobal', 'ragCancelQuery',
  'ragIsMeetingProcessed', 'ragGetQueueStatus', 'ragRetryEmbeddings', 'onRAGStreamChunk',
  'onRAGStreamComplete', 'onRAGStreamError', 'cancelChatStream',
  'fileExists', 'interviewWorkspaceList', 'interviewWorkspaceGetById',
  'interviewWorkspaceGetByMeeting', 'profileGetProfile', 'profileGetNotes',
  'profileGetPersona', 'profileSelectFile', 'profileUploadResume', 'profileUploadJD',
  'profileDelete', 'profileDeleteJD', 'profileSaveNotes', 'profileSavePersona',
  'profileImportMarkdownContext', 'profileResearchCompany', 'profileGenerateNegotiation',
  'profileSetMode',
]);

// The live overlay does not host settings screens or provider configuration.
// Keep this inventory explicit so additions do not silently broaden its surface.
const OVERLAY_SETTINGS_DENY_KEYS = new Set([
  'setGeminiApiKey', 'setGroqApiKey', 'setOpenaiApiKey', 'setClaudeApiKey',
  'setDeepseekApiKey', 'setAnswerCueApiKey', 'selectServiceAccount',
  'setSttProvider', 'setGroqSttApiKey', 'setOpenAiSttApiKey', 'setOpenAiSttBaseUrl',
  'setDeepgramApiKey', 'setElevenLabsApiKey', 'setAzureApiKey', 'setAzureRegion',
  'setIbmWatsonApiKey', 'setGroqSttModel', 'setSonioxApiKey', 'setIbmWatsonRegion',
  'testSttConnection', 'localWhisperSetModel', 'localWhisperDeleteModel',
  'localWhisperStartDownload', 'setRecognitionLanguage', 'setAiResponseLanguage',
  'setKeybind', 'resetKeybinds', 'modesCreate', 'modesUpdate', 'modesDelete',
  'modesSetActive', 'modesUploadReferenceFile', 'modesDeleteReferenceFile',
  'modesAddNoteSection', 'modesUpdateNoteSection', 'modesDeleteNoteSection',
  'modesRemoveAllNoteSections', 'interviewDocsSelectFiles', 'interviewDocsBatchUpload',
  'interviewDocsDelete', 'interviewWorkspaceUpdateDocuments', 'setProviderDataScopes',
  'fileExists', 'profileGetProfile', 'profileGetNotes', 'profileGetPersona',
  'profileSelectFile', 'profileUploadResume', 'profileUploadJD', 'profileDelete',
  'profileDeleteJD', 'profileSaveNotes', 'profileSavePersona',
  'profileImportMarkdownContext', 'profileResearchCompany',
  'profileGenerateNegotiation', 'profileSetMode',
]);

export function isPreloadRole(value: string | undefined): value is PreloadRole {
  return value === 'launcher' || value === 'overlay' || value === 'settings' ||
    value === 'model-selector' || value === 'cropper';
}

export function filterPreloadApi<T extends Record<string, unknown>>(
  api: T,
  role: PreloadRole,
): Partial<T> {
  const allowed = role === 'cropper'
    ? CROPPER_API_KEYS
    : role === 'model-selector'
      ? MODEL_SELECTOR_API_KEYS
      : null;

  if (allowed) {
    return Object.fromEntries(allowed.flatMap((key) => key in api ? [[key, api[key]]] : [])) as Partial<T>;
  }

  const denied = role === 'overlay'
    ? new Set([...GENERAL_DENY_KEYS, ...OVERLAY_SETTINGS_DENY_KEYS])
    : role === 'settings'
      ? new Set([...GENERAL_DENY_KEYS, ...SETTINGS_MEETING_DENY_KEYS])
      : GENERAL_DENY_KEYS;
  return Object.fromEntries(Object.entries(api).filter(([key]) =>
    RENDERER_API_KEYS.has(key) && !denied.has(key),
  )) as Partial<T>;
}

/** Read only the main-process-assigned argv role; renderer URLs are not authority. */
export function getPreloadRole(argv: readonly string[]): PreloadRole | undefined {
  const prefix = '--answercue-window-role=';
  const roleArgs = argv.filter((arg) => arg.startsWith(prefix));
  if (roleArgs.length !== 1) return undefined;
  const value = roleArgs[0].slice(prefix.length);
  return isPreloadRole(value) ? value : undefined;
}
