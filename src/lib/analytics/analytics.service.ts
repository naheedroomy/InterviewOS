// GA4 delivery is intentionally suspended until an owned first-party relay exists.

export type ModelProviderType = 'cloud' | 'local';

export type AssistantMode = 'launcher' | 'overlay' | 'undetectable' | string;

export type AnalyticsEventName =
    | 'app_opened'
    | 'app_closed'
    | 'first_launch'
    | 'assistant_started'
    | 'assistant_stopped'
    | 'mode_selected'
    | 'copy_answer_clicked'
    | 'calendar_connected'
    | 'pdf_exported'
    | 'meeting_started'
    | 'meeting_ended'
    | 'model_used'
    | 'session_duration'
    | 'command_executed'
    | 'conversation_started';

interface ModelUsedPayload {
    model_name: string;
    provider: string;
    provider_type: ModelProviderType;
    latency_ms: number;
    tokens_used?: number;
}

/** Classify an explicit routed provider, never infer locality from model names. */
export function detectProviderType(provider: string, isOllama = false): ModelProviderType {
    return isOllama || provider === 'ollama' || provider === 'codex-cli' ? 'local' : 'cloud';
}

/** Keep existing renderer call sites stable while external analytics is suspended. */
export class AnalyticsService {
    private static instance: AnalyticsService;

    private constructor() { }

    public static getInstance(): AnalyticsService {
        if (!AnalyticsService.instance) {
            AnalyticsService.instance = new AnalyticsService();
        }
        return AnalyticsService.instance;
    }

    public async initAnalytics(): Promise<void> { }

    public handleConsentChanged(_consent: 'granted' | 'denied'): void { }

    public trackAppOpen(): void { }
    public trackAppClose(): void { }
    public trackAssistantStart(): void { }
    public trackAssistantStop(): void { }
    public trackModeSelected(_mode: AssistantMode): void { }
    public trackModelUsed(_payload: ModelUsedPayload): void { }
    public trackCopyAnswer(): void { }
    public trackCommandExecuted(_commandType: string): void { }
    public trackConversationStarted(): void { }
    public trackCalendarConnected(): void { }
    public trackMeetingStarted(): void { }
    public trackMeetingEnded(): void { }
    public trackPdfExported(): void { }
}

export const analytics = AnalyticsService.getInstance();
