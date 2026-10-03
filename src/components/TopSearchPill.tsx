import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, Sparkles, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useResolvedTheme } from '../hooks/useResolvedTheme';

// ============================================
// Types
// ============================================

type PillState = 'idle' | 'focused' | 'typing' | 'results';

interface Meeting {
    id: string;
    title: string;
    date: string;
    summary?: string;
}

interface SearchResult {
    id: string;
    type: 'meeting';
    title: string;
    subtitle?: string;
    meetingId: string;
}

interface TopSearchPillProps {
    meetings: Meeting[];
    onAIQuery: (query: string) => void;
    onLiteralSearch: (query: string) => void;
    onOpenMeeting: (meetingId: string) => void;
    onExpansionChange?: (isExpanded: boolean) => void;
}

// ============================================
// Fuzzy Search Helper
// ============================================

function fuzzyMatch(text: string, query: string): boolean {
    const normalizedText = text.toLowerCase();
    const normalizedQuery = query.toLowerCase();

    // Simple contains match for now
    if (normalizedText.includes(normalizedQuery)) return true;

    // Fuzzy character match
    // Fuzzy match removed for stricter accuracy
    // Only return true if exact substring match (already checked above)
    return false;
}

function searchMeetings(meetings: Meeting[], query: string): SearchResult[] {
    if (!query.trim()) return [];

    const results: SearchResult[] = [];
    const seen = new Set<string>();

    for (const meeting of meetings) {
        if (seen.has(meeting.id)) continue;

        // Match against title and summary
        const titleMatch = fuzzyMatch(meeting.title, query);
        const summaryMatch = meeting.summary && fuzzyMatch(meeting.summary, query);

        if (titleMatch || summaryMatch) {
            seen.add(meeting.id);
            results.push({
                id: meeting.id,
                type: 'meeting',
                title: meeting.title,
                subtitle: new Date(meeting.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric'
                }),
                meetingId: meeting.id
            });
        }

        if (results.length >= 5) break;
    }

    return results;
}

// ============================================
// Main Component
// ============================================

const TopSearchPill: React.FC<TopSearchPillProps> = ({
    meetings,
    onAIQuery,
    onLiteralSearch,
    onOpenMeeting,
    onExpansionChange
}) => {
    const isLight = useResolvedTheme() === 'light';
    const [state, setState] = useState<PillState>('idle');
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(-1);

    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Notify parent of expansion changes
    useEffect(() => {
        onExpansionChange?.(state !== 'idle');
    }, [state, onExpansionChange]);

    // Compute results
    const sessionResults = useMemo(() => {
        if (state !== 'results' || !query.trim()) return [];
        return searchMeetings(meetings, query);
    }, [meetings, query, state]);

    // Total selectable items: 2 (Explore section) + sessions
    const totalItems = 2 + sessionResults.length;

    // State transitions
    const open = useCallback(() => {
        setState('focused');
        setTimeout(() => inputRef.current?.focus(), 50);
    }, []);

    const close = useCallback(() => {
        setState('idle');
        // Delay clearing query to allow exit animation to complete
        setTimeout(() => {
            setQuery('');
            setSelectedIndex(-1);
        }, 150);
        inputRef.current?.blur();
    }, []);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setQuery(value);
        setSelectedIndex(-1);

        if (value.trim()) {
            setState('results');
        } else {
            setState('focused');
        }
    }, []);

    const handleSelect = useCallback((index: number) => {
        if (index === 0) {
            // AI Query
            onAIQuery(query);
            close();
        } else if (index === 1) {
            // Literal search
            onLiteralSearch(query);
            close();
        } else {
            // Session result
            const sessionIndex = index - 2;
            const result = sessionResults[sessionIndex];
            if (result) {
                onOpenMeeting(result.meetingId);
                close();
            }
        }
    }, [query, sessionResults, onAIQuery, onLiteralSearch, onOpenMeeting, close]);

    // Keyboard handling
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // ⌘K to open
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                if (state === 'idle') {
                    open();
                } else {
                    close();
                }
                return;
            }

            if (state === 'idle') return;

            // ESC to close
            if (e.key === 'Escape') {
                e.preventDefault();
                close();
                return;
            }

            // Arrow navigation
            if (state === 'results') {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedIndex(prev => Math.min(prev + 1, totalItems - 1));
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedIndex(prev => Math.max(prev - 1, -1));
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSelect(selectedIndex);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [state, open, close, selectedIndex, totalItems, handleSelect]);

    // Click outside to close
    useEffect(() => {
        if (state === 'idle') return;

        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                close();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [state, close]);

    const isExpanded = state !== 'idle';
    const showResults = state === 'results' && query.trim();

    return (
        <div className="relative">
            {/* Compact In-Header Trigger */}
            <button
                type="button"
                onClick={open}
                className={`h-7 w-40 md:w-48 flex items-center justify-between px-2.5 rounded-lg border transition-colors select-none text-left cursor-pointer ${
                    isLight
                        ? 'bg-black/5 hover:bg-black/10 border-border-subtle text-text-tertiary'
                        : 'bg-zinc-800/60 hover:bg-zinc-800/90 border-white/[0.07] text-text-tertiary'
                }`}
                title="Search meetings or ask AI (⌘K)"
            >
                <div className="flex items-center gap-1.5 min-w-0">
                    <Search size={13} className="shrink-0 text-text-tertiary" />
                    <span className="text-[11.5px] truncate text-text-secondary">Search or ask...</span>
                </div>
                <kbd className="text-[9.5px] font-mono px-1 py-0.5 rounded bg-black/10 dark:bg-zinc-900 border border-border-subtle text-text-tertiary shrink-0">
                    ⌘K
                </kbd>
            </button>

            {/* Spotlight Modal Overlay */}
            {createPortal(
                <AnimatePresence>
                    {isExpanded && (
                        <div className="fixed inset-0 z-[250] flex items-start justify-center pt-12 px-4">
                            {/* Backdrop blur overlay */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="fixed inset-0 bg-black/40 backdrop-blur-[6px]"
                                onClick={close}
                            />

                            {/* Search Modal Box */}
                            <motion.div
                                ref={containerRef}
                                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                                className={`relative w-[480px] max-w-full rounded-xl border shadow-2xl overflow-hidden z-10 ${
                                    isLight
                                        ? 'bg-white border-border-muted text-text-primary'
                                        : 'bg-[#16161a] border-white/[0.09] text-text-primary'
                                } backdrop-blur-xl`}
                            >
                                {/* Input Row */}
                                <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-border-subtle">
                                    <Search size={15} className="shrink-0 text-amber-500" />
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={query}
                                        onChange={handleInputChange}
                                        className="flex-1 bg-transparent text-[13px] text-text-primary placeholder:text-text-tertiary outline-none"
                                        placeholder="Search or ask anything..."
                                        autoFocus
                                    />
                                    <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/10 dark:bg-zinc-900 border border-border-subtle text-text-tertiary select-none">
                                        ESC
                                    </kbd>
                                </div>

                                {/* Results Panel */}
                                <AnimatePresence>
                                    {showResults && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{
                                                duration: 0.18,
                                                ease: [0.16, 1, 0.3, 1]
                                            }}
                                            className="overflow-hidden"
                                        >
                                            <div className="w-full">
                                                <div className="py-2">
                                                    {/* Explore Section */}
                                                    <div className="px-3 py-1">
                                                        <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1">
                                                            Explore
                                                        </div>

                                                        {/* AI Query Option */}
                                                        <button
                                                            className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left transition-colors duration-100 cursor-pointer ${
                                                                selectedIndex === 0
                                                                    ? 'bg-amber-500/15 text-amber-300'
                                                                    : 'hover:bg-bg-item-hover text-text-primary'
                                                            }`}
                                                            onClick={() => handleSelect(0)}
                                                            onMouseEnter={() => setSelectedIndex(0)}
                                                        >
                                                            <div className="w-6 h-6 rounded-md bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                                                                <Sparkles size={12} />
                                                            </div>
                                                            <span className="text-[13px] truncate">
                                                                {query}
                                                            </span>
                                                        </button>

                                                        {/* Literal Search Option */}
                                                        <button
                                                            className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left transition-colors duration-100 cursor-pointer ${
                                                                selectedIndex === 1
                                                                    ? 'bg-bg-item-active'
                                                                    : 'hover:bg-bg-item-hover'
                                                            }`}
                                                            onClick={() => handleSelect(1)}
                                                            onMouseEnter={() => setSelectedIndex(1)}
                                                        >
                                                            <div className="w-6 h-6 rounded-md bg-bg-item-surface flex items-center justify-center shrink-0">
                                                                <Search size={12} className="text-text-secondary" />
                                                            </div>
                                                            <span className="text-[13px] text-text-secondary">
                                                                Search for <span className="text-text-primary">"{query}"</span>
                                                            </span>
                                                        </button>
                                                    </div>

                                                    {/* Sessions Section */}
                                                    {sessionResults.length > 0 && (
                                                        <div className="px-3 py-1 mt-1 border-t border-border-subtle pt-2">
                                                            <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1">
                                                                Sessions
                                                            </div>

                                                            <div className="flex flex-col gap-0.5">
                                                                {sessionResults.map((result, index) => (
                                                                    <button
                                                                        key={result.id}
                                                                        className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left transition-colors duration-100 cursor-pointer ${
                                                                            selectedIndex === index + 2
                                                                                ? 'bg-bg-item-active'
                                                                                : 'hover:bg-bg-item-hover'
                                                                        }`}
                                                                        onClick={() => handleSelect(index + 2)}
                                                                        onMouseEnter={() => setSelectedIndex(index + 2)}
                                                                    >
                                                                        <div className="w-6 h-6 rounded-md bg-bg-item-surface flex items-center justify-center shrink-0">
                                                                            <FileText size={12} className="text-text-secondary" />
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="text-[13px] text-text-primary truncate">
                                                                                {result.title}
                                                                            </div>
                                                                            {result.subtitle && (
                                                                                <div className="text-[11px] text-text-tertiary font-mono tnum">
                                                                                    {result.subtitle}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
};

export default TopSearchPill;
