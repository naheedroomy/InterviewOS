import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  FileText,
  UploadCloud,
  Trash2,
  Plus,
  X,
  Search,
  Check,
  Eye,
  Link2,
  AlertTriangle,
  FileCode,
  Copy,
  ExternalLink,
  FolderPlus,
  HardDrive,
  Clock,
  Layers,
} from 'lucide-react';

export interface KnowledgeDocument {
  id: string;
  name: string;
  fileType: 'md' | 'txt' | 'pdf' | 'docx';
  markdown: string;
  contextKind?: 'resume' | 'project' | 'other' | 'job_description' | 'notes';
  contextDescription?: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceUsageItem {
  workspaceId: string;
  workspaceTitle: string;
}

export interface KnowledgeBankViewProps {
  isLight?: boolean;
  onAttachToWorkspace?: (documentId: string, workspaceId: string) => void;
  onOpenWorkspace?: (workspaceId: string) => void;
  onClose?: () => void;
  currentWorkspaceId?: string;
}

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatWordCount = (markdown: string): string => {
  if (!markdown || !markdown.trim()) return '0 words';
  const count = markdown.trim().split(/\s+/).filter(Boolean).length;
  return `~${count.toLocaleString()} words`;
};

const formatDate = (isoString?: string): string => {
  if (!isoString) return 'Recent';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Recent';
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'Recent';
  }
};

const getFileTypeBadge = (fileType: string) => {
  const ext = fileType.toLowerCase();
  switch (ext) {
    case 'pdf':
      return {
        label: 'PDF',
        bg: 'bg-red-500/10 text-red-400 border-red-500/20',
        icon: FileText,
      };
    case 'docx':
      return {
        label: 'DOCX',
        bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        icon: FileText,
      };
    case 'md':
      return {
        label: 'MD',
        bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        icon: FileCode,
      };
    case 'txt':
    default:
      return {
        label: 'TXT',
        bg: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
        icon: FileText,
      };
  }
};

const formatDocKind = (kind?: string): string => {
  if (!kind) return 'Document';
  switch (kind.toLowerCase()) {
    case 'resume':
      return 'Master Resume';
    case 'project':
      return 'System & Project';
    case 'job_description':
    case 'jobdescription':
    case 'jd':
      return 'Target Role Spec';
    case 'notes':
    case 'note':
      return 'Cheat Sheet & Notes';
    case 'other':
    default:
      return 'General Asset';
  }
};

export const KnowledgeBankView: React.FC<KnowledgeBankViewProps> = ({
  isLight = false,
  onAttachToWorkspace,
  onOpenWorkspace,
  onClose,
  currentWorkspaceId,
}) => {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [usage, setUsage] = useState<Record<string, WorkspaceUsageItem[]>>({});
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; title: string; documentIds?: string[] }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKindFilter, setSelectedKindFilter] = useState<'all' | 'resume' | 'job_description' | 'project' | 'notes' | 'other'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Modals state
  const [previewDoc, setPreviewDoc] = useState<KnowledgeDocument | null>(null);
  const [attachDoc, setAttachDoc] = useState<KnowledgeDocument | null>(null);
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState<{
    doc: KnowledgeDocument;
    linkedWorkspaces: WorkspaceUsageItem[];
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedPreview, setCopiedPreview] = useState(false);

  const themeClasses = isLight
    ? {
        root: 'bg-slate-50 text-slate-900',
        header: 'bg-white border-slate-200',
        card: 'bg-white border-slate-200 hover:border-slate-300 text-slate-900',
        cardTitle: 'text-slate-900 group-hover:text-amber-600',
        metaText: 'text-slate-600',
        badgeInactive: 'bg-slate-100 text-slate-600 border-slate-200',
        input: 'bg-slate-100 border-slate-300 text-slate-900 placeholder-slate-400',
      }
    : {
        root: 'bg-[#121214] text-[#fafafa]',
        header: 'bg-[#16161a] border-white/[0.07]',
        card: 'bg-[#18181b] border-white/[0.07] hover:border-white/[0.14] text-white',
        cardTitle: 'text-zinc-100 group-hover:text-amber-300',
        metaText: 'text-zinc-400',
        badgeInactive: 'bg-zinc-800/50 text-zinc-400 border-zinc-700/40',
        input: 'bg-[#1c1c21] border-white/[0.07] text-zinc-100 placeholder-zinc-500',
      };

  // Load all data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [docsList, usageResult, wsListResult] = await Promise.all([
        window.electronAPI?.interviewDocsList?.() ?? [],
        window.electronAPI?.knowledgeBankGetDocumentUsage?.() ?? { success: false, usage: {} },
        window.electronAPI?.interviewWorkspaceList?.() ?? { success: false, workspaces: [] },
      ]);

      setDocuments(Array.isArray(docsList) ? docsList : []);
      if (usageResult?.success && usageResult.usage) {
        setUsage(usageResult.usage);
      }
      if (wsListResult?.success && Array.isArray(wsListResult.workspaces)) {
        setWorkspaces(wsListResult.workspaces);
      }
    } catch (err) {
      console.error('[KnowledgeBankView] Failed to load documents and usage:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Keyboard escape listener for modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewDoc) setPreviewDoc(null);
        else if (attachDoc) setAttachDoc(null);
        else if (deleteConfirmDoc) setDeleteConfirmDoc(null);
        else if (onClose) onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewDoc, attachDoc, deleteConfirmDoc, onClose]);

  // Upload handler via native dialog
  const handleUploadFromDialog = async () => {
    setUploadError(null);
    setIsUploading(true);
    try {
      const result = await window.electronAPI?.interviewDocsUpload?.();
      if (result?.cancelled) return;
      if (!result?.success || !result.document) {
        setUploadError(result?.error || 'Could not upload document.');
        return;
      }
      await loadData();
    } catch (err: any) {
      console.error('[KnowledgeBankView] Upload error:', err);
      setUploadError(err?.message || 'Could not upload document.');
    } finally {
      setIsUploading(false);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    setUploadError(null);

    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;

    setIsUploading(true);
    try {
      const uploadPromises = files.map(async file => {
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        if (!['.pdf', '.docx', '.txt', '.md', '.markdown'].includes(ext)) {
          return { success: false, error: `Unsupported format "${ext}". Please drop .pdf, .docx, .txt, or .md files.` };
        }

        const filePath = window.electronAPI?.getPathForFile?.(file) || (file as any).path;
        if (filePath && window.electronAPI?.interviewDocsUploadFromPath) {
          return window.electronAPI.interviewDocsUploadFromPath(filePath);
        } else {
          return window.electronAPI?.interviewDocsUpload?.();
        }
      });

      const results = await Promise.all(uploadPromises);
      const firstError = results.find(r => r && !r.success && !r.cancelled);
      if (firstError?.error) {
        setUploadError(firstError.error);
      }
      await loadData();
    } catch (err: any) {
      console.error('[KnowledgeBankView] Drop upload failed:', err);
      setUploadError(err?.message || 'Failed to upload dropped files.');
    } finally {
      setIsUploading(false);
    }
  };

  // Delete document handler
  const handleDeleteDocument = async (id: string) => {
    setIsDeleting(true);
    try {
      const res = await window.electronAPI?.interviewDocsDelete?.(id);
      if (res?.success) {
        setDeleteConfirmDoc(null);
        await loadData();
      } else {
        setUploadError(res?.error || 'Failed to delete document.');
      }
    } catch (err: any) {
      console.error('[KnowledgeBankView] Delete failed:', err);
      setUploadError(err?.message || 'Failed to delete document.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Toggle workspace attachment
  const handleToggleAttach = async (docId: string, wsId: string) => {
    const ws = workspaces.find(w => w.id === wsId);
    if (!ws) return;

    const currentDocs = Array.isArray(ws.documentIds) ? ws.documentIds : [];
    const isAttached = currentDocs.includes(docId);
    const nextDocs = isAttached
      ? currentDocs.filter(id => id !== docId)
      : [...currentDocs, docId];

    try {
      if (window.electronAPI?.interviewWorkspaceUpdateDocuments) {
        await window.electronAPI.interviewWorkspaceUpdateDocuments({
          workspaceId: wsId,
          documentIds: nextDocs,
        });
      }

      setWorkspaces(prev =>
        prev.map(w => (w.id === wsId ? { ...w, documentIds: nextDocs } : w))
      );

      // Re-fetch usage to update badge immediately
      const usageRes = await window.electronAPI?.knowledgeBankGetDocumentUsage?.();
      if (usageRes?.success && usageRes.usage) {
        setUsage(usageRes.usage);
      }

      if (onAttachToWorkspace) {
        onAttachToWorkspace(docId, wsId);
      }
    } catch (err) {
      console.error('[KnowledgeBankView] Failed to toggle attachment:', err);
    }
  };

  // Copy preview markdown
  const handleCopyPreview = async () => {
    if (!previewDoc) return;
    try {
      await navigator.clipboard.writeText(previewDoc.markdown);
      setCopiedPreview(true);
      setTimeout(() => setCopiedPreview(false), 2000);
    } catch (err) {
      console.error('[KnowledgeBankView] Clipboard copy failed:', err);
    }
  };

  // Filter and metrics calculation
  const filteredDocs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return documents.filter(doc => {
      const matchesSearch =
        !q ||
        doc.name.toLowerCase().includes(q) ||
        (doc.markdown && doc.markdown.toLowerCase().includes(q)) ||
        (doc.contextKind && doc.contextKind.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (selectedKindFilter === 'all') return true;
      if (selectedKindFilter === 'resume') return doc.contextKind === 'resume';
      if (selectedKindFilter === 'job_description')
        return ['job_description', 'jobdescription', 'jd'].includes(doc.contextKind || '');
      if (selectedKindFilter === 'project') return doc.contextKind === 'project';
      if (selectedKindFilter === 'notes') return ['notes', 'note'].includes(doc.contextKind || '');
      if (selectedKindFilter === 'other') return !doc.contextKind || doc.contextKind === 'other';

      return true;
    });
  }, [documents, searchQuery, selectedKindFilter]);

  const totalStorageBytes = useMemo(() => {
    return documents.reduce((acc, d) => acc + (d.sizeBytes || 0), 0);
  }, [documents]);

  const attachedWorkspaceIdSet = useMemo(() => {
    if (!attachDoc) return new Set<string>();
    const docId = attachDoc.id;
    return new Set(
      workspaces
        .filter(w => Array.isArray(w.documentIds) && w.documentIds.includes(docId))
        .map(w => w.id)
    );
  }, [workspaces, attachDoc]);

  return (
    <div
      className={`flex flex-col w-full h-full min-h-0 select-none font-sans overflow-hidden ${themeClasses.root}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Top Header Bar */}
      <header className={`flex-shrink-0 border-b px-6 py-4 ${themeClasses.header}`}>
        <div className="flex flex-wrap items-center justify-between gap-4 max-w-7xl mx-auto">
          {/* Title & Storage Metrics */}
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="flex items-center justify-center w-7 h-7 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <HardDrive className="w-4 h-4" />
                </span>
                <h1 className="text-base font-semibold tracking-tight text-white">
                  Knowledge Bank
                </h1>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Master candidate assets grounding the AI copilot across interview rounds
              </p>
            </div>

            <div className="hidden sm:flex items-center gap-3 pl-4 border-l border-white/[0.07] text-xs font-mono tabular-nums text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-zinc-500" />
                <strong className="text-zinc-200 font-semibold">{documents.length}</strong> {documents.length === 1 ? 'doc' : 'docs'}
              </span>
              <span className="text-zinc-600">•</span>
              <span className="flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-zinc-500" />
                <strong className="text-zinc-200 font-semibold">{formatBytes(totalStorageBytes)}</strong> total
              </span>
            </div>
          </div>

          {/* Search and Upload Actions */}
          <div className="flex items-center gap-3 flex-1 sm:flex-initial justify-end">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
              <label htmlFor="kb-search-input" className="sr-only">
                Search documents
              </label>
              <input
                id="kb-search-input"
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search documents..."
                aria-label="Search documents"
                className={`w-full pl-9 pr-8 py-1.5 text-xs rounded-md focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 focus:outline-none transition-colors ${themeClasses.input}`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search query"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleUploadFromDialog}
              disabled={isUploading}
              aria-label="Upload document to Knowledge Bank"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950 font-medium text-xs shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              {isUploading ? (
                <span className="w-3.5 h-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              )}
              <span>Upload Document</span>
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close Knowledge Bank"
                className="p-1.5 text-zinc-400 hover:text-zinc-200 rounded-md hover:bg-white/[0.05] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 mt-3 max-w-7xl mx-auto overflow-x-auto pb-1 text-xs">
          <button
            type="button"
            onClick={() => setSelectedKindFilter('all')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              selectedKindFilter === 'all'
                ? 'bg-amber-500/15 text-amber-300 font-medium border border-amber-500/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
          >
            All ({documents.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedKindFilter('resume')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              selectedKindFilter === 'resume'
                ? 'bg-amber-500/15 text-amber-300 font-medium border border-amber-500/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
          >
            Resumes
          </button>
          <button
            type="button"
            onClick={() => setSelectedKindFilter('job_description')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              selectedKindFilter === 'job_description'
                ? 'bg-amber-500/15 text-amber-300 font-medium border border-amber-500/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
          >
            Job Specs
          </button>
          <button
            type="button"
            onClick={() => setSelectedKindFilter('project')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              selectedKindFilter === 'project'
                ? 'bg-amber-500/15 text-amber-300 font-medium border border-amber-500/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
          >
            System & Projects
          </button>
          <button
            type="button"
            onClick={() => setSelectedKindFilter('notes')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              selectedKindFilter === 'notes'
                ? 'bg-amber-500/15 text-amber-300 font-medium border border-amber-500/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
          >
            Cheat Sheets & Notes
          </button>
        </div>
      </header>

      {/* Upload Error Banner */}
      {uploadError && (
        <div className="flex items-center justify-between px-6 py-2 bg-red-500/10 border-b border-red-500/20 text-red-300 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
            <span>{uploadError}</span>
          </div>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            aria-label="Dismiss error"
            className="p-1 hover:text-red-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 overflow-y-auto px-6 py-6 max-w-7xl w-full mx-auto">
        {/* Dropzone Banner */}
        <button
          type="button"
          aria-label="Upload document by clicking or dropping files"
          onClick={handleUploadFromDialog}
          className={`w-full text-left mb-6 p-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors focus-visible:ring-1 focus-visible:ring-amber-500/50 focus-visible:outline-none ${
            isDraggingOver
              ? 'border-amber-500/60 bg-amber-500/[0.04]'
              : 'border-white/[0.08] hover:border-amber-500/30 bg-[#16161a]/60 hover:bg-[#16161a]'
          }`}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span
                className={`p-2 rounded-md ${
                  isDraggingOver
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-white/[0.04] text-zinc-400'
                }`}
              >
                <UploadCloud className="w-5 h-5" />
              </span>
              <div>
                <p className="text-xs font-medium text-zinc-200">
                  Drag & drop files here, or{' '}
                  <span className="text-amber-400 underline underline-offset-2">
                    browse files
                  </span>
                </p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Supports PDF, DOCX, TXT, and Markdown (up to 15 MB)
                </p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-zinc-400">
              <span className="px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.07]">
                .pdf
              </span>
              <span className="px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.07]">
                .docx
              </span>
              <span className="px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.07]">
                .md
              </span>
              <span className="px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.07]">
                .txt
              </span>
            </div>
          </div>
        </button>

        {/* Loading Skeleton */}
        {isLoading && documents.length === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(n => (
              <div
                key={n}
                className="h-44 rounded-lg bg-[#18181b] border border-white/[0.07] animate-pulse p-4 flex flex-col justify-between"
              >
                <div className="space-y-2.5">
                  <div className="w-1/3 h-4 bg-white/[0.05] rounded" />
                  <div className="w-3/4 h-3 bg-white/[0.04] rounded" />
                </div>
                <div className="w-1/2 h-3 bg-white/[0.04] rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Empty State (0 total documents) */}
        {!isLoading && documents.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-16 px-4 max-w-md mx-auto">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4">
              <FileText className="w-6 h-6" />
            </div>
            <h2 className="text-sm font-semibold text-zinc-100">
              Knowledge Bank is empty
            </h2>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              Upload your master resumes, project portfolios, system design cheat sheets, and target role specs.
              The AI copilot references these foundational assets across all interview rounds to deliver precision context grounded in your real-world achievements.
            </p>
            <button
              type="button"
              onClick={handleUploadFromDialog}
              disabled={isUploading}
              aria-label="Upload your first document"
              className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium text-xs transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Upload First Document</span>
            </button>
          </div>
        )}

        {/* Empty Search Results */}
        {!isLoading && documents.length > 0 && filteredDocs.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-12 px-4 max-w-sm mx-auto">
            <Search className="w-8 h-8 text-zinc-600 mb-3" />
            <h2 className="text-sm font-semibold text-zinc-200">No documents found</h2>
            <p className="text-xs text-zinc-400 mt-1">
              No assets match &ldquo;{searchQuery}&rdquo; in this filter view.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedKindFilter('all');
              }}
              aria-label="Clear document search and filters"
              className="mt-4 px-3 py-1.5 text-xs text-amber-400 hover:text-amber-300 font-medium underline underline-offset-2"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Document Cards Grid */}
        {!isLoading && filteredDocs.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDocs.map(doc => {
              const badge = getFileTypeBadge(doc.fileType);
              const BadgeIcon = badge.icon;
              const linkedWorkspaces = usage[doc.id] || [];
              const isAttachedToCurrent = Boolean(
                currentWorkspaceId &&
                  linkedWorkspaces.some(w => w.workspaceId === currentWorkspaceId)
              );

              return (
                <article
                  key={doc.id}
                  className={`group relative flex flex-col justify-between rounded-lg transition-colors p-4 focus-within:ring-1 focus-within:ring-amber-500/50 ${themeClasses.card}`}
                >
                  {/* Card Header: Type Badge & Kind */}
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono font-medium border ${badge.bg}`}
                        >
                          <BadgeIcon className="w-3 h-3" />
                          <span>{badge.label}</span>
                        </span>
                        <span className="text-[11px] text-zinc-400 font-medium truncate max-w-[140px]">
                          {formatDocKind(doc.contextKind)}
                        </span>
                      </div>

                      {/* Attached Indicator if matches current active workspace */}
                      {isAttachedToCurrent && (
                        <span
                          title="Attached to current active interview workspace"
                          className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded"
                        >
                          <Check className="w-2.5 h-2.5" />
                          <span>Active</span>
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h3
                      title={doc.name}
                      className={`text-xs font-semibold line-clamp-2 leading-snug transition-colors ${themeClasses.cardTitle}`}
                    >
                      {doc.name}
                    </h3>

                    {/* Metadata: size, words, date */}
                    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-mono tabular-nums mt-2 ${themeClasses.metaText}`}>
                      <span>{formatBytes(doc.sizeBytes)}</span>
                      <span className="opacity-50">•</span>
                      <span>{formatWordCount(doc.markdown)}</span>
                      <span className="opacity-50">•</span>
                      <span>{formatDate(doc.createdAt)}</span>
                    </div>

                    {/* Cross-Interview Usage Badge */}
                    <div className="mt-3 pt-2.5 border-t border-white/[0.05]">
                      {linkedWorkspaces.length > 0 ? (
                        <div
                          title={`Used in: ${linkedWorkspaces
                            .map(w => w.workspaceTitle)
                            .join(', ')}`}
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20 max-w-full"
                        >
                          <Link2 className="w-3 h-3 flex-shrink-0 text-amber-400" />
                          <span className="truncate">
                            Used in:{' '}
                            {linkedWorkspaces.slice(0, 2).map((w, idx) => (
                              <React.Fragment key={w.workspaceId}>
                                {idx > 0 && ', '}
                                {onOpenWorkspace ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onOpenWorkspace(w.workspaceId);
                                    }}
                                    className="hover:underline hover:text-amber-200"
                                  >
                                    {w.workspaceTitle}
                                  </button>
                                ) : (
                                  w.workspaceTitle
                                )}
                              </React.Fragment>
                            ))}
                            {linkedWorkspaces.length > 2 &&
                              ` +${linkedWorkspaces.length - 2} more`}
                          </span>
                        </div>
                      ) : (
                        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border ${themeClasses.badgeInactive}`}>
                          <span>Not attached to any interview</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Actions Footer */}
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-white/[0.05]">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPreviewDoc(doc)}
                        aria-label={`Preview ${doc.name}`}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setAttachDoc(doc)}
                        aria-label={`Attach ${doc.name} to interview workspace`}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] transition-colors"
                      >
                        <FolderPlus className="w-3.5 h-3.5" />
                        <span>Attach</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setDeleteConfirmDoc({
                          doc,
                          linkedWorkspaces,
                        })
                      }
                      aria-label={`Delete ${doc.name}`}
                      className="p-1 text-zinc-500 hover:text-red-400 rounded hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* Quick Text Preview Modal */}
      {previewDoc && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
        >
          <div className="relative flex flex-col w-full max-w-3xl max-h-[85vh] bg-[#16161a] border border-white/[0.12] rounded-xl shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.07] bg-[#18181b]">
              <div className="min-w-0 pr-4">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono uppercase font-semibold border ${
                      getFileTypeBadge(previewDoc.fileType).bg
                    }`}
                  >
                    {previewDoc.fileType}
                  </span>
                  <span className="text-xs text-zinc-400 font-mono tabular-nums">
                    {formatBytes(previewDoc.sizeBytes)} • {formatWordCount(previewDoc.markdown)}
                  </span>
                </div>
                <h2
                  id="preview-modal-title"
                  className="text-sm font-semibold text-white truncate"
                >
                  {previewDoc.name}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyPreview}
                  aria-label="Copy text to clipboard"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-mono text-zinc-300 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] transition-colors"
                >
                  {copiedPreview ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Text</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  aria-label="Close document preview"
                  className="p-1.5 text-zinc-400 hover:text-white rounded-md hover:bg-white/[0.08] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body: Text Viewer */}
            <div className="flex-1 min-h-0 overflow-y-auto p-5 bg-[#121214] font-mono text-xs leading-relaxed text-zinc-300 select-text whitespace-pre-wrap">
              {previewDoc.markdown || (
                <span className="text-zinc-500 italic">Document text is empty.</span>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.07] bg-[#18181b] text-xs text-zinc-400">
              <span className="font-mono text-[11px]">
                Grounding copilot with full text extraction
              </span>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="px-3 py-1 rounded bg-white/[0.08] hover:bg-white/[0.12] text-zinc-200 text-xs font-medium transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attach to Interview Workspace Modal */}
      {attachDoc && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="attach-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
        >
          <div className="relative flex flex-col w-full max-w-md max-h-[80vh] bg-[#16161a] border border-white/[0.12] rounded-xl shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.07] bg-[#18181b]">
              <div className="min-w-0 pr-4">
                <h2
                  id="attach-modal-title"
                  className="text-sm font-semibold text-white truncate"
                >
                  Attach to Interview Workspace
                </h2>
                <p className="text-xs text-zinc-400 truncate mt-0.5">
                  &ldquo;{attachDoc.name}&rdquo;
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAttachDoc(null)}
                aria-label="Close attach modal"
                className="p-1.5 text-zinc-400 hover:text-white rounded-md hover:bg-white/[0.08] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body: Workspace list */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2 bg-[#121214]">
              {workspaces.length === 0 ? (
                <div className="text-center py-8 text-xs text-zinc-400">
                  No interview workspaces found. Create one first from the sidebar.
                </div>
              ) : (
                workspaces.map(ws => {
                  const isAttached = attachedWorkspaceIdSet.has(ws.id);
                  const isCurrent = currentWorkspaceId === ws.id;

                  return (
                    <div
                      key={ws.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-[#1c1c21] border border-white/[0.07] hover:border-white/[0.12] transition-colors"
                    >
                      <div className="min-w-0 pr-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-zinc-100 truncate">
                            {ws.title}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1 rounded">
                              Current
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-mono text-zinc-400">
                          {(ws.documentIds || []).length} active {ws.documentIds?.length === 1 ? 'asset' : 'assets'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {onOpenWorkspace && (
                          <button
                            type="button"
                            onClick={() => {
                              setAttachDoc(null);
                              onOpenWorkspace(ws.id);
                            }}
                            title={`Open ${ws.title}`}
                            className="p-1.5 text-zinc-400 hover:text-amber-400 rounded hover:bg-white/[0.05] transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleToggleAttach(attachDoc.id, ws.id)}
                          aria-label={
                            isAttached
                              ? `Detach from ${ws.title}`
                              : `Attach to ${ws.title}`
                          }
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                            isAttached
                              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25'
                              : 'bg-white/[0.05] text-zinc-300 border border-white/[0.08] hover:bg-white/[0.1]'
                          }`}
                        >
                          {isAttached ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-amber-400" />
                              <span>Attached</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              <span>Attach</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end px-5 py-3 border-t border-white/[0.07] bg-[#18181b]">
              <button
                type="button"
                onClick={() => setAttachDoc(null)}
                className="px-4 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-medium transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmDoc && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
        >
          <div className="relative flex flex-col w-full max-w-md bg-[#16161a] border border-red-500/30 rounded-xl shadow-2xl p-5">
            <div className="flex items-start gap-3.5">
              <span className="p-2.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </span>
              <div>
                <h2
                  id="delete-dialog-title"
                  className="text-sm font-semibold text-white"
                >
                  Delete Document?
                </h2>
                <p className="text-xs text-zinc-300 mt-1.5 leading-relaxed">
                  Are you sure you want to delete{' '}
                  <strong className="text-white">&ldquo;{deleteConfirmDoc.doc.name}&rdquo;</strong>?
                </p>

                {deleteConfirmDoc.linkedWorkspaces.length > 0 && (
                  <div className="mt-3 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-200 text-xs">
                    <p className="font-semibold text-amber-300">
                      Warning: Linked to {deleteConfirmDoc.linkedWorkspaces.length}{' '}
                      {deleteConfirmDoc.linkedWorkspaces.length === 1 ? 'interview' : 'interviews'}:
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-amber-300/80 truncate">
                      {deleteConfirmDoc.linkedWorkspaces.map(w => w.workspaceTitle).join(', ')}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-400">
                      Deleting will permanently remove this file and detach it from all referencing interviews.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 mt-6 pt-3 border-t border-white/[0.07]">
              <button
                type="button"
                onClick={() => setDeleteConfirmDoc(null)}
                disabled={isDeleting}
                className="px-3 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteDocument(deleteConfirmDoc.doc.id)}
                disabled={isDeleting}
                aria-label="Confirm permanent deletion"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white text-xs font-medium shadow-sm transition-colors disabled:opacity-50"
              >
                {isDeleting ? (
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
