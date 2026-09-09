import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedGeminiModel, processGeminiModels } from '../../utils/modelFetcher.ts';

describe('Gemini Banana & Nano Model Filter', () => {
  test('isAllowedGeminiModel strictly rejects banana models', () => {
    assert.equal(isAllowedGeminiModel('models/gemini-2.5-flash-banana'), false);
    assert.equal(isAllowedGeminiModel('gemini-2.0-banana-pro'), false);
    assert.equal(isAllowedGeminiModel('gemini-nano-banana'), false);
    assert.equal(isAllowedGeminiModel('models/gemini-nano'), false);
    assert.equal(isAllowedGeminiModel('gemini-2.0-flash-nano'), false);
  });

  test('isAllowedGeminiModel allows legitimate production Gemini models', () => {
    assert.equal(isAllowedGeminiModel('models/gemini-2.5-flash'), true);
    assert.equal(isAllowedGeminiModel('models/gemini-2.5-pro'), true);
    assert.equal(isAllowedGeminiModel('gemini-2.0-flash'), true);
    assert.equal(isAllowedGeminiModel('gemini-2.0-flash-lite'), true);
  });

  test('processGeminiModels filters out models with banana in name or displayName', () => {
    const rawModels = [
      {
        name: 'models/gemini-2.5-flash',
        displayName: 'Gemini 2.5 Flash',
        supportedGenerationMethods: ['generateContent'],
      },
      {
        name: 'models/gemini-2.5-flash-banana',
        displayName: 'Gemini 2.5 Banana Experimental',
        supportedGenerationMethods: ['generateContent'],
      },
      {
        name: 'models/gemini-2.0-flash-lite',
        displayName: 'Gemini 2.0 Flash Lite',
        supportedGenerationMethods: ['generateContent'],
      },
      {
        name: 'models/gemini-2.0-flash-custom',
        displayName: 'Gemini Banana Nano',
        supportedGenerationMethods: ['generateContent'],
      },
    ];

    const result = processGeminiModels(rawModels);
    assert.equal(result.length, 2);
    assert.equal(result[0].id, 'models/gemini-2.0-flash-lite');
    assert.equal(result[1].id, 'models/gemini-2.5-flash');
    assert.ok(!result.some(m => m.id.includes('banana') || m.label.includes('Banana')));
  });
});
