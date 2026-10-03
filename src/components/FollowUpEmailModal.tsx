import React, { useState, useEffect, useRef } from 'react';
import { X, Mail, RotateCcw, ExternalLink, Loader2, Paperclip } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Meeting {
    id: string;
    title: string;
    date: string;
    summary?: string;
    detailedSummary?: {
        overview?: string;
        actionItems: string[];
        keyPoints: string[];
    };
    transcript?: Array<{
        speaker: string;
        text: string;
        timestamp: number;
    }>;
    calendarEventId?: string;
}

interface FollowUpEmailModalProps {
    isOpen: boolean;
    onClose: () => void;
    meeting: Meeting;
}

const FollowUpEmailModal: React.FC<FollowUpEmailModalProps> = ({ isOpen, onClose, meeting }) => {
    const [recipientEmail, setRecipientEmail] = useState('');
    const [senderName, setSenderName] = useState('');
    const [recipientName, setRecipientName] = useState('');

    // Subject & Body
    const [subject, setSubject] = useState('');
    const [emailBody, setEmailBody] = useState('');

    // State
    const [isGenerating, setIsGenerating] = useState(false);
    const [hasGeneratedOnce, setHasGeneratedOnce] = useState(false);

    // Mount effect - Initialize and Generate
    useEffect(() => {
        if (isOpen) {
            initializeFields();
        }
    }, [isOpen, meeting]);

    const initializeFields = async () => {
        // 1. Set Subject
        const cleanTitle = meeting.title.replace(/["\*]/g, '').trim();
        setSubject(`Follow up - ${cleanTitle}`); // Default subject

        // 2. Load Sender Name
        const storedName = localStorage.getItem('natively_user_name');
        if (storedName) setSenderName(storedName);

        // 3. Load Recipient (Async)
        let loadedRecipientEmail = '';
        let loadedRecipientName = '';

        try {
            // Try Calendar
            if (meeting.calendarEventId) {
                // @ts-ignore
                const attendees = await window.electronAPI?.invoke('get-calendar-attendees', meeting.calendarEventId);
                if (attendees && attendees.length > 0) {
                    loadedRecipientEmail = attendees[0].email;
                    if (attendees[0].name) loadedRecipientName = attendees[0].name.split(' ')[0];
                }
            }

            // Fallback: Transcript
            if (!loadedRecipientEmail && meeting.transcript) {
                // @ts-ignore
                const extracted = await window.electronAPI?.invoke('extract-emails-from-transcript', meeting.transcript);
                if (extracted && extracted.length > 0) {
                    loadedRecipientEmail = extracted[0];
                }
            }
        } catch (e) {
            console.error(e);
        }

        if (loadedRecipientEmail) setRecipientEmail(loadedRecipientEmail);
        if (loadedRecipientName) setRecipientName(loadedRecipientName);

        // 4. Generate Content automatically if not done
        if (!emailBody && !isGenerating) {
            generateEmail(loadedRecipientName, storedName || '');
        }
    };

    const generateEmail = async (rName?: string, sName?: string) => {
        setIsGenerating(true);
        try {
            const input = {
                meeting_type: 'meeting' as const,
                title: meeting.title,
                summary: meeting.detailedSummary?.overview || meeting.summary,
                action_items: meeting.detailedSummary?.actionItems || [],
                key_points: meeting.detailedSummary?.keyPoints || [],
                recipient_name: rName || recipientName,
                sender_name: sName || senderName,
                tone: 'neutral' as const // Default to neutral for auto-gen
            };

            // @ts-ignore
            const generatedBody = await window.electronAPI?.invoke('generate-followup-email', input);
            if (generatedBody) {
                setEmailBody(generatedBody);
            }
        } catch (error) {
            console.error('Failed to generate email:', error);
            setEmailBody('Hi there,\n\nI enjoyed our conversation. Let me know if you have any questions.\n\nBest,');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleReset = () => {
        generateEmail();
    };

    const handleSendGmail = async () => {
        const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipientEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
        // @ts-ignore
        await window.electronAPI?.invoke('open-external', gmailUrl);
        onClose();
    };

    const handleSendDefault = async () => {
        // @ts-ignore
        await window.electronAPI?.invoke('open-mailto', {
            to: recipientEmail,
            subject: subject,
            body: emailBody
        });
        onClose();
    };


    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 transition-opacity"
                    />

                    {/* Modal Container */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.3, type: "spring", damping: 25, stiffness: 300 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
                    >
                        {/* The Window */}
                        <div className="w-full max-w-[640px] bg-[#121212]/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/[0.08] flex flex-col pointer-events-auto overflow-hidden ring-1 ring-white/5">

                            {/* Header / Top Bar */}
                            <div className="flex px-6 py-4 justify-between items-center border-b border-white/[0.06]">
                                <h2 className="text-sm font-medium text-[#E9E9E9] tracking-wide">Draft Follow-up</h2>
                                <button onClick={onClose} className="text-[#71717A] hover:text-white transition-colors bg-white/5 hover:bg-white/10 p-1.5 rounded-full">
                                    <X size={14} />
                                </button>
                            </div>

                            {/* Inputs Area */}
                            <div className="px-8 pt-6 space-y-5">

                                {/* TO Field */}
                                <div className="flex items-start gap-6 group">
                                    <label className="text-[#71717A] text-[13px] w-[50px] font-medium pt-2">To</label>
                                    <div className="flex-1 min-h-[32px] flex items-center border-b border-white/[0.06] group-focus-within:border-white/20 transition-colors pb-1">
                                        {recipientEmail ? (
                                            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#27272A] border border-white/10 rounded-full text-[#E9E9E9] text-[13px] shadow-sm animate-in fade-in zoom-in duration-200">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"></span>
                                                {recipientEmail}
                                                <button
                                                    onClick={() => setRecipientEmail('')}
                                                    className="hover:text-white text-[#71717A] transition-colors ml-1"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ) : (
                                            <input
                                                type="email"
                                                value={recipientEmail}
                                                onChange={(e) => setRecipientEmail(e.target.value)}
                                                placeholder="Recipient email"
                                                className="w-full bg-transparent text-[#E9E9E9] placeholder-[#525255] focus:outline-none text-[14px]"
                                                autoFocus
                                            />
                                        )}
                                    </div>
                                </div>

                                {/* SUBJECT Field */}
                                <div className="flex items-center gap-6 group">
                                    <label className="text-[#71717A] text-[13px] w-[50px] font-medium">Subject</label>
                                    <div className="flex-1 border-b border-white/[0.06] group-focus-within:border-white/20 transition-colors pb-1">
                                        <input
                                            type="text"
                                            value={subject}
                                            onChange={(e) => setSubject(e.target.value)}
                                            className="w-full bg-transparent text-[#E9E9E9] focus:outline-none text-[14px] font-medium placeholder-[#525255]"
                                            placeholder="Subject line"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Body Area */}
                            <div className="flex-1 px-8 py-6 min-h-[320px] relative">
                                {isGenerating ? (
                                    <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#121212]/50 backdrop-blur-[2px]">
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="relative">
                                                <div className="w-10 h-10 border-2 border-[#27272A] border-t-blue-500 rounded-full animate-spin"></div>
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <div className="w-2 h-2 bg-accent-primary rounded-full animate-pulse"></div>
                                                </div>
                                            </div>
                                            <span className="text-xs font-medium text-[#71717A] animate-pulse">Drafting perfect follow-up...</span>
                                        </div>
                                    </div>
                                ) : (
                                    <textarea
                                        value={emailBody}
                                        onChange={(e) => setEmailBody(e.target.value)}
                                        className="w-full h-full bg-transparent text-[#D4D4D8] text-[15px] leading-7 focus:outline-none resize-none placeholder-[#3F3F46] font-normal"
                                        placeholder="Write your email..."
                                        spellCheck={false}
                                    />
                                )}
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-between px-6 py-5 bg-[#18181B]/50 border-t border-white/[0.06]">
                                <div className="flex items-center gap-3">
                                    {/* Send with Gmail */}
                                    <button
                                        onClick={handleSendGmail}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-[#202124] hover:bg-[#303134] rounded-full border border-[#5F6368] transition-colors group"
                                    >
                                        <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
                                            <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                                                <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z" />
                                                <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z" />
                                                <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.734 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z" />
                                                <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z" />
                                            </g>
                                        </svg>
                                        <span className="text-[#E8EAED] text-[13px] font-medium tracking-wide">Gmail</span>
                                    </button>
                                </div>

                                {/* Right Side Actions */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleReset}
                                        disabled={isGenerating}
                                        className="flex items-center gap-2 px-4 py-2.5 hover:bg-white/5 rounded-xl transition-colors text-[#71717A] hover:text-[#E9E9E9] disabled:opacity-30 disabled:cursor-not-allowed group"
                                        title="Regenerate"
                                    >
                                        <RotateCcw size={15} className={`group-hover:rotate-180 transition-transform duration-500 ${isGenerating ? 'animate-spin' : ''}`} />
                                        <span className="text-[13px] font-medium">Reset</span>
                                    </button>
                                </div>
                            </div>

                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default FollowUpEmailModal;
