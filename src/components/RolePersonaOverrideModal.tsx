import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RefreshCw } from 'lucide-react';
import type { InterviewWorkspace } from '../types/electron';

export interface RolePersonaOverrideModalProps {
    isOpen: boolean;
    onClose: () => void;
    workspace: InterviewWorkspace;
    onSave?: (updatedWorkspace: InterviewWorkspace) => void;
}

const RolePersonaOverrideContent: React.FC<RolePersonaOverrideModalProps> = ({
    isOpen,
    onClose,
    workspace,
    onSave,
}) => {
    const [hasCustomOverrides, setHasCustomOverrides] = useState<boolean>(
        Boolean(workspace?.hasCustomOverrides)
    );
    const [candidateBackgroundOverride, setCandidateBackgroundOverride] = useState<string>(
        workspace?.candidateBackgroundOverride || ''
    );
    const [aiPersonaOverride, setAiPersonaOverride] = useState<string>(
        workspace?.aiPersonaOverride || ''
    );

    const [globalCandidateBackground, setGlobalCandidateBackground] = useState<string>('');
    const [globalAiPersona, setGlobalAiPersona] = useState<string>('');
    const [isLoadingGlobals, setIsLoadingGlobals] = useState<boolean>(false);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch global background & persona for preview
    useEffect(() => {
        if (!isOpen) return;
        let isCancelled = false;
        setIsLoadingGlobals(true);

        const fetchGlobals = async () => {
            try {
                const [notesRes, personaRes] = await Promise.allSettled([
                    window.electronAPI?.profileGetNotes ? window.electronAPI.profileGetNotes() : Promise.resolve(null),
                    window.electronAPI?.profileGetPersona ? window.electronAPI.profileGetPersona() : Promise.resolve(null),
                ]);

                if (isCancelled) return;

                if (notesRes.status === 'fulfilled' && notesRes.value?.success) {
                    setGlobalCandidateBackground(notesRes.value.content || '');
                }
                if (personaRes.status === 'fulfilled' && personaRes.value?.success) {
                    setGlobalAiPersona(personaRes.value.content || '');
                }
            } catch (err: any) {
                console.error('[RolePersonaOverrideModal] Failed to fetch global settings:', err);
            } finally {
                if (!isCancelled) {
                    setIsLoadingGlobals(false);
                }
            }
        };

        void fetchGlobals();

        return () => {
            isCancelled = true;
        };
    }, [isOpen]);

    const handleSave = useCallback(async () => {
        if (!workspace?.id || isSaving) return;
        setIsSaving(true);
        setError(null);
        try {
            const res = await window.electronAPI.interviewWorkspaceUpdatePersonaOverrides({
                workspaceId: workspace.id,
                hasCustomOverrides,
                candidateBackgroundOverride: candidateBackgroundOverride.trim(),
                aiPersonaOverride: aiPersonaOverride.trim(),
            });

            if (res?.success && res.workspace) {
                onSave?.(res.workspace);
                onClose();
            } else {
                setError(res?.error || 'Failed to update role and persona overrides');
            }
        } catch (err: any) {
            setError(err?.message || 'Failed to update overrides');
        } finally {
            setIsSaving(false);
        }
    }, [
        workspace?.id,
        isSaving,
        hasCustomOverrides,
        candidateBackgroundOverride,
        aiPersonaOverride,
        onSave,
        onClose,
    ]);

    // Keyboard navigation (Esc to cancel, ⌘↵ / Ctrl+Enter to save)
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void handleSave();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, handleSave]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                    onClick={onClose}
                    className="fixed inset-0 bg-black/75 backdrop-blur-sm"
                    aria-hidden="true"
                />

                {/* Modal Window */}
                <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="role-persona-modal-title"
                    initial={{ opacity: 0, scale: 0.97, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97, y: 6 }}
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    className="relative w-full max-w-[620px] bg-[#121214] text-zinc-200 rounded-xl border border-white/[0.07] shadow-2xl overflow-hidden flex flex-col z-10 select-none"
                >
                    {/* Header */}
                    <div className="px-6 py-4 flex items-center justify-between border-b border-white/[0.07]">
                        <div className="flex items-center gap-2.5 min-w-0 pr-4">
                            <span className="text-amber-400 text-[15px] font-medium leading-none shrink-0 select-none">
                                ⚡
                            </span>
                            <h2
                                id="role-persona-modal-title"
                                className="text-[14px] font-semibold text-zinc-100 truncate tracking-tight"
                            >
                                Role &amp; Persona Tuning —{' '}
                                <span className="text-zinc-300 font-normal">{workspace?.title || 'Current Interview'}</span>
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-7 w-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors shrink-0"
                            aria-label="Close dialog"
                        >
                            <X size={15} />
                        </button>
                    </div>

                    {/* Override Toggle Strip */}
                    <div className="px-6 py-3.5 flex items-center justify-between border-b border-white/[0.07] bg-zinc-900/40">
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                id="role-override-checkbox"
                                checked={hasCustomOverrides}
                                onChange={(e) => setHasCustomOverrides(e.target.checked)}
                                className="sr-only"
                            />
                            <button
                                type="button"
                                role="switch"
                                aria-checked={hasCustomOverrides}
                                aria-labelledby="role-override-checkbox-label"
                                onClick={() => setHasCustomOverrides((prev) => !prev)}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-150 ease-out border focus:outline-none focus:ring-1 focus:ring-amber-500/50 ${
                                    hasCustomOverrides
                                        ? 'bg-amber-500/20 border-amber-500/60'
                                        : 'bg-zinc-800 border-white/[0.07]'
                                }`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full transition duration-150 ease-out mt-[2px] ${
                                        hasCustomOverrides
                                            ? 'translate-x-[18px] bg-amber-400'
                                            : 'translate-x-[2px] bg-zinc-400'
                                    }`}
                                />
                            </button>
                            <label
                                id="role-override-checkbox-label"
                                htmlFor="role-override-checkbox"
                                className="text-[13px] font-medium text-zinc-200 cursor-pointer"
                            >
                                Override Global Settings for this Interview
                            </label>
                        </div>

                        {!hasCustomOverrides && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-zinc-800/90 text-zinc-400 border border-white/[0.07]">
                                Inheriting from Global Settings
                            </span>
                        )}
                    </div>

                    {/* Body Content */}
                    <div className="px-6 py-5 space-y-4 max-h-[62vh] overflow-y-auto custom-scrollbar select-text">
                        {!hasCustomOverrides ? (
                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label
                                        htmlFor="preview-candidate-background"
                                        className="block text-[12px] font-medium text-zinc-400"
                                    >
                                        Active Candidate Background
                                    </label>
                                    <textarea
                                        id="preview-candidate-background"
                                        readOnly
                                        disabled
                                        value={
                                            isLoadingGlobals
                                                ? 'Loading active settings...'
                                                : globalCandidateBackground.trim() ||
                                                  '(No global candidate background set. You can set it in Settings > Profile Intelligence or enable overrides above.)'
                                        }
                                        rows={4}
                                        className="w-full rounded-lg bg-zinc-900/40 border border-white/[0.05] px-3 py-2 text-[13px] text-zinc-400 resize-none leading-relaxed cursor-not-allowed font-normal select-text focus:outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label
                                        htmlFor="preview-ai-persona"
                                        className="block text-[12px] font-medium text-zinc-400"
                                    >
                                        Active AI Persona &amp; Style
                                    </label>
                                    <textarea
                                        id="preview-ai-persona"
                                        readOnly
                                        disabled
                                        value={
                                            isLoadingGlobals
                                                ? 'Loading active settings...'
                                                : globalAiPersona.trim() ||
                                                  '(Default AnswerCue assistant persona. You can customize in Settings > Profile Intelligence or enable overrides above.)'
                                        }
                                        rows={4}
                                        className="w-full rounded-lg bg-zinc-900/40 border border-white/[0.05] px-3 py-2 text-[13px] text-zinc-400 resize-none leading-relaxed cursor-not-allowed font-normal select-text focus:outline-none"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label
                                            htmlFor="role-candidate-background"
                                            className="block text-[12px] font-medium text-zinc-200"
                                        >
                                            Role-Specific Candidate Background
                                        </label>
                                        <span className="text-[11px] text-zinc-500">
                                            Projects, metrics, tech stack to emphasize
                                        </span>
                                    </div>
                                    <textarea
                                        id="role-candidate-background"
                                        value={candidateBackgroundOverride}
                                        onChange={(e) => setCandidateBackgroundOverride(e.target.value)}
                                        placeholder="e.g. 10 years distributed systems, Go and Raft, tech lead at Stripe. Emphasize high-throughput messaging, zero-downtime migrations, and executive trade-offs..."
                                        rows={4}
                                        className="w-full rounded-lg bg-zinc-900/80 border border-white/[0.07] px-3 py-2 text-[13px] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-colors resize-none leading-relaxed"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label
                                            htmlFor="role-ai-persona"
                                            className="block text-[12px] font-medium text-zinc-200"
                                        >
                                            Role-Specific AI Persona &amp; Style
                                        </label>
                                        <span className="text-[11px] text-zinc-500">
                                            Persona, answering style, tone
                                        </span>
                                    </div>
                                    <textarea
                                        id="role-ai-persona"
                                        value={aiPersonaOverride}
                                        onChange={(e) => setAiPersonaOverride(e.target.value)}
                                        placeholder="e.g. Staff Engineer: state architecture trade-offs first, concise bullet points, direct communication..."
                                        rows={4}
                                        className="w-full rounded-lg bg-zinc-900/80 border border-white/[0.07] px-3 py-2 text-[13px] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-colors resize-none leading-relaxed"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer Actions */}
                    <div className="px-6 py-4 border-t border-white/[0.07] flex items-center justify-between bg-zinc-900/30">
                        <div className="min-w-0 flex-1 mr-4">
                            {error ? (
                                <p className="text-[12px] text-red-400 truncate">{error}</p>
                            ) : (
                                <p className="text-[11px] text-zinc-500 truncate select-none">
                                    Esc to cancel · ⌘↵ to save
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isSaving}
                                className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleSave()}
                                disabled={isSaving}
                                className="px-4 py-1.5 rounded-lg text-[13px] font-semibold text-amber-950 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
                            >
                                {isSaving ? (
                                    <>
                                        <RefreshCw size={13} className="animate-spin text-amber-950" />
                                        <span>Saving...</span>
                                    </>
                                ) : (
                                    <span>Save Overrides</span>
                                )}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
    );
};

export const RolePersonaOverrideModal: React.FC<RolePersonaOverrideModalProps> = (props) => {
    return (
        <AnimatePresence>
            {props.isOpen && (
                <RolePersonaOverrideContent
                    key={`${props.workspace?.id || 'workspace'}-${props.workspace?.updatedAt || 'initial'}`}
                    {...props}
                />
            )}
        </AnimatePresence>
    );
};

export default RolePersonaOverrideModal;

