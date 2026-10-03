import { LLMHelper } from "../LLMHelper";
import { CLARIFY_MODE_PROMPT } from "./prompts";
import { TINY_CLARIFY_PROMPT } from "./tinyPrompts";

export class ClarifyLLM {
    private llmHelper: LLMHelper;

    constructor(llmHelper: LLMHelper) {
        this.llmHelper = llmHelper;
    }

    /**
     * Generate a clarification question
     */
    async generate(context: string): Promise<string> {
        if (!context.trim()) return "";
        try {
            const promptOverride = this.llmHelper.getPromptTier() === 'tiny' ? TINY_CLARIFY_PROMPT : CLARIFY_MODE_PROMPT;
            const fittedContext = this.llmHelper.fitContextForCurrentModel(context);
            const stream = this.llmHelper.streamChat(fittedContext, undefined, undefined, promptOverride);
            let fullResponse = "";
            for await (const chunk of stream) fullResponse += chunk;
            return fullResponse.trim();
        } catch (error) {
            console.error("[ClarifyLLM] Generation failed:", error);
            return "";
        }
    }

    /**
     * Generate a clarification question (Streamed)
     */
    async *generateStream(context: string): AsyncGenerator<string> {
        if (!context.trim()) return;
        try {
            const promptOverride = this.llmHelper.getPromptTier() === 'tiny' ? TINY_CLARIFY_PROMPT : CLARIFY_MODE_PROMPT;
            const fittedContext = this.llmHelper.fitContextForCurrentModel(context);
            yield* this.llmHelper.streamChat(fittedContext, undefined, undefined, promptOverride);
        } catch (error) {
            console.error("[ClarifyLLM] Streaming generation failed:", error);
        }
    }
}
