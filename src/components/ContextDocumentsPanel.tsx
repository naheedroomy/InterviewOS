import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
    FileText,
    UploadCloud,
    Trash2,
    Plus,
    X,
    AlertCircle,
    RefreshCw,
    Search,
} from 'lucide-react';

export type InterviewContextDocumentKind =
    | 'resume'
    | 'project'
    | 'other'
    | 'job_description'
    | 'notes';

export interface InterviewContextDocument {
    id: string;
    name: string;
    fileType: 'md' | 'txt' | 'pdf' | 'docx';
    markdown: string;
    contextKind?: InterviewContextDocumentKind;
    contextDescription?: string;
    sizeBytes: number;
    createdAt: string;
    updatedAt: string;
}

export interface ContextDocumentsPanelProps {
    isLight: boolean;
    workspaceId: string;
    documentIds: string[];
    availableDocs: InterviewContextDocument[];
    onUploadDoc: () => Promise<void>;
    onRemoveDoc: (docId: string) => void;
    onAttachExistingDoc: (docId: string) => void;
    isUploadingDoc: boolean;
    docError: string | null;
}

const formatBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDocKind = (kind?: string): string => {
    if (!kind) return 'Document';
    switch (kind.toLowerCase()) {
        case 'resume':
            return 'Resume';
        case 'project':
            return 'Project';
        case 'job_description':
        case 'jobdescription':
        case 'jd':
            return 'Job Description';
        case 'notes':
        case 'note':
            return 'Notes';
        case 'other':
            return 'Other';
        default:
            return kind.charAt(0).toUpperCase() + kind.slice(1);
    }
};

const getKindBadgeClass = (kind: string | undefined, isLight: boolean): string => {
    const normalized = (kind || '').toLowerCase();
    if (normalized === 'resume') {
        return isLight
            ? 'bg-blue-50 text-blue-700 border-blue-200'
            : 'bg-blue-500/15 text-blue-300 border-blue-500/25';
    }
    if (normalized === 'job_description' || normalized === 'jobdescription' || normalized === 'jd') {
        return isLight
            ? 'bg-purple-50 text-purple-700 border-purple-200'
            : 'bg-purple-500/15 text-purple-300 border-purple-500/25';
    }
    if (normalized === 'notes' || normalized === 'note') {
        return isLight
            ? 'bg-amber-50 text-amber-700 border-amber-200'
            : 'bg-amber-500/15 text-amber-300 border-amber-500/25';
    }
    if (normalized === 'project') {
        return isLight
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25';
    }
    return isLight
        ? 'bg-slate-100 text-slate-700 border-slate-200'
        : 'bg-white/10 text-white/70 border-white/15';
};

const getFileTypeBadgeClass = (fileType: string): string => {
    switch (fileType.toLowerCase()) {
        case 'pdf':
            return 'text-red-400 bg-red-500/10 border-red-500/20';
        case 'docx':
            return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
        case 'md':
        case 'markdown':
            return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
        case 'txt':
        default:
            return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    }
};

export const ContextDocumentsPanel: React.FC<ContextDocumentsPanelProps> = ({
    isLight,
    workspaceId: _workspaceId,
    documentIds,
    availableDocs,
    onUploadDoc,
    onRemoveDoc,
    onAttachExistingDoc,
    isUploadingDoc,
    docError,
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [isReuseModalOpen, setIsReuseModalOpen] = useState(false);
    const [reuseFilterQuery, setReuseFilterQuery] = useState('');

    // Map-based lookup avoids array lookups inside loops & eliminates .filter(Boolean)
    const attachedDocs = useMemo(() => {
        const docMap = new Map<string, InterviewContextDocument>();
        for (const doc of availableDocs) {
            docMap.set(doc.id, doc);
        }
        const list: InterviewContextDocument[] = [];
        for (const id of documentIds) {
            const doc = docMap.get(id);
            if (doc) {
                list.push(doc);
            }
        }
        return list;
    }, [availableDocs, documentIds]);

    const unattachedDocs = useMemo(() => {
        const attachedSet = new Set(documentIds);
        return availableDocs.filter(doc => !attachedSet.has(doc.id));
    }, [availableDocs, documentIds]);

    const filteredUnattachedDocs = useMemo(() => {
        const query = reuseFilterQuery.trim().toLowerCase();
        if (!query) return unattachedDocs;
        return unattachedDocs.filter(doc =>
            doc.name.toLowerCase().includes(query) ||
            (doc.contextKind && doc.contextKind.toLowerCase().includes(query)) ||
            doc.fileType.toLowerCase().includes(query)
        );
    }, [unattachedDocs, reuseFilterQuery]);

    // Handle Escape key to close reuse modal
    useEffect(() => {
        if (!isReuseModalOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsReuseModalOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isReuseModalOpen]);

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragging(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (!isUploadingDoc) {
            void onUploadDoc();
        }
    }, [isUploadingDoc, onUploadDoc]);

    const handleTriggerUpload = useCallback(() => {
        if (!isUploadingDoc) {
            void onUploadDoc();
        }
    }, [isUploadingDoc, onUploadDoc]);

    return (
        <section
            className={`rounded-lg border border-border-subtle ${
                isLight ? 'bg-bg-elevated' : 'bg-bg-secondary'
            } p-3 space-y-3`}
            aria-label="Context Documents"
        >
            {/* Header */}
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                        <h3 className="text-[12px] font-semibold text-text-primary">
                            Context Documents
                        </h3>
                        <span
                            className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
                                isLight ? 'bg-slate-100 text-slate-600' : 'bg-white/10 text-white/70'
                            }`}
                        >
                            {attachedDocs.length}
                        </span>
                    </div>
                    <p className="text-[10.5px] text-text-tertiary truncate">
                        Shared context across all interview rounds.
                    </p>
                </div>
            </div>

            {/* Drag and Drop Dropzone / Click to Browse */}
            <div
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleTriggerUpload}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleTriggerUpload();
                    }
                }}
                role="button"
                tabIndex={0}
                aria-label="Upload resume, job description, or notes"
                className={`relative rounded-lg border border-dashed transition-all cursor-pointer p-3 text-center outline-none ${
                    isDragging
                        ? 'border-accent-primary bg-accent-secondary/30 ring-1 ring-accent-primary/40'
                        : isLight
                            ? 'border-slate-300 hover:border-accent-primary hover:bg-slate-50'
                            : 'border-white/15 hover:border-accent-primary/70 hover:bg-white/4'
                } ${isUploadingDoc ? 'pointer-events-none opacity-70' : ''}`}
            >
                <div className="flex flex-col items-center justify-center gap-1.5">
                    {isUploadingDoc ? (
                        <>
                            <RefreshCw size={18} className="animate-spin text-accent-primary" />
                            <p className="text-[11.5px] font-medium text-text-primary">
                                Uploading document...
                            </p>
                        </>
                    ) : (
                        <>
                            <div
                                className={`h-8 w-8 rounded-full flex items-center justify-center ${
                                    isLight ? 'bg-slate-100 text-text-secondary' : 'bg-white/8 text-text-secondary'
                                }`}
                            >
                                <UploadCloud size={16} />
                            </div>
                            <div>
                                <p className="text-[11.5px] font-medium text-text-primary leading-tight">
                                    Drop Resume, Job Description, or Notes
                                </p>
                                <p className="text-[10px] text-text-tertiary mt-0.5">
                                    or click to browse (.pdf, .docx, .txt, .md)
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Error Message */}
            {docError && (
                <div
                    className="flex items-start gap-2 p-2 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] leading-tight"
                    role="alert"
                >
                    <AlertCircle size={13} className="shrink-0 mt-0.5" />
                    <span>{docError}</span>
                </div>
            )}

            {/* Attached Documents List */}
            <div className="space-y-1.5">
                {attachedDocs.length === 0 ? (
                    <div className="py-2.5 px-2 text-center rounded-md border border-dashed border-border-subtle">
                        <p className="text-[11px] text-text-tertiary">
                            No documents attached yet.
                        </p>
                        <p className="text-[10px] text-text-tertiary mt-0.5 opacity-80">
                            Upload documents to provide background for your answers.
                        </p>
                    </div>
                ) : (
                    attachedDocs.map(doc => {
                        const kindText = formatDocKind(doc.contextKind);
                        const kindClass = getKindBadgeClass(doc.contextKind, isLight);
                        const fileTypeClass = getFileTypeBadgeClass(doc.fileType);

                        return (
                            <div
                                key={doc.id}
                                className={`group rounded-md border p-2 flex items-center justify-between gap-2 transition-colors ${
                                    isLight
                                        ? 'bg-white border-border-subtle hover:border-slate-300'
                                        : 'bg-black/20 border-white/8 hover:border-white/15'
                                }`}
                            >
                                <div className="min-w-0 flex items-center gap-2 flex-1">
                                    <div
                                        className={`h-7 w-7 rounded flex items-center justify-center shrink-0 border text-[9px] font-bold uppercase ${fileTypeClass}`}
                                    >
                                        {doc.fileType}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p
                                            className="truncate text-[12px] font-medium text-text-primary leading-tight"
                                            title={doc.name}
                                        >
                                            {doc.name}
                                        </p>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <span className="text-[10px] text-text-tertiary shrink-0">
                                                {formatBytes(doc.sizeBytes)}
                                            </span>
                                            <span className="text-[10px] text-text-tertiary opacity-40">·</span>
                                            <span
                                                className={`text-[9.5px] px-1.5 py-0.2 rounded border font-medium ${kindClass}`}
                                            >
                                                {kindText}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => onRemoveDoc(doc.id)}
                                    className={`h-7 w-7 rounded-md shrink-0 flex items-center justify-center text-text-tertiary hover:text-red-400 transition-colors ${
                                        isLight ? 'hover:bg-red-50' : 'hover:bg-red-500/10'
                                    }`}
                                    title="Remove from interview"
                                    aria-label={`Remove document ${doc.name}`}
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        );
                    })
                )}
            </div>

            {/* "+ Reuse existing document" button */}
            {unattachedDocs.length > 0 && (
                <button
                    type="button"
                    onClick={() => {
                        setReuseFilterQuery('');
                        setIsReuseModalOpen(true);
                    }}
                    className={`w-full py-1.5 px-3 rounded-md text-[11.5px] font-medium flex items-center justify-center gap-1.5 border border-dashed transition-colors ${
                        isLight
                            ? 'border-accent-primary/40 text-accent-primary hover:bg-accent-secondary/30'
                            : 'border-accent-primary/40 text-accent-primary hover:bg-accent-secondary/20'
                    }`}
                >
                    <Plus size={13} />
                    <span>Reuse existing document ({unattachedDocs.length})</span>
                </button>
            )}

            {/* Reuse Existing Document Modal */}
            {isReuseModalOpen && (
                <div
                    className="fixed inset-0 z-[500] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="reuse-docs-modal-title"
                >
                    <div
                        className={`w-full max-w-[460px] max-h-[85vh] flex flex-col rounded-xl border shadow-2xl overflow-hidden ${
                            isLight ? 'bg-white border-black/10' : 'bg-[#18181A] border-white/10'
                        }`}
                    >
                        {/* Modal Header */}
                        <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <h3
                                    id="reuse-docs-modal-title"
                                    className="text-[13.5px] font-semibold text-text-primary"
                                >
                                    Reuse Existing Document
                                </h3>
                                <p className="mt-0.5 text-[11px] text-text-tertiary">
                                    Attach a previously uploaded document to this interview workspace.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsReuseModalOpen(false)}
                                className={`h-8 w-8 shrink-0 rounded-md flex items-center justify-center text-text-tertiary hover:text-text-primary ${
                                    isLight ? 'hover:bg-black/8' : 'hover:bg-white/10'
                                }`}
                                aria-label="Close dialog"
                            >
                                <X size={15} />
                            </button>
                        </div>

                        {/* Search Filter */}
                        {unattachedDocs.length > 3 && (
                            <div className="px-4 pt-3 pb-1">
                                <div
                                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-[12px] ${
                                        isLight
                                            ? 'bg-slate-50 border-slate-200 text-text-primary'
                                            : 'bg-black/20 border-white/10 text-text-primary'
                                    }`}
                                >
                                    <Search size={13} className="text-text-tertiary shrink-0" />
                                    <input
                                        type="text"
                                        value={reuseFilterQuery}
                                        onChange={(e) => setReuseFilterQuery(e.target.value)}
                                        aria-label="Filter reusable documents"
                                        placeholder="Filter documents..."
                                        className="bg-transparent border-none outline-none text-[12px] text-text-primary placeholder:text-text-tertiary w-full"
                                    />
                                    {reuseFilterQuery && (
                                        <button
                                            type="button"
                                            onClick={() => setReuseFilterQuery('')}
                                            aria-label="Clear filter"
                                            className="text-text-tertiary hover:text-text-primary"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Document List */}
                        <div className="p-4 overflow-y-auto custom-scrollbar space-y-2 max-h-[380px]">
                            {filteredUnattachedDocs.length === 0 ? (
                                <div className="py-6 text-center text-text-tertiary">
                                    <FileText size={24} className="mx-auto mb-2 opacity-40" />
                                    <p className="text-[12px]">
                                        {reuseFilterQuery
                                            ? 'No matching documents found.'
                                            : 'No documents available to reuse.'}
                                    </p>
                                </div>
                            ) : (
                                filteredUnattachedDocs.map(doc => {
                                    const kindText = formatDocKind(doc.contextKind);
                                    const kindClass = getKindBadgeClass(doc.contextKind, isLight);
                                    const fileTypeClass = getFileTypeBadgeClass(doc.fileType);

                                    return (
                                        <div
                                            key={doc.id}
                                            className={`rounded-lg border p-2.5 flex items-center justify-between gap-3 transition-colors ${
                                                isLight
                                                    ? 'bg-slate-50 border-slate-200 hover:bg-slate-100/80'
                                                    : 'bg-white/4 border-white/8 hover:bg-white/8'
                                            }`}
                                        >
                                            <div className="min-w-0 flex items-center gap-2.5 flex-1">
                                                <div
                                                    className={`h-8 w-8 rounded flex items-center justify-center shrink-0 border text-[9.5px] font-bold uppercase ${fileTypeClass}`}
                                                >
                                                    {doc.fileType}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p
                                                        className="truncate text-[12.5px] font-medium text-text-primary"
                                                        title={doc.name}
                                                    >
                                                        {doc.name}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[10.5px] text-text-tertiary">
                                                            {formatBytes(doc.sizeBytes)}
                                                        </span>
                                                        <span className="text-[10.5px] text-text-tertiary opacity-40">·</span>
                                                        <span
                                                            className={`text-[9.5px] px-1.5 py-0.2 rounded border font-medium ${kindClass}`}
                                                        >
                                                            {kindText}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    onAttachExistingDoc(doc.id);
                                                    if (unattachedDocs.length <= 1) {
                                                        setIsReuseModalOpen(false);
                                                    }
                                                }}
                                                className={`px-3 py-1.5 rounded-md text-[11.5px] font-medium flex items-center gap-1.5 transition-colors shrink-0 ${
                                                    isLight
                                                        ? 'bg-slate-900 text-white hover:bg-slate-800'
                                                        : 'bg-accent-primary text-white hover:bg-accent-primary/90'
                                                }`}
                                                aria-label={`Attach ${doc.name} to interview`}
                                            >
                                                <Plus size={12} />
                                                <span>Attach</span>
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="px-4 py-2.5 border-t border-border-subtle flex items-center justify-end">
                            <button
                                type="button"
                                onClick={() => setIsReuseModalOpen(false)}
                                className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                                    isLight
                                        ? 'text-slate-700 hover:bg-slate-100'
                                        : 'text-text-secondary hover:bg-white/8 hover:text-text-primary'
                                }`}
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};

export default ContextDocumentsPanel;
