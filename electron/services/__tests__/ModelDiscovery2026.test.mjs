import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
const MOD_FETCHER_PATH = path.resolve(root, 'dist-electron/electron/utils/modelFetcher.js');

let mod;
try {
  mod = await import(pathToFileURL(MOD_FETCHER_PATH).href);
} catch (e) {
  // If not built yet, will be verified after build
}

describe('2026 Model Discovery Specifications', () => {
  describe('Google Gemini 2026 Models', () => {
    test('isAllowedGeminiModel accepts Gemini 3.8 and 3.5 series', () => {
      assert.ok(mod.isAllowedGeminiModel('models/gemini-3.8-flash'));
      assert.ok(mod.isAllowedGeminiModel('models/gemini-3.8-live'));
      assert.ok(mod.isAllowedGeminiModel('models/gemini-3.5-flash'));
      assert.ok(mod.isAllowedGeminiModel('models/gemini-2.5-pro'));
      assert.ok(mod.isAllowedGeminiModel('models/gemini-2.5-flash'));
    });

    test('FALLBACK_GEMINI_MODELS includes gemini-3.8-flash as primary recommendation', () => {
      const ids = mod.FALLBACK_GEMINI_MODELS.map(m => m.id);
      assert.ok(ids.includes('gemini-3.8-flash'), 'Missing gemini-3.8-flash in fallbacks');
      assert.ok(ids.includes('gemini-3.8-live'), 'Missing gemini-3.8-live in fallbacks');
      assert.ok(ids.includes('gemini-3.5-flash'), 'Missing gemini-3.5-flash in fallbacks');
    });

    test('processGeminiModels retains 3.8 Flash, 3.8 Live, and 3.5 Flash', () => {
      const input = [
        { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.8-live', displayName: 'Gemini 3.8 Live', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.5-flash', displayName: 'Gemini 3.5 Flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-embedding-001', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
      ];
      const result = mod.processGeminiModels(input);
      assert.equal(result.length, 3);
      assert.ok(result.some(m => m.id === 'models/gemini-3.8-flash'));
      assert.ok(result.some(m => m.id === 'models/gemini-3.8-live'));
      assert.ok(result.some(m => m.id === 'models/gemini-3.5-flash'));
    });
  });

  describe('Anthropic Claude 2026 Models', () => {
    test('ALLOWED_CLAUDE_MODELS includes Opus 5.5, Sonnet 5, and Haiku 4.5', () => {
      assert.ok(mod.ALLOWED_CLAUDE_MODELS.has('claude-opus-5.5'));
      assert.ok(mod.ALLOWED_CLAUDE_MODELS.has('claude-sonnet-5'));
      assert.ok(mod.ALLOWED_CLAUDE_MODELS.has('claude-haiku-4.5'));
      assert.ok(mod.ALLOWED_CLAUDE_MODELS.has('claude-sonnet-4-6'));
    });

    test('FALLBACK_CLAUDE_MODELS contains Opus 5.5 and Sonnet 5', () => {
      const ids = mod.FALLBACK_CLAUDE_MODELS.map(m => m.id);
      assert.ok(ids.includes('claude-opus-5.5'));
      assert.ok(ids.includes('claude-sonnet-5'));
    });
  });

  describe('OpenAI 2026 Models', () => {
    test('FALLBACK_OPENAI_MODELS includes GPT-6 series and chat-latest', () => {
      assert.ok(mod.FALLBACK_OPENAI_MODELS);
      const ids = mod.FALLBACK_OPENAI_MODELS.map(m => m.id);
      assert.ok(ids.includes('gpt-6-astra') || ids.includes('gpt-6-sol'));
      assert.ok(ids.includes('chat-latest'));
    });
  });

  describe('DeepSeek 2026 Models', () => {
    test('DEEPSEEK_DEFAULT_MODELS includes v4.1-flash with multimodal support', () => {
      const ids = mod.DEEPSEEK_DEFAULT_MODELS.map(m => m.id);
      assert.ok(ids.includes('deepseek-v4.1-flash'), 'Missing deepseek-v4.1-flash');
      assert.ok(ids.includes('deepseek-v4-pro'), 'Missing deepseek-v4-pro');
      assert.ok(ids.includes('deepseek-chat'), 'Missing deepseek-chat fallback');
    });
  });

  describe('Generic OpenAI-Compatible Endpoint Discovery', () => {
    test('fetchOpenAICompatibleModels parses standard OpenAI model response', async () => {
      assert.equal(typeof mod.fetchOpenAICompatibleModels, 'function');
      const mockHttpGet = async (url, options) => {
        assert.ok(url.includes('/models'));
        assert.equal(options?.headers?.Authorization, 'Bearer test-key');
        assert.equal(options?.headers?.['HTTP-Referer'], 'https://interviewos.dev');
        return {
          data: {
            data: [
              { id: 'anthropic/claude-opus-5.5' },
              { id: 'meta-llama/llama-3.3-70b-instruct' },
              { id: 'deepseek/deepseek-v4.1-flash' },
            ]
          }
        };
      };

      const models = await mod.fetchOpenAICompatibleModels(
        'https://openrouter.ai/api/v1',
        'test-key',
        { 'HTTP-Referer': 'https://interviewos.dev' },
        mockHttpGet
      );

      assert.equal(models.length, 3);
      assert.equal(models[0].id, 'anthropic/claude-opus-5.5');
      assert.equal(models[1].id, 'deepseek/deepseek-v4.1-flash');
      assert.equal(models[2].id, 'meta-llama/llama-3.3-70b-instruct');
    });
  });
});
