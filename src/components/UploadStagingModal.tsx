import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  FileCode,
  X,
  RefreshCw,
  Plus,
  UploadCloud,
  AlertCircle,
  FolderPlus,
} from 'lucide-react';
import type { StagedUploadFile } from '../utils/documentUploadUtils';
import { DOCUMENT_KIND_OPTIONS } from '../utils/documentUploadUtils';
import type { InterviewContextDocumentKind } from '../types/electron';

export interface UploadStagingModalProps {
  isOpen: boolean;
  isLight?: boolean;
  stagedFiles: StagedUploadFile[];
  isUploading: boolean;
  uploadError?: string | null;
  onClose: () => void;
  onConfirmUpload: (files: StagedUploadFile[]) => Promise<void> | void;
  onUpdateFile: (id: string, updates: Partial<Pick<StagedUploadFile, 'contextKind' | 'contextDescription'>>) => void;
  onRemoveFile: (id: string) => void;
  onAddMoreFiles?: () => void;
}

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileIcon = (fileType: string) => {
  const ext = (fileType || '').toLowerCase().replace('.', '');
  switch (ext) {
    case 'pdf':
      return { icon: FileText, color: 'text-red-400' };
    case 'docx':
      return { icon: FileText, color: 'text-blue-400' };
    case 'md':
    case 'markdown':
      return { icon: FileCode, color: 'text-amber-400' };
    case 'txt':
    default:
      return { icon: FileText, color: 'text-zinc-400' };
  }
};

const UploadStagingContent: React.FC<UploadStagingModalProps> = ({
  isLight = false,
  stagedFiles,
  isUploading,
  uploadError,
  onClose,
  onConfirmUpload,
  onUpdateFile,
  onRemoveFile,
  onAddMoreFiles,
}) => {
  const totalSizeBytes = useMemo(
    () => stagedFiles.reduce((acc, file) => acc + (file.sizeBytes || 0), 0),
    [stagedFiles]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isUploading) {
        onClose();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !isUploading && stagedFiles.length > 0) {
        void onConfirmUpload(stagedFiles);
      }
    },
    [isUploading, onClose, onConfirmUpload, stagedFiles]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const theme = isLight
    ? {
        modal: 'bg-white border-zinc-200 text-zinc-900',
        header: 'border-zinc-200',
        fileCard: 'bg-zinc-50/70 border-zinc-200/80 hover:border-zinc-300',
        input: 'bg-white border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-amber-500',
        select: 'bg-white border-zinc-200 text-zinc-900 focus:border-amber-500',
        subtext: 'text-zinc-500',
        badge: 'bg-zinc-100 text-zinc-600 border-zinc-200',
        footer: 'border-zinc-200 bg-zinc-50/50',
      }
    : {
        modal: 'bg-[#16161a] border-white/[0.08] text-[#fafafa]',
        header: 'border-white/[0.07]',
        fileCard: 'bg-[#1a1a1f] border-white/[0.06] hover:border-white/[0.12]',
        input: 'bg-[#121214] border-white/[0.08] text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/60',
        select: 'bg-[#121214] border-white/[0.08] text-zinc-100 focus:border-amber-500/60',
        subtext: 'text-zinc-400',
        badge: 'bg-white/[0.04] text-zinc-400 border-white/[0.06]',
        footer: 'border-white/[0.07] bg-[#121214]/60',
      };

  return (
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm select-none"
      onClick={() => {
        if (!isUploading) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 8 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className={`w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border shadow-2xl overflow-hidden ${theme.modal}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b flex-shrink-0 ${theme.header}`}>
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
              <UploadCloud className="w-4 h-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight">Upload Documents to Knowledge Bank</h2>
                <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full border tabular-nums ${theme.badge}`}>
                  {stagedFiles.length} {stagedFiles.length === 1 ? 'file' : 'files'}
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${theme.subtext}`}>
                Categorize each file and add an optional note to help the AI copilot accurately ground its answers.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            aria-label="Close dialog"
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error Banner if any */}
        {uploadError && (
          <div className="mx-5 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{uploadError}</span>
          </div>
        )}

        {/* Staged Files List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-3 min-h-0">
          {stagedFiles.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500">
              <FolderPlus className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>No files currently staged for upload.</p>
              {onAddMoreFiles && (
                <button
                  type="button"
                  onClick={onAddMoreFiles}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-amber-400 hover:text-amber-300 border border-amber-500/20 bg-amber-500/10 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Choose Files</span>
                </button>
              )}
            </div>
          ) : (
            stagedFiles.map((file) => {
              const { icon: FileIcon, color: iconColor } = getFileIcon(file.fileType);
              return (
                <div
                  key={file.id}
                  className={`p-3.5 rounded-lg border transition-all ${theme.fileCard}`}
                >
                  {/* Top: File info & remove action */}
                  <div className="flex items-center justify-between gap-3 mb-2.5">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <FileIcon className={`w-4 h-4 shrink-0 ${iconColor}`} />
                      <span className="text-xs font-semibold truncate" title={file.name}>
                        {file.name}
                      </span>
                      <span className="text-[11px] text-zinc-500 font-mono tabular-nums shrink-0">
                        ({formatBytes(file.sizeBytes)})
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onRemoveFile(file.id)}
                      disabled={isUploading}
                      title="Remove from batch"
                      aria-label={`Remove ${file.name}`}
                      className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08] rounded transition-colors disabled:opacity-40"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Bottom: Document Kind Dropdown & Short Description Textbar */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {/* Kind Selector */}
                    <div className="sm:col-span-1">
                      <label htmlFor={`kind-${file.id}`} className="sr-only">
                        Document Type for {file.name}
                      </label>
                      <select
                        id={`kind-${file.id}`}
                        value={file.contextKind}
                        onChange={(e) =>
                          onUpdateFile(file.id, {
                            contextKind: e.target.value as InterviewContextDocumentKind,
                          })
                        }
                        disabled={isUploading}
                        className={`w-full h-8 px-2.5 text-xs rounded-md border outline-none font-medium transition-colors cursor-pointer ${theme.select}`}
                      >
                        {DOCUMENT_KIND_OPTIONS.map((opt) => (
                          <option key={opt.kind} value={opt.kind}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Short Description Textbar */}
                    <div className="sm:col-span-2">
                      <label htmlFor={`desc-${file.id}`} className="sr-only">
                        Short description for {file.name}
                      </label>
                      <input
                        id={`desc-${file.id}`}
                        type="text"
                        value={file.contextDescription}
                        onChange={(e) =>
                          onUpdateFile(file.id, { contextDescription: e.target.value })
                        }
                        disabled={isUploading}
                        placeholder="Short description (e.g. 2026 update, Principal SWE spec, etc.)"
                        className={`w-full h-8 px-3 text-xs rounded-md border outline-none transition-colors ${theme.input}`}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between px-5 py-3.5 border-t flex-shrink-0 ${theme.footer}`}>
          <div className="flex items-center gap-3">
            {onAddMoreFiles && (
              <button
                type="button"
                onClick={onAddMoreFiles}
                disabled={isUploading}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 disabled:opacity-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add More Files</span>
              </button>
            )}
            <span className="text-[11px] text-zinc-500 font-mono tabular-nums">
              Total: {formatBytes(totalSizeBytes)}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => void onConfirmUpload(stagedFiles)}
              disabled={isUploading || stagedFiles.length === 0}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold text-black bg-amber-400 hover:bg-amber-300 active:bg-amber-500 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>
                    {stagedFiles.length <= 1
                      ? 'Confirm & Upload'
                      : `Confirm & Upload All (${stagedFiles.length})`}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export const UploadStagingModal: React.FC<UploadStagingModalProps> = (props) => {
  return (
    <AnimatePresence>
      {props.isOpen && <UploadStagingContent {...props} />}
    </AnimatePresence>
  );
};

export default UploadStagingModal;
