// tests/create-diary-schema.test.js
// Phase 1: JSON_OUTPUT_SCHEMA スタイル別分岐 + buildPrompt styleId伝播 + handler統合テスト

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSON_OUTPUT_SCHEMA, buildPrompt } from '../api/create-diary.js';
import { OILPAINTING_STORY_REQUIREMENTS, GENERIC_IMAGE_PROMPT_REQUIREMENTS } from '../lib/image-prompt-requirements.js';
import { signJwt } from '../lib/jwt.js';

// ===================================================================
// 定数一貫性テスト（Step 3-2a前提: 共通定数がスキーマに反映されること）
// ===================================================================

describe('定数一貫性 - JSON_OUTPUT_SCHEMAが共通定数を参照', () => {
  it('oilpaintingスキーマがOILPAINTING_STORY_REQUIREMENTSを含むこと', () => {
    const schema = JSON_OUTPUT_SCHEMA('2026-03-30', 'oilpainting');
    expect(schema).toContain(OILPAINTING_STORY_REQUIREMENTS);
  });
});

// ===================================================================
// JSON_OUTPUT_SCHEMA単体テスト（3件）
// ===================================================================

describe('JSON_OUTPUT_SCHEMA - スタイル別image_prompt分岐', () => {
  it('oilpainting: ストーリー駆動の指示を含む', () => {
    const schema = JSON_OUTPUT_SCHEMA('2026-03-30', 'oilpainting');
    expect(schema).toContain('最も劇的・印象的な瞬間');
    expect(schema).toContain('物語的意味');
  });

  it('illustration: 従来の汎用指示を含む', () => {
    const schema = JSON_OUTPUT_SCHEMA('2026-03-30', 'illustration');
    expect(schema).toContain('中核エピソード');
    expect(schema).not.toContain('物語的意味');
  });

  it('popillust: 従来の汎用指示を含む', () => {
    const schema = JSON_OUTPUT_SCHEMA('2026-03-30', 'popillust');
    expect(schema).toContain('中核エピソード');
  });
});

// ===================================================================
// buildPrompt統合テスト（4件）— styleId伝播経路の検証
// ===================================================================

describe('buildPrompt - styleId伝播によるimage_prompt指示分岐', () => {
  const today = '2026年03月30日';
  const rawText = 'テスト日記テキスト';

  it('normalモード + oilpainting: ストーリー駆動の指示が伝播する', () => {
    const prompt = buildPrompt('normal', rawText, today, null, '画風指示', 'oilpainting');
    expect(prompt).toContain('最も劇的・印象的な瞬間');
    expect(prompt).toContain('物語的意味');
  });

  it('dino-storyモード + oilpainting: ストーリー駆動の指示が伝播する', () => {
    const dinoContext = { era: 'cretaceous' };
    const prompt = buildPrompt('dino-story', rawText, today, dinoContext, '画風指示', 'oilpainting');
    expect(prompt).toContain('最も劇的・印象的な瞬間');
  });

  it('dino-researchモード + oilpainting: ストーリー駆動の指示が伝播する', () => {
    const dinoContext = { topic: '恐竜の巣作り行動', sources: [] };
    const prompt = buildPrompt('dino-research', rawText, today, dinoContext, '画風指示', 'oilpainting');
    expect(prompt).toContain('最も劇的・印象的な瞬間');
    expect(prompt).toContain('物語的意味');
  });

  it('normalモード + illustration: 従来の汎用指示が使用される', () => {
    const prompt = buildPrompt('normal', rawText, today, null, '画風指示', 'illustration');
    expect(prompt).toContain('中核エピソード');
    expect(prompt).not.toContain('物語的意味');
  });
});

// ===================================================================
// handler経由の統合テスト（4件）— 実運用経路のstyleId伝播検証
// ===================================================================

const JWT_SECRET = 'test-jwt-secret-key-for-schema-tests';

function createValidJwt() {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({ sub: 'diary-admin', iat: now, exp: now + 3600 }, JWT_SECRET);
}

describe('handler経由 styleId伝播テスト', () => {
  let handler;
  let originalFetch;
  let lastClaudePrompt;

  beforeEach(async () => {
    Object.assign(process.env, {
      JWT_SECRET,
      CLAUDE_API_KEY: 'sk-ant-test-key',
      UPSTASH_REDIS_REST_URL: 'https://test-redis.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'test-redis-token',
      GITHUB_TOKEN: 'ghp_test',
      GITHUB_OWNER: 'TestOwner',
      GITHUB_REPO: 'test-repo',
      IMAGE_TOKEN_SECRET: 'test-image-secret',
      VERCEL_PROJECT_PRODUCTION_URL: 'my-voice-diary.vercel.app',
    });
    originalFetch = globalThis.fetch;
    lastClaudePrompt = null;
    vi.resetModules();
    const mod = await import('../api/create-diary.js');
    handler = mod.default;
  });

  afterEach(() => { globalThis.fetch = originalFetch; });

  function setupFetchMock() {
    globalThis.fetch = vi.fn(async (url, opts) => {
      if (url.includes('upstash') && url.includes('incr'))
        return { ok: true, json: async () => ({ result: 1 }) };
      if (url.includes('upstash') && url.includes('expire'))
        return { ok: true, json: async () => ({ result: 1 }) };
      if (url.includes('api.anthropic.com')) {
        if (opts?.body) {
          const body = JSON.parse(opts.body);
          lastClaudePrompt = body.messages[0].content;
        }
        return {
          ok: true,
          json: async () => ({
            content: [{ text: JSON.stringify({
              date: '2026-03-30', title: 'テスト', summary: 'サマリー',
              body: '本文', tags: ['#test'],
              image_prompt: 'A dramatic scene',
            }) }],
          }),
        };
      }
      if (url.includes('github'))
        return { ok: true, json: async () => ({ content: { sha: 'abc123' } }) };
      return { ok: true, json: async () => ({}) };
    });
  }

  function createReq(mode, styleId) {
    return {
      method: 'POST',
      headers: {
        origin: 'https://my-voice-diary.vercel.app',
        'content-type': 'application/json',
        'x-auth-token': createValidJwt(),
        'x-forwarded-for': '192.168.1.1',
      },
      body: { rawText: '今日はテストの日です。', styleId, mode },
      socket: { remoteAddress: '127.0.0.1' },
    };
  }

  function createRes() {
    const res = {
      _status: null, _json: null, _headers: {},
      setHeader(k, v) { this._headers[k] = v; return this; },
      status(c) { this._status = c; return this; },
      json(d) { this._json = d; return this; },
      end() { return this; },
    };
    return res;
  }

  it('handler経由: normalモード+oilpaintingでClaude送信にstory-driven文言', async () => {
    setupFetchMock();
    const res = createRes();
    await handler(createReq('normal', 'oilpainting'), res);
    expect(res._status).toBe(200);
    expect(lastClaudePrompt).toContain('最も劇的・印象的な瞬間');
    expect(lastClaudePrompt).toContain('物語的意味');
  });

  it('handler経由: dino-storyモード+oilpaintingでClaude送信にstory-driven文言', async () => {
    setupFetchMock();
    const res = createRes();
    await handler(createReq('dino-story', 'oilpainting'), res);
    expect(res._status).toBe(200);
    expect(lastClaudePrompt).toContain('最も劇的・印象的な瞬間');
  });

  it('handler経由: dino-researchモード+oilpaintingでClaude送信にstory-driven文言', async () => {
    setupFetchMock();
    const res = createRes();
    await handler(createReq('dino-research', 'oilpainting'), res);
    expect(res._status).toBe(200);
    expect(lastClaudePrompt).toContain('最も劇的・印象的な瞬間');
    expect(lastClaudePrompt).toContain('物語的意味');
  });

  it('handler経由: normalモード+illustrationでは従来の汎用指示', async () => {
    setupFetchMock();
    const res = createRes();
    await handler(createReq('normal', 'illustration'), res);
    expect(res._status).toBe(200);
    expect(lastClaudePrompt).toContain('中核エピソード');
    expect(lastClaudePrompt).not.toContain('物語的意味');
  });
});

// ===================================================================
// claudeInstruction検証テスト（1件）— image-prompt-requirements定数の内容検証
// ===================================================================

describe('image-prompt-requirements定数の内容検証', () => {
  it('OILPAINTING_STORY_REQUIREMENTSにストーリー駆動の要素が含まれること', () => {
    expect(OILPAINTING_STORY_REQUIREMENTS).toContain('最も劇的・印象的な瞬間');
    expect(OILPAINTING_STORY_REQUIREMENTS).toContain('行動・感情');
    expect(OILPAINTING_STORY_REQUIREMENTS).toContain('物語的意味');
    expect(OILPAINTING_STORY_REQUIREMENTS).toContain('構図');
    expect(OILPAINTING_STORY_REQUIREMENTS).toContain('ライティング');
    expect(OILPAINTING_STORY_REQUIREMENTS).toContain('環境ディテール');
  });
});
