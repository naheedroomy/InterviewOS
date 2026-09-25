export const STANDARD_CLOUD_MODELS: Record<string, {
    hasKeyCheck: (creds: any) => boolean;
    ids: string[];
    names: string[];
    descs: string[];
    pmKey: 'geminiPreferredModel' | 'openaiPreferredModel' | 'claudePreferredModel' | 'groqPreferredModel' | 'deepseekPreferredModel';
}> = {
    gemini: {
        hasKeyCheck: (creds) => !!creds?.hasGeminiKey,
        ids: [],
        names: [],
        descs: [],
        pmKey: 'geminiPreferredModel'
    },
    openai: {
        hasKeyCheck: (creds) => !!creds?.hasOpenaiKey,
        ids: ['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna', 'chat-latest', 'gpt-5.5', 'gpt-5.5-thinking-low', 'gpt-5.4', 'gpt-4o', 'gpt-4o-mini'],
        names: ['GPT-6 Astra', 'GPT-6 Sol', 'GPT-6 Luna', 'GPT Instant (chat-latest)', 'GPT 5.5', 'GPT 5.5 Thinking', 'GPT 5.4', 'GPT-4o', 'GPT-4o mini'],
        descs: ['OpenAI Frontier • Ultra-fast', 'OpenAI Frontier • General', 'OpenAI Frontier • High reasoning', 'OpenAI Auto-updating Instant', 'OpenAI', 'Low reasoning', 'OpenAI', 'Fast multimodal', 'Lightweight fast'],
        pmKey: 'openaiPreferredModel'
    },
    claude: {
        hasKeyCheck: (creds) => !!creds?.hasClaudeKey,
        ids: ['claude-opus-5.5', 'claude-sonnet-5', 'claude-haiku-4.5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-4-6'],
        names: ['Claude Opus 5.5', 'Claude Sonnet 5', 'Claude Haiku 4.5', 'Claude Opus 4.8', 'Claude Opus 4.7', 'Claude Opus 4.6', 'Claude Sonnet 4.6'],
        descs: ['Anthropic • Frontier reasoning', 'Anthropic • Optimal agentic speed/intellect', 'Anthropic • Ultra-fast lightweight', 'Anthropic • Highest reasoning', 'Anthropic • Opus', 'Anthropic • Opus', 'Anthropic • Sonnet'],
        pmKey: 'claudePreferredModel'
    },
    groq: {
        hasKeyCheck: (creds) => !!creds?.hasGroqKey,
        ids: ['llama-3.3-70b-versatile'],
        names: ['Groq Llama 3.3'],
        descs: ['Ultra Fast'],
        pmKey: 'groqPreferredModel'
    },
    deepseek: {
        hasKeyCheck: (creds) => !!creds?.hasDeepseekKey,
        ids: ['deepseek-v4.1-flash', 'deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner'],
        names: ['DeepSeek V4.1 Flash', 'DeepSeek V4 Pro', 'DeepSeek V4 Flash', 'DeepSeek Chat', 'DeepSeek Reasoner'],
        descs: ['Ultra-fast • Native Multimodal', '1.6T params • Frontier Reasoning', 'Fast • Text-only', 'Standard Conversational', 'Deep Reasoning'],
        pmKey: 'deepseekPreferredModel'
    },
};

export const isAllowedStandardCloudModel = (provider: string, modelId: string): boolean => {
    const config = STANDARD_CLOUD_MODELS[provider];
    if (!config) return true;
    // Gemini uses dynamic discovery — any non-empty model ID is allowed.
    if (provider === 'gemini') return !!modelId;
    return config.ids.includes(modelId);
};

export const isAllowedGeminiModel = (modelId: string): boolean => {
    const clean = (modelId || '').replace(/^models\//, '').toLowerCase();
    if (!clean.startsWith('gemini-')) return false;

    // Hide older 1.x legacy models (Gemini 2.0+ only)
    const versionMatch = clean.match(/^gemini-(\d+)(?:\.(\d+))?/);
    if (!versionMatch) return false;
    const major = parseInt(versionMatch[1], 10);
    if (major < 2) return false;

    const isFlashOrProOrLive = clean.includes('flash') || clean.includes('pro') || clean.includes('live');
    if (!isFlashOrProOrLive) return false;

    const excludePatterns = [
        'antigravity',
        'deep-research',
        'research',
        'preview',
        'exp',
        'experimental',
        'vision',
        'custom',
        'tuned',
        'robotics',
        'learnlm',
        'banana',
        'nano',
    ];

    return !excludePatterns.some(p => clean.includes(p));
};

export const CODEX_CLI_MODEL = {
    id: 'codex-cli',
    name: 'Codex CLI',
    desc: 'Local CLI transport',
};

export const CODEX_CLI_MODEL_PRESETS = [
    { id: 'gpt-5.5', name: 'ChatGPT 5.5' },
    { id: 'gpt-5.3-codex', name: 'Codex 5.3' },
    { id: 'gpt-5.3-codex-spark', name: 'Codex Spark 5.3' },
    { id: 'gpt-5.4', name: 'ChatGPT 5.4' },
];

export const codexCliSelectorId = (modelId: string): string => `codex-cli:${modelId}`;

export const getCodexCliModelDisplayName = (id: string): string | null => {
    if (id === CODEX_CLI_MODEL.id) return CODEX_CLI_MODEL.name;
    if (!id.startsWith('codex-cli:')) return null;

    const modelId = id.slice('codex-cli:'.length);
    const preset = CODEX_CLI_MODEL_PRESETS.find(model => model.id === modelId);
    return preset?.name || prettifyModelId(modelId);
};

export const prettifyModelId = (id: string): string => {
    if (!id) return '';
    return id.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};
