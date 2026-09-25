import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, Plus, Trash2, Globe, Server, Eye, Loader2, Sparkles, AlertCircle, RefreshCw } from 'lucide-react';
import { isAllowedStandardCloudModel, STANDARD_CLOUD_MODELS, prettifyModelId } from '../../utils/modelUtils';
import { ProviderCard } from './ProviderCard';

type ProviderId = 'openai' | 'gemini' | 'claude' | 'deepseek';
type ProviderDataScopeKey = 'transcript' | 'screenshots' | 'reference_files' | 'profile_history' | 'embeddings' | 'post_call_summary';
type ProviderDataScopes = Partial<Record<ProviderDataScopeKey, boolean>>;

interface ModelOption {
    id: string;
    name: string;
}

interface OpenAICompatibleEndpoint {
    id: string;
    name: string;
    baseUrl: string;
    apiKey?: string;
    modelId: string;
    customHeaders?: Record<string, string>;
    supportsVision: boolean;
    isLocal?: boolean;
    timeoutMs?: number;
    enabled: boolean;
}

interface ModelSelectProps {
    value: string;
    options: ModelOption[];
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

const PROVIDER_ORDER: ProviderId[] = ['openai', 'gemini', 'claude', 'deepseek'];
const PROVIDER_DATA_SCOPE_OPTIONS: Array<{ key: ProviderDataScopeKey; label: string; description: string }> = [
    { key: 'transcript', label: 'Transcript', description: 'Live interview and meeting text.' },
    { key: 'screenshots', label: 'Screenshots', description: 'Screen context used for visual answers.' },
    { key: 'reference_files', label: 'Reference files', description: 'Selected docs and uploaded context.' },
    { key: 'profile_history', label: 'Profile history', description: 'Saved profile and prior interview context.' },
    { key: 'embeddings', label: 'Embeddings', description: 'Document chunks sent for vector indexing.' },
    { key: 'post_call_summary', label: 'Post-call summary', description: 'Finished interview summaries.' },
];

const PROVIDER_LABELS: Record<ProviderId, string> = {
    openai: 'OpenAI',
    gemini: 'Google Gemini',
    claude: 'Anthropic Claude',
    deepseek: 'DeepSeek',
};

const PROVIDER_KEY_PLACEHOLDERS: Record<ProviderId, string> = {
    openai: 'sk-...',
    gemini: 'AIzaSy...',
    claude: 'sk-ant-...',
    deepseek: 'sk-...',
};

const PROVIDER_KEY_URLS: Record<ProviderId, string> = {
    openai: 'https://platform.openai.com/api-keys',
    gemini: 'https://aistudio.google.com/app/apikey',
    claude: 'https://console.anthropic.com/settings/keys',
    deepseek: 'https://platform.deepseek.com/api_keys',
};

const isGeminiModelId = (modelId?: string): boolean =>
    Boolean(modelId && (modelId.startsWith('models/') || modelId.startsWith('gemini-')));

const ModelSelect: React.FC<ModelSelectProps> = ({ value, options, onChange, placeholder = 'Select model', className = '' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(option => option.id === value);
    const paddingClass = className.includes('py-') ? '' : 'py-1.5';

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`w-48 bg-bg-input border border-border-subtle rounded-lg px-3 ${paddingClass} ${className} text-xs text-text-primary focus:outline-none focus:border-accent-primary flex items-center justify-between hover:bg-bg-elevated transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                type="button"
                disabled={options.length === 0}
            >
                <span className="truncate pr-2">{selectedOption ? selectedOption.name : placeholder}</span>
                <ChevronDown size={14} className={`text-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full right-0 mt-1 w-full bg-bg-elevated border border-border-subtle rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto animated fadeIn">
                    <div className="p-1 space-y-0.5">
                        {options.map((option) => (
                            <button
                                key={option.id}
                                onClick={() => {
                                    onChange(option.id);
                                    setIsOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2 text-xs rounded-md flex items-center justify-between group transition-colors ${value === option.id ? 'bg-bg-input hover:bg-bg-elevated text-text-primary' : 'text-text-secondary hover:bg-bg-input hover:text-text-primary'}`}
                                type="button"
                            >
                                <span className="truncate">{option.name}</span>
                                {value === option.id && <Check size={14} className="text-accent-primary shrink-0 ml-2" />}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export const AIProvidersSettings: React.FC = () => {
    const [apiKeys, setApiKeys] = useState<Record<ProviderId, string>>({
        openai: '',
        gemini: '',
        claude: '',
        deepseek: '',
    });
    const [hasStoredKey, setHasStoredKey] = useState<Record<ProviderId, boolean>>({
        openai: false,
        gemini: false,
        claude: false,
        deepseek: false,
    });
    const [preferredModels, setPreferredModels] = useState<Record<string, string>>({});
    const [defaultModel, setDefaultModel] = useState('');
    const [credentialsLoaded, setCredentialsLoaded] = useState(false);
    const [savedStatus, setSavedStatus] = useState<Record<string, boolean>>({});
    const [savingStatus, setSavingStatus] = useState<Record<string, boolean>>({});
    const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'testing' | 'success' | 'error'>>({});
    const [testError, setTestError] = useState<Record<string, string>>({});
    const [providerDataScopes, setProviderDataScopes] = useState<ProviderDataScopes>({});

    // Thinking Effort
    const [thinkingEffort, setThinkingEffort] = useState<'auto' | 'low' | 'medium' | 'high'>('auto');

    // OpenAI Compatible Endpoints
    const [endpoints, setEndpoints] = useState<OpenAICompatibleEndpoint[]>([]);
    const [isAddingEndpoint, setIsAddingEndpoint] = useState(false);
    const [newEndpoint, setNewEndpoint] = useState<{
        name: string;
        baseUrl: string;
        apiKey: string;
        modelId: string;
        supportsVision: boolean;
        isLocal: boolean;
        customHeaders: string;
    }>({
        name: '',
        baseUrl: '',
        apiKey: '',
        modelId: '',
        supportsVision: false,
        isLocal: false,
        customHeaders: '',
    });
    const [endpointDiscoveredModels, setEndpointDiscoveredModels] = useState<string[]>([]);
    const [endpointFetchingModels, setEndpointFetchingModels] = useState(false);
    const [endpointTestStatus, setEndpointTestStatus] = useState<Record<string, 'idle' | 'testing' | 'success' | 'error'>>({});
    const [endpointTestError, setEndpointTestError] = useState<Record<string, string>>({});
    const [savingEndpoint, setSavingEndpoint] = useState(false);
    const [newEndpointTestStatus, setNewEndpointTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [newEndpointTestError, setNewEndpointTestError] = useState('');

    // ── Gemini dynamic discovery (auto-fetched, shared with ProviderCard) ─────
    const [geminiDiscoveredModels, setGeminiDiscoveredModels] = useState<ModelOption[]>([]);
    const [geminiDiscoveryLoading, setGeminiDiscoveryLoading] = useState(false);
    const [geminiDiscoverySettled, setGeminiDiscoverySettled] = useState(false);
    const geminiDiscoveryGenerationRef = useRef(0);

    /** Shared callback: models fetched/refreshed from any source update this cache. */
    const handleGeminiModelsFetched = useCallback((models: { id: string; label: string }[]) => {
        geminiDiscoveryGenerationRef.current += 1;
        const mapped: ModelOption[] = models.map(m => ({ id: m.id, name: m.label }));
        setGeminiDiscoveredModels(mapped);
        setGeminiDiscoveryLoading(false);
        setGeminiDiscoverySettled(true);
    }, []);

    /** Auto-discover Gemini models once after credentials load when a key is stored. */
    useEffect(() => {
        if (!credentialsLoaded || !hasStoredKey.gemini || geminiDiscoverySettled) return;

        const discover = async () => {
            const generation = ++geminiDiscoveryGenerationRef.current;
            setGeminiDiscoveryLoading(true);
            try {
                // Empty string → IPC resolves the stored Gemini key
                const result = await window.electronAPI?.fetchProviderModels('gemini', '');
                if (generation !== geminiDiscoveryGenerationRef.current) return;
                if (result?.success && result.models) {
                    const mapped: ModelOption[] = result.models.map((m: any) => ({ id: m.id, name: m.label }));
                    setGeminiDiscoveredModels(mapped);

                    // Reconcile the saved Gemini-preferred model if stale
                    const currentPreferred = preferredModels.gemini;
                    if (mapped.length > 0 && !mapped.some(m => m.id === currentPreferred)) {
                        const firstId = mapped[0].id;
                        console.warn(
                            `[AIProvidersSettings] Saved Gemini preferred model "${currentPreferred || '(none)'}" ` +
                            `no longer available. Auto-selecting first discovered: "${firstId}".`
                        );
                        setPreferredModels(prev => ({ ...prev, gemini: firstId }));
                        window.electronAPI?.setProviderPreferredModel?.('gemini', firstId);
                    }
                }
                // Successful empty list: do not reconcile, do not overwrite default
            } catch (e) {
                if (generation !== geminiDiscoveryGenerationRef.current) return;
                console.error('Gemini auto-discovery failed:', e);
                // Fetch failure — no action; ProviderCard manual fetch can retry
            } finally {
                if (generation === geminiDiscoveryGenerationRef.current) {
                    setGeminiDiscoveryLoading(false);
                    setGeminiDiscoverySettled(true);
                }
            }
        };
        discover();
        // Intentionally run only once per credentials-load cycle; settled flag prevents re-runs
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [credentialsLoaded, hasStoredKey.gemini]);

    useEffect(() => {
        const loadCredentials = async () => {
            try {
                const creds = await window.electronAPI?.getStoredCredentials?.();
                if (creds) {
                    setHasStoredKey({
                        openai: !!creds.hasOpenaiKey,
                        gemini: !!creds.hasGeminiKey,
                        claude: !!creds.hasClaudeKey,
                        deepseek: !!creds.hasDeepseekKey,
                    });

                    const nextPreferred: Record<string, string> = {};
                    if (creds.openaiPreferredModel) nextPreferred.openai = creds.openaiPreferredModel;
                    if (creds.geminiPreferredModel) nextPreferred.gemini = creds.geminiPreferredModel;
                    if (creds.claudePreferredModel && isAllowedStandardCloudModel('claude', creds.claudePreferredModel)) nextPreferred.claude = creds.claudePreferredModel;
                    if (creds.deepseekPreferredModel && isAllowedStandardCloudModel('deepseek', creds.deepseekPreferredModel)) nextPreferred.deepseek = creds.deepseekPreferredModel;
                    setPreferredModels(nextPreferred);
                }

                const result = await window.electronAPI?.getDefaultModel?.();
                if (result?.model && result.model !== 'natively') {
                    setDefaultModel(result.model);
                }

                const effortResult = await window.electronAPI?.getThinkingEffort?.();
                if (effortResult) {
                    setThinkingEffort(effortResult);
                }

                const loadedEndpoints = await window.electronAPI?.getOpenAICompatibleEndpoints?.();
                if (Array.isArray(loadedEndpoints)) {
                    setEndpoints(loadedEndpoints);
                }
            } catch (error) {
                console.error('Failed to load AI provider settings:', error);
            } finally {
                setCredentialsLoaded(true);
            }
        };

        loadCredentials();
    }, []);

    useEffect(() => {
        window.electronAPI?.getProviderDataScopes?.().then(setProviderDataScopes).catch(console.error);
        const unsubscribeProviderDataScopes = window.electronAPI?.onProviderDataScopesChanged
            ? window.electronAPI.onProviderDataScopesChanged(setProviderDataScopes)
            : undefined;
        return () => unsubscribeProviderDataScopes?.();
    }, []);

    const defaultModelOptions = useMemo<ModelOption[]>(() => {
        const options: ModelOption[] = [];

        for (const provider of PROVIDER_ORDER) {
            const config = STANDARD_CLOUD_MODELS[provider];
            if (!config || !hasStoredKey[provider]) continue;

            if (provider === 'gemini') {
                // Gemini uses dynamically discovered models (cached from ProviderCard fetch).
                for (const m of geminiDiscoveredModels) {
                    if (!options.some(o => o.id === m.id)) {
                        options.push(m);
                    }
                }
            } else {
                // Other providers use their hardcoded allowlist.
                config.ids.forEach((id, index) => {
                    options.push({ id, name: config.names[index] || prettifyModelId(id) });
                });
            }

            const preferredModel = preferredModels[provider];
            if (provider !== 'gemini' && preferredModel && !config.ids.includes(preferredModel) && isAllowedStandardCloudModel(provider, preferredModel)) {
                options.push({ id: preferredModel, name: prettifyModelId(preferredModel) });
            }
        }

        for (const ep of endpoints) {
            if (ep.enabled !== false) {
                options.push({ id: ep.id, name: `${ep.name} (${ep.modelId || 'default'})` });
            }
        }

        return options;
    }, [hasStoredKey, preferredModels, geminiDiscoveredModels, endpoints]);

    useEffect(() => {
        // Wait for credentials and Gemini discovery (if a Gemini key is stored) to settle
        // before reconciling a stale default model.
        if (!credentialsLoaded) return;
        if (hasStoredKey.gemini && !geminiDiscoverySettled) return;

        if (hasStoredKey.gemini && isGeminiModelId(defaultModel)) {
            if (geminiDiscoveredModels.length === 0) return;
            if (geminiDiscoveredModels.some(option => option.id === defaultModel)) return;

            const nextModel = geminiDiscoveredModels[0].id;
            console.warn(
                `[AIProvidersSettings] Saved default model "${defaultModel}" no longer available in Gemini. ` +
                `Auto-selecting first discovered Gemini: "${nextModel}".`
            );
            setDefaultModel(nextModel);
            window.electronAPI?.setDefaultModel?.(nextModel).catch(console.error);
            return;
        }

        if (defaultModelOptions.length === 0) return;
        if (defaultModel && defaultModelOptions.some(option => option.id === defaultModel)) return;

        const oldModel = defaultModel || '(none)';
        const nextModel = defaultModelOptions[0].id;
        console.warn(
            `[AIProvidersSettings] Saved default model "${oldModel}" no longer available. ` +
            `Auto-selecting first available: "${nextModel}".`
        );
        setDefaultModel(nextModel);
        window.electronAPI?.setDefaultModel?.(nextModel).catch(console.error);
    }, [credentialsLoaded, defaultModel, defaultModelOptions, hasStoredKey, geminiDiscoverySettled, geminiDiscoveredModels]);

    const setProviderKey = (provider: ProviderId, value: string) => {
        setApiKeys(prev => ({ ...prev, [provider]: value }));
    };

    const handleSaveKey = async (provider: ProviderId) => {
        const key = apiKeys[provider].trim();
        if (!key) return;

        setSavingStatus(prev => ({ ...prev, [provider]: true }));
        try {
            let result;
            if (provider === 'openai') result = await window.electronAPI?.setOpenaiApiKey?.(key);
            if (provider === 'gemini') result = await window.electronAPI?.setGeminiApiKey?.(key);
            if (provider === 'claude') result = await window.electronAPI?.setClaudeApiKey?.(key);
            if (provider === 'deepseek') result = await window.electronAPI?.setDeepseekApiKey?.(key);

            if (result?.success) {
                if (provider === 'gemini') {
                    geminiDiscoveryGenerationRef.current += 1;
                    setGeminiDiscoveredModels([]);
                    setGeminiDiscoverySettled(false);
                }
                setSavedStatus(prev => ({ ...prev, [provider]: true }));
                setHasStoredKey(prev => ({ ...prev, [provider]: true }));
                setProviderKey(provider, '');
                setTimeout(() => setSavedStatus(prev => ({ ...prev, [provider]: false })), 2000);
            }
        } catch (error) {
            console.error(`Failed to save ${provider} API key:`, error);
        } finally {
            setSavingStatus(prev => ({ ...prev, [provider]: false }));
        }
    };

    const handleRemoveKey = async (provider: ProviderId) => {
        if (!confirm(`Are you sure you want to remove the ${PROVIDER_LABELS[provider]} API key?`)) return;

        try {
            let result;
            if (provider === 'openai') result = await window.electronAPI?.setOpenaiApiKey?.('');
            if (provider === 'gemini') result = await window.electronAPI?.setGeminiApiKey?.('');
            if (provider === 'claude') result = await window.electronAPI?.setClaudeApiKey?.('');
            if (provider === 'deepseek') result = await window.electronAPI?.setDeepseekApiKey?.('');

            if (result?.success) {
                if (provider === 'gemini') {
                    geminiDiscoveryGenerationRef.current += 1;
                    setGeminiDiscoveredModels([]);
                    setGeminiDiscoveryLoading(false);
                    setGeminiDiscoverySettled(false);
                }
                setHasStoredKey(prev => ({ ...prev, [provider]: false }));
                setProviderKey(provider, '');
            }
        } catch (error) {
            console.error(`Failed to remove ${provider} API key:`, error);
        }
    };

    const handleTestConnection = async (provider: ProviderId) => {
        const key = apiKeys[provider].trim();
        if (!key && !hasStoredKey[provider]) return;

        setTestStatus(prev => ({ ...prev, [provider]: 'testing' }));
        setTestError(prev => ({ ...prev, [provider]: '' }));

        try {
            const result = await window.electronAPI?.testLlmConnection?.(provider, key);
            if (result?.success) {
                setTestStatus(prev => ({ ...prev, [provider]: 'success' }));
                setTimeout(() => setTestStatus(prev => ({ ...prev, [provider]: 'idle' })), 3000);
            } else {
                setTestStatus(prev => ({ ...prev, [provider]: 'error' }));
                setTestError(prev => ({ ...prev, [provider]: result?.error || 'Connection failed' }));
            }
        } catch (error: any) {
            setTestStatus(prev => ({ ...prev, [provider]: 'error' }));
            setTestError(prev => ({ ...prev, [provider]: error.message || 'Connection failed' }));
        }
    };

    const handlePreferredModelChange = (provider: ProviderId, model: string) => {
        setPreferredModels(prev => ({ ...prev, [provider]: model }));
        window.electronAPI?.setProviderPreferredModel?.(provider, model);
    };

    const handleProviderDataScopeChange = (scope: ProviderDataScopeKey, enabled: boolean) => {
        const next = { ...providerDataScopes, [scope]: enabled };
        setProviderDataScopes(next);
        window.electronAPI?.setProviderDataScopes?.(next).catch(console.error);
    };

    const handleThinkingEffortChange = async (effort: 'auto' | 'low' | 'medium' | 'high') => {
        setThinkingEffort(effort);
        try {
            await window.electronAPI?.setThinkingEffort?.(effort);
        } catch (e) {
            console.error('Failed to update thinking effort:', e);
        }
    };

    const handleToggleEndpoint = async (endpoint: OpenAICompatibleEndpoint) => {
        const updated: OpenAICompatibleEndpoint = { ...endpoint, enabled: !endpoint.enabled };
        try {
            const res = await window.electronAPI?.saveOpenAICompatibleEndpoint?.(updated);
            if (res?.success) {
                setEndpoints(prev => prev.map(e => (e.id === endpoint.id ? updated : e)));
            }
        } catch (e) {
            console.error('Failed to toggle endpoint:', e);
        }
    };

    const handleDeleteEndpoint = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to remove endpoint "${name}"?`)) return;
        try {
            const res = await window.electronAPI?.deleteOpenAICompatibleEndpoint?.(id);
            if (res?.success) {
                setEndpoints(prev => prev.filter(e => e.id !== id));
            }
        } catch (e) {
            console.error('Failed to delete endpoint:', e);
        }
    };

    const handleTestEndpoint = async (endpoint: OpenAICompatibleEndpoint) => {
        setEndpointTestStatus(prev => ({ ...prev, [endpoint.id]: 'testing' }));
        setEndpointTestError(prev => ({ ...prev, [endpoint.id]: '' }));
        try {
            const res = await window.electronAPI?.testOpenAICompatibleEndpoint?.({ endpoint });
            if (res?.success) {
                setEndpointTestStatus(prev => ({ ...prev, [endpoint.id]: 'success' }));
                setTimeout(() => setEndpointTestStatus(prev => ({ ...prev, [endpoint.id]: 'idle' })), 3000);
            } else {
                setEndpointTestStatus(prev => ({ ...prev, [endpoint.id]: 'error' }));
                setEndpointTestError(prev => ({ ...prev, [endpoint.id]: res?.error || 'Test failed' }));
            }
        } catch (err: any) {
            setEndpointTestStatus(prev => ({ ...prev, [endpoint.id]: 'error' }));
            setEndpointTestError(prev => ({ ...prev, [endpoint.id]: err.message || 'Test failed' }));
        }
    };

    const handleFetchNewEndpointModels = async () => {
        if (!newEndpoint.baseUrl.trim()) return;
        setEndpointFetchingModels(true);
        setNewEndpointTestError('');
        try {
            let customHeaders: Record<string, string> | undefined;
            if (newEndpoint.customHeaders.trim()) {
                try {
                    customHeaders = JSON.parse(newEndpoint.customHeaders.trim());
                } catch {
                    const lines = newEndpoint.customHeaders.split('\n');
                    customHeaders = {};
                    for (const l of lines) {
                        const [k, ...v] = l.split(':');
                        if (k && v.length) customHeaders[k.trim()] = v.join(':').trim();
                    }
                }
            }
            const res = await window.electronAPI?.fetchOpenAICompatibleModels?.({
                baseUrl: newEndpoint.baseUrl.trim(),
                apiKey: newEndpoint.apiKey.trim() || undefined,
                customHeaders,
            });
            if (res?.success && Array.isArray(res.models)) {
                const modelIds = res.models.map((m: any) => (typeof m === 'string' ? m : (m.id || m.name)));
                setEndpointDiscoveredModels(modelIds);
                if (modelIds.length > 0 && !newEndpoint.modelId) {
                    setNewEndpoint(prev => ({ ...prev, modelId: modelIds[0] }));
                }
            } else {
                setNewEndpointTestError(res?.error || 'Failed to fetch models');
            }
        } catch (err: any) {
            setNewEndpointTestError(err.message || 'Failed to fetch models');
        } finally {
            setEndpointFetchingModels(false);
        }
    };

    const handleTestNewEndpoint = async () => {
        if (!newEndpoint.baseUrl.trim()) return;
        setNewEndpointTestStatus('testing');
        setNewEndpointTestError('');
        try {
            let customHeaders: Record<string, string> | undefined;
            if (newEndpoint.customHeaders.trim()) {
                try {
                    customHeaders = JSON.parse(newEndpoint.customHeaders.trim());
                } catch {
                    const lines = newEndpoint.customHeaders.split('\n');
                    customHeaders = {};
                    for (const l of lines) {
                        const [k, ...v] = l.split(':');
                        if (k && v.length) customHeaders[k.trim()] = v.join(':').trim();
                    }
                }
            }
            const ep = {
                id: 'temp-test',
                name: newEndpoint.name || 'Test',
                baseUrl: newEndpoint.baseUrl.trim(),
                apiKey: newEndpoint.apiKey.trim() || undefined,
                modelId: newEndpoint.modelId.trim() || 'default',
                customHeaders,
                supportsVision: newEndpoint.supportsVision,
                enabled: true,
            };
            const res = await window.electronAPI?.testOpenAICompatibleEndpoint?.({
                endpoint: ep,
                apiKey: newEndpoint.apiKey.trim() || undefined,
            });
            if (res?.success) {
                setNewEndpointTestStatus('success');
                setTimeout(() => setNewEndpointTestStatus('idle'), 3000);
            } else {
                setNewEndpointTestStatus('error');
                setNewEndpointTestError(res?.error || 'Connection failed');
            }
        } catch (err: any) {
            setNewEndpointTestStatus('error');
            setNewEndpointTestError(err.message || 'Connection failed');
        }
    };

    const handleSaveNewEndpoint = async () => {
        if (!newEndpoint.name.trim() || !newEndpoint.baseUrl.trim() || !newEndpoint.modelId.trim()) {
            setNewEndpointTestError('Name, Base URL, and Model ID are required');
            return;
        }
        setSavingEndpoint(true);
        setNewEndpointTestError('');
        try {
            let customHeaders: Record<string, string> | undefined;
            if (newEndpoint.customHeaders.trim()) {
                try {
                    customHeaders = JSON.parse(newEndpoint.customHeaders.trim());
                } catch {
                    const lines = newEndpoint.customHeaders.split('\n');
                    customHeaders = {};
                    for (const l of lines) {
                        const [k, ...v] = l.split(':');
                        if (k && v.length) customHeaders[k.trim()] = v.join(':').trim();
                    }
                }
            }
            const epToSave: OpenAICompatibleEndpoint = {
                id: `endpoint-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                name: newEndpoint.name.trim(),
                baseUrl: newEndpoint.baseUrl.trim(),
                apiKey: newEndpoint.apiKey.trim() || undefined,
                modelId: newEndpoint.modelId.trim(),
                supportsVision: newEndpoint.supportsVision,
                isLocal: newEndpoint.isLocal || /localhost|127\.0\.0\.1|0\.0\.0\.0|::1/i.test(newEndpoint.baseUrl),
                customHeaders,
                enabled: true,
            };
            const res = await window.electronAPI?.saveOpenAICompatibleEndpoint?.(epToSave);
            if (res?.success) {
                setEndpoints(prev => [...prev.filter(e => e.id !== epToSave.id), res.endpoint || epToSave]);
                setIsAddingEndpoint(false);
                setNewEndpoint({
                    name: '',
                    baseUrl: '',
                    apiKey: '',
                    modelId: '',
                    supportsVision: false,
                    isLocal: false,
                    customHeaders: '',
                });
                setEndpointDiscoveredModels([]);
            } else {
                setNewEndpointTestError(res?.error || 'Failed to save endpoint');
            }
        } catch (err: any) {
            setNewEndpointTestError(err.message || 'Failed to save endpoint');
        } finally {
            setSavingEndpoint(false);
        }
    };

    return (
        <div className="space-y-6 animated fadeIn pb-10">
            {/* Active Model */}
            <div className="space-y-3">
                <div>
                    <h3 className="text-sm font-bold text-text-primary mb-1">Default Model for Chat</h3>
                    <p className="text-xs text-text-secondary mb-2">Choose from configured Google, Anthropic, OpenAI, DeepSeek, or custom models.</p>
                </div>

                <div className="bg-bg-item-surface rounded-xl p-5 border border-border-subtle flex items-center justify-between">
                    <div>
                        <label className="block text-xs font-medium text-text-primary uppercase tracking-wide mb-0">Active Model</label>
                        <p className="text-[10px] text-text-secondary">Applies to new chats and live sessions instantly.</p>
                    </div>
                    <ModelSelect
                        value={defaultModel}
                        options={defaultModelOptions}
                        placeholder={defaultModelOptions.length ? 'Select model' : 'Add a provider key first'}
                        onChange={(value) => {
                            setDefaultModel(value);
                            window.electronAPI?.setDefaultModel?.(value).catch(console.error);
                        }}
                    />
                </div>
            </div>

            {/* Reasoning / Thinking Effort */}
            <div className="space-y-3">
                <div>
                    <h3 className="text-sm font-bold text-text-primary mb-1">Reasoning & Thinking Effort</h3>
                    <p className="text-xs text-text-secondary">
                        Controls reasoning depth across OpenAI, Anthropic Claude, Google Gemini, and DeepSeek.
                    </p>
                </div>

                <div className="bg-bg-item-surface rounded-xl p-4 border border-border-subtle">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                        {[
                            {
                                id: 'auto',
                                label: 'Auto (Adaptive)',
                                desc: 'Low in live interview (<300ms latency), Medium in prep/recap',
                                badge: 'Recommended',
                            },
                            {
                                id: 'low',
                                label: 'Low',
                                desc: 'Minimal reasoning tokens for maximum speed & lowest latency',
                            },
                            {
                                id: 'medium',
                                label: 'Medium',
                                desc: 'Balanced reasoning budget and response speed',
                            },
                            {
                                id: 'high',
                                label: 'High',
                                desc: 'Maximum depth for complex code & architecture problems',
                            },
                        ].map((option) => {
                            const isSelected = thinkingEffort === option.id;
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => handleThinkingEffortChange(option.id as any)}
                                    className={`text-left p-3 rounded-lg border transition-all cursor-pointer flex flex-col justify-between ${
                                        isSelected
                                            ? 'border-accent-primary bg-accent-primary/10 text-text-primary ring-1 ring-accent-primary/30'
                                            : 'border-border-subtle bg-bg-input/60 hover:bg-bg-elevated text-text-secondary hover:text-text-primary'
                                    }`}
                                >
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-semibold">{option.label}</span>
                                            {option.badge && (
                                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium">
                                                    {option.badge}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[10px] leading-snug opacity-80">{option.desc}</p>
                                    </div>
                                    <div className="mt-2.5 flex items-center justify-end">
                                        <div
                                            className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                                                isSelected ? 'border-accent-primary bg-accent-primary' : 'border-border-subtle'
                                            }`}
                                        >
                                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* AI Providers */}
            <div className="space-y-4">
                <div>
                    <h3 className="text-sm font-bold text-text-primary mb-1">AI Providers</h3>
                    <p className="text-xs text-text-secondary mb-2">Configure API keys for frontier AI models from Google, Anthropic, OpenAI, and DeepSeek.</p>
                </div>

                <div className="space-y-4">
                    {PROVIDER_ORDER.map(provider => (
                        <ProviderCard
                            key={provider}
                            providerId={provider}
                            providerName={PROVIDER_LABELS[provider]}
                            apiKey={apiKeys[provider]}
                            preferredModel={preferredModels[provider]}
                            hasStoredKey={hasStoredKey[provider]}
                            onKeyChange={(value) => setProviderKey(provider, value)}
                            onSaveKey={() => handleSaveKey(provider)}
                            onRemoveKey={() => handleRemoveKey(provider)}
                            onTestConnection={() => handleTestConnection(provider)}
                            testStatus={testStatus[provider] || 'idle'}
                            testError={testError[provider]}
                            savingStatus={!!savingStatus[provider]}
                            savedStatus={!!savedStatus[provider]}
                            keyPlaceholder={PROVIDER_KEY_PLACEHOLDERS[provider]}
                            keyUrl={PROVIDER_KEY_URLS[provider]}
                            onPreferredModelChange={(model) => handlePreferredModelChange(provider, model)}
                            onModelsFetched={provider === 'gemini' ? handleGeminiModelsFetched : undefined}
                            externalModels={provider === 'gemini' ? geminiDiscoveredModels.map(m => ({ id: m.id, label: m.name })) : undefined}
                        />
                    ))}
                </div>
            </div>

            {/* Custom OpenAI-Compatible Endpoints */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-bold text-text-primary mb-1">Custom OpenAI-Compatible Endpoints</h3>
                        <p className="text-xs text-text-secondary">
                            Connect OpenRouter, vLLM, LM Studio, Ollama, or custom proxies supporting standard OpenAI chat completions.
                        </p>
                    </div>
                    {!isAddingEndpoint && (
                        <button
                            type="button"
                            onClick={() => setIsAddingEndpoint(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent-primary hover:bg-accent-primary/90 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
                        >
                            <Plus size={14} />
                            <span>Add Endpoint</span>
                        </button>
                    )}
                </div>

                {/* Endpoint list */}
                {endpoints.length > 0 && (
                    <div className="space-y-3">
                        {endpoints.map((ep) => (
                            <div
                                key={ep.id}
                                className="bg-bg-item-surface rounded-xl p-4 border border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                                <div className="space-y-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-semibold text-text-primary">{ep.name}</span>
                                        {ep.isLocal && (
                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono">
                                                Local
                                            </span>
                                        )}
                                        {ep.supportsVision && (
                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                                                Vision
                                            </span>
                                        )}
                                        <span
                                            className={`text-[9px] px-1.5 py-0.5 rounded ${
                                                ep.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-700 text-zinc-400'
                                            }`}
                                        >
                                            {ep.enabled ? 'Active' : 'Disabled'}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-text-secondary font-mono">
                                        <span className="truncate max-w-[260px]">{ep.baseUrl}</span>
                                        <span>•</span>
                                        <span className="text-amber-400">{ep.modelId}</span>
                                        {ep.apiKey && (
                                            <>
                                                <span>•</span>
                                                <span className="text-text-tertiary">Key: {ep.apiKey}</span>
                                            </>
                                        )}
                                    </div>
                                    {endpointTestError[ep.id] && (
                                        <div className="text-[10px] text-red-400 flex items-center gap-1 mt-1">
                                            <AlertCircle size={11} />
                                            <span>{endpointTestError[ep.id]}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                    <button
                                        type="button"
                                        onClick={() => handleTestEndpoint(ep)}
                                        disabled={endpointTestStatus[ep.id] === 'testing'}
                                        className="px-2.5 py-1 text-xs rounded-md border border-border-subtle bg-bg-input hover:bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                        title="Test Connection"
                                    >
                                        {endpointTestStatus[ep.id] === 'testing' ? (
                                            <Loader2 size={12} className="animate-spin text-accent-primary" />
                                        ) : endpointTestStatus[ep.id] === 'success' ? (
                                            <Check size={12} className="text-emerald-400" />
                                        ) : (
                                            'Test'
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleToggleEndpoint(ep)}
                                        className={`px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer ${
                                            ep.enabled
                                                ? 'border-border-subtle bg-bg-input text-text-secondary hover:text-text-primary'
                                                : 'border-accent-primary/40 bg-accent-primary/10 text-accent-primary'
                                        }`}
                                    >
                                        {ep.enabled ? 'Disable' : 'Enable'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteEndpoint(ep.id, ep.name)}
                                        className="p-1.5 text-text-secondary hover:text-red-400 rounded-md hover:bg-red-500/10 transition-colors cursor-pointer"
                                        title="Remove Endpoint"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Add Endpoint Form */}
                {isAddingEndpoint && (
                    <div className="bg-bg-item-surface rounded-xl p-5 border border-border-subtle space-y-4 animated fadeIn">
                        <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                            <h4 className="text-xs font-bold text-text-primary uppercase tracking-wide">
                                Add OpenAI-Compatible Endpoint
                            </h4>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsAddingEndpoint(false);
                                    setNewEndpointTestError('');
                                }}
                                className="text-xs text-text-secondary hover:text-text-primary cursor-pointer"
                            >
                                Cancel
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[11px] font-medium text-text-secondary mb-1">
                                    Display Name <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. OpenRouter or Local vLLM"
                                    value={newEndpoint.name}
                                    onChange={(e) => setNewEndpoint({ ...newEndpoint, name: e.target.value })}
                                    className="w-full bg-bg-input border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-medium text-text-secondary mb-1">
                                    Base URL <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="https://openrouter.ai/api/v1 or http://localhost:8000/v1"
                                    value={newEndpoint.baseUrl}
                                    onChange={(e) => {
                                        const url = e.target.value;
                                        const isLocal = /localhost|127\.0\.0\.1|0\.0\.0\.0|::1/i.test(url);
                                        setNewEndpoint({ ...newEndpoint, baseUrl: url, isLocal: isLocal ? true : newEndpoint.isLocal });
                                    }}
                                    className="w-full bg-bg-input border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary font-mono text-[11px]"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-medium text-text-secondary mb-1">
                                    API Key (optional for local)
                                </label>
                                <input
                                    type="password"
                                    placeholder="sk-..."
                                    value={newEndpoint.apiKey}
                                    onChange={(e) => setNewEndpoint({ ...newEndpoint, apiKey: e.target.value })}
                                    className="w-full bg-bg-input border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary"
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-[11px] font-medium text-text-secondary">
                                        Model ID <span className="text-red-400">*</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleFetchNewEndpointModels}
                                        disabled={!newEndpoint.baseUrl.trim() || endpointFetchingModels}
                                        className="text-[10px] text-accent-primary hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                    >
                                        {endpointFetchingModels ? (
                                            <Loader2 size={10} className="animate-spin" />
                                        ) : (
                                            <RefreshCw size={10} />
                                        )}
                                        <span>Discover Models</span>
                                    </button>
                                </div>
                                {endpointDiscoveredModels.length > 0 ? (
                                    <select
                                        value={newEndpoint.modelId}
                                        onChange={(e) => setNewEndpoint({ ...newEndpoint, modelId: e.target.value })}
                                        className="w-full bg-bg-input border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-primary"
                                    >
                                        <option value="">Select discovered model</option>
                                        {endpointDiscoveredModels.map(id => (
                                            <option key={id} value={id}>{id}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        type="text"
                                        placeholder="e.g. meta-llama/llama-3.3-70b-instruct"
                                        value={newEndpoint.modelId}
                                        onChange={(e) => setNewEndpoint({ ...newEndpoint, modelId: e.target.value })}
                                        className="w-full bg-bg-input border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary font-mono text-[11px]"
                                    />
                                )}
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-6 pt-1">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={newEndpoint.supportsVision}
                                    onChange={(e) => setNewEndpoint({ ...newEndpoint, supportsVision: e.target.checked })}
                                    className="rounded border-border-subtle accent-accent-primary"
                                />
                                <span className="text-xs text-text-secondary">Supports Vision / Multimodal</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={newEndpoint.isLocal}
                                    onChange={(e) => setNewEndpoint({ ...newEndpoint, isLocal: e.target.checked })}
                                    className="rounded border-border-subtle accent-accent-primary"
                                />
                                <span className="text-xs text-text-secondary">Is Local / Loopback Endpoint</span>
                            </label>
                        </div>

                        {newEndpointTestError && (
                            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 flex items-center gap-2">
                                <AlertCircle size={14} className="shrink-0" />
                                <span>{newEndpointTestError}</span>
                            </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
                            <button
                                type="button"
                                onClick={handleTestNewEndpoint}
                                disabled={!newEndpoint.baseUrl.trim() || newEndpointTestStatus === 'testing'}
                                className="px-3 py-1.5 text-xs rounded-lg border border-border-subtle bg-bg-input hover:bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                                {newEndpointTestStatus === 'testing' ? (
                                    <Loader2 size={12} className="animate-spin text-accent-primary" />
                                ) : newEndpointTestStatus === 'success' ? (
                                    <Check size={12} className="text-emerald-400" />
                                ) : null}
                                <span>{newEndpointTestStatus === 'success' ? 'Connected!' : 'Test Connection'}</span>
                            </button>

                            <button
                                type="button"
                                onClick={handleSaveNewEndpoint}
                                disabled={savingEndpoint}
                                className="px-4 py-1.5 bg-accent-primary hover:bg-accent-primary/90 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                                {savingEndpoint && <Loader2 size={12} className="animate-spin" />}
                                <span>Save Endpoint</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Cloud Provider Data Scopes */}
            <div className="space-y-4">
                <div>
                    <h3 className="text-sm font-bold text-text-primary mb-1">Cloud provider data scopes</h3>
                    <p className="text-xs text-text-secondary mb-2">Choose what app context cloud providers may receive.</p>
                </div>
                <div className="bg-bg-item-surface rounded-xl p-4 border border-border-subtle grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {PROVIDER_DATA_SCOPE_OPTIONS.map(option => (
                        <label
                            key={option.key}
                            className="flex items-start gap-3 rounded-lg border border-border-subtle bg-bg-input/70 px-3 py-3 cursor-pointer hover:bg-bg-elevated transition-colors"
                        >
                            <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 accent-accent-primary"
                                checked={providerDataScopes[option.key] !== false}
                                onChange={(event) => handleProviderDataScopeChange(option.key, event.target.checked)}
                            />
                            <span className="min-w-0">
                                <span className="block text-xs font-semibold text-text-primary">{option.label}</span>
                                <span className="block text-[10px] leading-snug text-text-secondary">{option.description}</span>
                            </span>
                        </label>
                    ))}
                </div>
            </div>
        </div>
    );
};
