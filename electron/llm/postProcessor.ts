// electron/llm/postProcessor.ts
// Hard post-processing clamp to enforce constraints
// Even if Gemini misbehaves, this ensures clean output

/**
 * Filler phrases to strip from end of responses
 */
const FILLER_PHRASES = [
    "I hope this helps",
    "Let me know if you",
    "Feel free to",
    "Does that make sense",
    "Is there anything else",
    "Hope that answers",
    "Let me know if you have",
    "I'd be happy to",
];

/**
 * Prefixes to strip from start of responses
 */
const PREFIXES = [
    "Refined (rephrase):",
    "Refined (expand):",
    "Refined answer:",
    "Refined:",
    "Answer:",
    "Response:",
    "Suggestion:",
    "Here is the answer:",
    "Here is the refined answer:",
];

/**
 * Reduce dash usage that betrays AI authorship. The prompt rules ban em/en
 * dashes in spoken passages but Llama / Gemini / GPT all generate them
 * anyway because their training distribution is saturated with them. This is
 * the deterministic backstop that strips them before the user ever sees them.
 *
 * Rules (in order):
 * - Em dash (—) with any surrounding whitespace → ", "
 * - En dash (–) with any surrounding whitespace → ", "
 * - ASCII hyphen used as a sentence connector ("text - more text") → ", "
 *   (Negative lookahead/lookbehind preserves compound words like "well-known",
 *   numeric ranges like "10-15", and line-start bullets like "- item".)
 * - Cleanup: double commas, comma-then-period, lowercase-after-comma fixes.
 *
 * Preserves:
 * - Anything inside fenced code blocks (```...```)
 * - Anything inside inline code (`...`)
 * - Bullet markers at line start
 * - Compound words ("real-time"), numeric ranges ("3-5"), command flags ("--flag")
 *
 * Safe to call on already-clean text (idempotent).
 */
export function reduceDashes(text: string): string {
    if (!text || typeof text !== "string") return "";

    // Stash code so we don't touch dashes inside it
    const codeBlocks: string[] = [];
    let result = text.replace(/```[\s\S]*?```/g, (m) => {
        codeBlocks.push(m);
        return `CODE${codeBlocks.length - 1}`;
    });
    const inlineCodes: string[] = [];
    result = result.replace(/`[^`\n]+`/g, (m) => {
        inlineCodes.push(m);
        return `INL${inlineCodes.length - 1}`;
    });

    // Em + en dash → comma. Eat any surrounding whitespace.
    result = result.replace(/\s*[—–]\s*/g, ", ");

    // ASCII hyphen as a sentence connector: space-hyphen-space mid-line,
    // not at line start (which is bullet), not as a command-line flag prefix.
    result = result.replace(/(?<=\S) - (?=\S)/g, ", ");

    // Tidy up artifacts
    result = result.replace(/,\s*,+/g, ",");      // double commas
    result = result.replace(/,\s*([.!?])/g, "$1"); // comma-then-terminator
    result = result.replace(/^,\s*/gm, "");        // line-start orphan comma

    // Restore code
    inlineCodes.forEach((c, i) => {
        result = result.replace(`INL${i}`, c);
    });
    codeBlocks.forEach((c, i) => {
        result = result.replace(`CODE${i}`, c);
    });

    return result;
}

/**
 * Streaming-safe variant. Operates on one streamed chunk at a time.
 * For chunk-level cleanup we accept that a dash split across chunk boundaries
 * may slip through; the FULL post-stream string can be re-cleaned via
 * `reduceDashes` for cases that require it.
 */
export function reduceDashesInChunk(chunk: string): string {
    if (!chunk) return chunk;
    // Only do the cheap, boundary-stable swaps. No code-block stashing — code
    // blocks are usually emitted as their own chunks by the providers we use
    // and any dash inside a code chunk happens to be inside a ``` boundary
    // that we don't break.
    return chunk
        .replace(/\s*[—–]\s*/g, ", ")
        .replace(/(?<=\S) - (?=\S)/g, ", ");
}

/**
 * Clamp response to strict interview copilot constraints
 * @param text - Raw LLM response
 * @param maxSentences - Maximum sentences allowed (default 3)
 * @param maxWords - Maximum words allowed (default 60)
 * @returns Clean, clamped plain text
 */
export function clampResponse(
    text: string,
    maxSentences: number = 3,
    maxWords: number = 45
): string {
    if (!text || typeof text !== "string") {
        return "";
    }

    let result = text.trim();

    // Step 0: Reduce dashes (em/en/connector hyphen → comma). Backstop for
    // the prompt-level anti-tell rule that providers don't fully respect.
    result = reduceDashes(result);

    // Step 1: Strip markdown
    result = stripMarkdown(result);

    // Step 2: Strip prefixes (labels)
    result = stripPrefixes(result);

    // Step 3: Remove filler phrases from end
    result = stripFillerPhrases(result);

    // CRITICAL: If code blocks were found (preserved from stripMarkdown), DO NOT CLAMP.
    // Code answers need to be full length.
    const hasCodeBlocks = /```/.test(result);

    if (!hasCodeBlocks) {
        // Step 4: Enforce sentence limit (only for prose)
        result = limitSentences(result, maxSentences);

        // Step 5: Enforce word limit (only for prose)
        result = limitWords(result, maxWords);
    }

    // Step 6: Final cleanup
    result = result.trim();

    return result;
}

/**
 * Strip all markdown formatting
 */
/**
 * Strip all markdown formatting but PRESERVE code blocks
 */
function stripMarkdown(text: string): string {
    const codeBlocks: string[] = [];
    let result = text;

    // Extract code blocks to protect them
    result = result.replace(/```[\s\S]*?```/g, (match) => {
        codeBlocks.push(match);
        return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });

    // Remove headers (# ## ### etc.)
    result = result.replace(/^#{1,6}\s+/gm, "");

    // Remove bold (**text** or __text__)
    result = result.replace(/\*\*([^*]+)\*\*/g, "$1");
    result = result.replace(/__([^_]+)__/g, "$1");

    // Remove italic (*text* or _text_)
    result = result.replace(/\*([^*]+)\*/g, "$1");
    result = result.replace(/_([^_]+)_/g, "$1");

    // Remove inline code (`text`) - keep content
    result = result.replace(/`([^`]+)`/g, "$1");

    // Remove bullet points (-, *, •)
    result = result.replace(/^[\s]*[-*•]\s+/gm, "");

    // Remove numbered lists
    result = result.replace(/^[\s]*\d+\.\s+/gm, "");

    // Remove blockquotes
    result = result.replace(/^>\s+/gm, "");

    // Remove horizontal rules
    result = result.replace(/^[-*_]{3,}$/gm, "");

    // Remove links [text](url) -> text
    result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

    // Collapse multiple newlines to single space (but preserve structure around blocks later?)
    // We should be careful collapsing newlines around placeholders
    result = result.replace(/\n+/g, " ");

    // Collapse multiple spaces
    result = result.replace(/\s+/g, " ");

    // Restore code blocks
    // Add newlines around them for better formatting
    codeBlocks.forEach((block, index) => {
        result = result.replace(`__CODE_BLOCK_${index}__`, `\n${block}\n`);
    });

    return result.trim();
}

/**
 * Remove trailing filler phrases that add no value
 */
function stripFillerPhrases(text: string): string {
    let result = text;

    for (const phrase of FILLER_PHRASES) {
        const regex = new RegExp(`[.!?]?\\s*${phrase}[^.!?]*[.!?]?\\s*$`, "i");
        result = result.replace(regex, ".");
    }

    // Clean up trailing punctuation issues
    result = result.replace(/\.+$/, ".");
    result = result.replace(/\s+\.$/, ".");

    return result.trim();
}

/**
 * Limit to N sentences
 */
function limitSentences(text: string, maxSentences: number): string {
    // Split on sentence boundaries (., !, ?)
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    if (sentences.length <= maxSentences) {
        return text;
    }

    // Take first N sentences
    return sentences.slice(0, maxSentences).join(" ").trim();
}

/**
 * Limit to N words
 */
function limitWords(text: string, maxWords: number): string {
    const words = text.split(/\s+/);

    if (words.length <= maxWords) {
        return text;
    }

    // Take first N words
    let result = words.slice(0, maxWords).join(" ");

    // Try to end at a sentence boundary
    const lastPunctuation = result.search(/[.!?][^.!?]*$/);
    if (lastPunctuation > result.length * 0.6) {
        result = result.substring(0, lastPunctuation + 1);
    } else {
        // Add ellipsis if we cut mid-sentence
        result = result.replace(/[,;:]?\s*$/, "...");
    }

    return result.trim();
}

/**
 * Validate response meets constraints
 * Returns true if valid, false if clamping was needed
 */
export function validateResponse(
    text: string,
    maxSentences: number = 3,
    maxWords: number = 60
): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check for markdown
    if (/[#*_`]/.test(text)) {
        issues.push("Contains markdown");
    }

    // Check sentence count
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    if (sentences.length > maxSentences) {
        issues.push(`Too many sentences (${sentences.length}/${maxSentences})`);
    }

    // Check word count
    const words = text.split(/\s+/);
    if (words.length > maxWords) {
        issues.push(`Too many words (${words.length}/${maxWords})`);
    }

    return {
        valid: issues.length === 0,
        issues,
    };
}

/**
 * Strip common prefixes/labels
 */
function stripPrefixes(text: string): string {
    let result = text;
    for (const prefix of PREFIXES) {
        if (result.toLowerCase().startsWith(prefix.toLowerCase())) {
            result = result.substring(prefix.length).trim();
        }
    }
    // Handle "Refined (...):" regex pattern
    result = result.replace(/^Refined \([^)]+\):\s*/i, "");

    return result.trim();
}
