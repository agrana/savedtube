import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RESEARCH_MODEL_DEFAULT_BASE_URL,
  RESEARCH_MODEL_DEFAULT_NAME,
  RESEARCH_MODEL_DEFAULT_PROVIDER,
  researchModelNotConfiguredMessage,
  resolveResearchModelConfig,
} from './config-research-model.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('resolveResearchModelConfig', () => {
  it('defaults provider, model, and base URL when unset', () => {
    const resolved = resolveResearchModelConfig({});
    assert.equal(resolved.modelProvider, RESEARCH_MODEL_DEFAULT_PROVIDER);
    assert.equal(resolved.modelName, RESEARCH_MODEL_DEFAULT_NAME);
    assert.equal(resolved.modelBaseUrl, RESEARCH_MODEL_DEFAULT_BASE_URL);
    assert.equal(resolved.modelApiKey, null);
    assert.equal(resolved.apiKeySource, null);
    assert.equal(resolved.baseUrlSource, 'default');
    assert.deepEqual(resolved.missingApiKeyVariables, [
      'RESEARCH_MODEL_API_KEY',
      'OPENAI_API_KEY',
    ]);
  });

  it('prefers RESEARCH_MODEL_API_KEY over OPENAI_API_KEY', () => {
    const resolved = resolveResearchModelConfig({
      RESEARCH_MODEL_API_KEY: 'research-key',
      OPENAI_API_KEY: 'openai-key',
    });
    assert.equal(resolved.modelApiKey, 'research-key');
    assert.equal(resolved.apiKeySource, 'RESEARCH_MODEL_API_KEY');
    assert.deepEqual(resolved.missingApiKeyVariables, []);
  });

  it('falls back to OPENAI_API_KEY only when provider is openai', () => {
    const openai = resolveResearchModelConfig({
      OPENAI_API_KEY: 'openai-key',
    });
    assert.equal(openai.modelApiKey, 'openai-key');
    assert.equal(openai.apiKeySource, 'OPENAI_API_KEY');
    assert.deepEqual(openai.missingApiKeyVariables, []);

    const other = resolveResearchModelConfig({
      RESEARCH_MODEL_PROVIDER: 'anthropic',
      OPENAI_API_KEY: 'openai-key',
    });
    assert.equal(other.modelApiKey, null);
    assert.equal(other.apiKeySource, null);
    assert.deepEqual(other.missingApiKeyVariables, ['RESEARCH_MODEL_API_KEY']);
  });

  it('prefers RESEARCH_MODEL_BASE_URL over OPENAI_BASE_URL', () => {
    const resolved = resolveResearchModelConfig({
      RESEARCH_MODEL_BASE_URL: 'https://research.example/v1',
      OPENAI_BASE_URL: 'https://openai.example/v1',
    });
    assert.equal(resolved.modelBaseUrl, 'https://research.example/v1');
    assert.equal(resolved.baseUrlSource, 'RESEARCH_MODEL_BASE_URL');
  });

  it('falls back to OPENAI_BASE_URL only when provider is openai and explicit base URL is absent', () => {
    const openai = resolveResearchModelConfig({
      OPENAI_BASE_URL: 'https://openai.example/v1',
    });
    assert.equal(openai.modelBaseUrl, 'https://openai.example/v1');
    assert.equal(openai.baseUrlSource, 'OPENAI_BASE_URL');

    const other = resolveResearchModelConfig({
      RESEARCH_MODEL_PROVIDER: 'anthropic',
      OPENAI_BASE_URL: 'https://openai.example/v1',
    });
    assert.equal(other.modelBaseUrl, RESEARCH_MODEL_DEFAULT_BASE_URL);
    assert.equal(other.baseUrlSource, 'default');
  });

  it('honors explicit RESEARCH_MODEL_PROVIDER and RESEARCH_MODEL_NAME overrides', () => {
    const resolved = resolveResearchModelConfig({
      RESEARCH_MODEL_PROVIDER: 'openai',
      RESEARCH_MODEL_NAME: 'gpt-4.1-mini',
      RESEARCH_MODEL_API_KEY: 'research-key',
    });
    assert.equal(resolved.modelProvider, 'openai');
    assert.equal(resolved.modelName, 'gpt-4.1-mini');
  });

  it('treats blank env values as absent', () => {
    const resolved = resolveResearchModelConfig({
      RESEARCH_MODEL_API_KEY: '   ',
      OPENAI_API_KEY: '\t',
      RESEARCH_MODEL_BASE_URL: '',
      OPENAI_BASE_URL: '  ',
    });
    assert.equal(resolved.modelApiKey, null);
    assert.equal(resolved.apiKeySource, null);
    assert.equal(resolved.modelBaseUrl, RESEARCH_MODEL_DEFAULT_BASE_URL);
    assert.equal(resolved.baseUrlSource, 'default');
  });

  it('never consults browser-exposed NEXT_PUBLIC keys via the env bag contract', () => {
    const source = readFileSync(
      join(root, 'src/lib/config-research-model.ts'),
      'utf8'
    );
    assert.equal(/process\.env/.test(source), false);
    assert.equal(/\bNEXT_PUBLIC_[A-Z0-9_]+\b/.test(source), false);

    const configSource = readFileSync(join(root, 'src/lib/config.ts'), 'utf8');
    assert.equal(configSource.includes('NEXT_PUBLIC_OPENAI'), false);
    assert.equal(
      /optionalEnvVar\(\s*['"]NEXT_PUBLIC_.*API_KEY['"]\s*\)/.test(
        configSource
      ),
      false
    );
  });
});

describe('researchModelNotConfiguredMessage', () => {
  it('lists missing variable names without values and states research cannot run', () => {
    const openaiMissing = researchModelNotConfiguredMessage({
      missingApiKeyVariables: ['RESEARCH_MODEL_API_KEY', 'OPENAI_API_KEY'],
    });
    assert.match(openaiMissing, /RESEARCH_MODEL_API_KEY/);
    assert.match(openaiMissing, /OPENAI_API_KEY/);
    assert.match(openaiMissing, /Research cannot run/);
    assert.equal(openaiMissing.includes('sk-'), false);

    const nonOpenAi = researchModelNotConfiguredMessage({
      missingApiKeyVariables: ['RESEARCH_MODEL_API_KEY'],
    });
    assert.equal(
      nonOpenAi,
      'Research model is not configured: missing RESEARCH_MODEL_API_KEY. Research cannot run.'
    );
  });
});

describe('path create preserves shell when research is misconfigured', () => {
  it('navigates to the saved path with researchError query on research failure', () => {
    const source = readFileSync(join(root, 'src/app/paths/page.tsx'), 'utf8');
    assert.match(source, /Always open the saved path/);
    assert.match(source, /researchError=/);
    assert.match(source, /router\.push\(`\/paths\/\$\{pathId\}/);
  });
});
