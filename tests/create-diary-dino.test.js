// tests/create-diary-dino.test.js
// create-diary API の characterId 機能テスト
//
// テストシナリオ:
// 1. dino-storyモードでcharacterId指定時、キャラクター設定がプロンプトに注入される
// 2. characterId未指定時の後方互換性
// 3. normalモードではcharacterIdが無視される
// 4. dino-researchモードではcharacterIdが無視される
// 5. 不正なcharacterIdフォーマットが拒否される
// 6. 長すぎるcharacterIdが拒否される
// 7. キャラクター読み込み失敗時のfail-open動作

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// JWT生成用ヘルパー
import { signJwt } from '../api/lib/jwt.js';

const JWT_SECRET = 'test-jwt-secret-key-for-dino-tests';

function createValidJwt() {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({ sub: 'diary-admin', iat: now, exp: now + 3600 }, JWT_SECRET);
}

// モック用キャラクターデータ
const mockCharacter = {
  id: 'quetz-default',
  name: 'ケッツ',
  nameEn: 'Quetz',
  species: { scientific: 'Quetzalcoatlus', common: 'ケッツァコアトルス', family: 'Azhdarchidae' },
  personality: { traits: ['好奇心旺盛'], speechStyle: 'のんびり', firstPerson: 'ボク' },
  appearance: { consistencyKeywords: ['chibi quetzalcoatlus'], description: 'test', descriptionEn: 'test', artStyle: 'test' },
  imageGeneration: { basePrompt: 'A cute chibi Quetzalcoatlus', negativePrompt: '', styleModifiers: ['soft'] },
  settings: {}
};

// モック用のreq/resファクトリ
function createMockReq(overrides = {}) {
  const { headers: hOverrides, body: bOverrides, ...restOverrides } = overrides;
  return {
    method: 'POST',
    headers: {
      origin: 'https://my-voice-diary.vercel.app',
      'content-type': 'application/json',
      'x-auth-token': createValidJwt(),
      'x-forwarded-for': '192.168.1.1',
      ...hOverrides,
    },
    body: {
      rawText: '今日はテストの日です。',
      styleId: 'illustration',
      ...bOverrides,
    },
    socket: { remoteAddress: '127.0.0.1' },
    ...restOverrides,
  };
}

function createMockRes() {
  const res = {
    _status: null,
    _json: null,
    _headers: {},
    setHeader(key, value) { this._headers[key] = value; return this; },
    status(code) { this._status = code; return this; },
    json(data) { this._json = data; return this; },
    end() { return this; },
  };
  return res;
}

// 全テストで共通の環境変数
const baseEnv = {
  VERCEL_PROJECT_PRODUCTION_URL: 'my-voice-diary.vercel.app',
  VERCEL_URL: 'my-voice-diary-xxx.vercel.app',
  JWT_SECRET,
  CLAUDE_API_KEY: 'sk-ant-test-key',
  GITHUB_TOKEN: 'ghp_test',
  GITHUB_OWNER: 'TestOwner',
  GITHUB_REPO: 'test-repo',
  IMAGE_TOKEN_SECRET: 'test-image-secret',
  UPSTASH_REDIS_REST_URL: 'https://test-redis.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'test-redis-token',
};

describe('create-diary API characterId機能', () => {
  let handler;
  let originalFetch;
  let lastClaudePrompt;

  beforeEach(async () => {
    Object.assign(process.env, baseEnv);
    originalFetch = globalThis.fetch;
    lastClaudePrompt = null;

    vi.resetModules();
    const mod = await import('../api/create-diary.js');
    handler = mod.default;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // フェッチモックのファクトリ（キャラクター読み込みの挙動をカスタマイズ可能）
  function setupFetchMock(characterMockFn) {
    globalThis.fetch = vi.fn(async (url, opts) => {
      // Upstash incr
      if (url.includes('upstash') && url.includes('incr')) {
        return { ok: true, json: async () => ({ result: 1 }) };
      }
      // Upstash expire
      if (url.includes('upstash') && url.includes('expire')) {
        return { ok: true, json: async () => ({ result: 1 }) };
      }
      // Claude API
      if (url.includes('api.anthropic.com')) {
        if (opts?.body) {
          const body = JSON.parse(opts.body);
          lastClaudePrompt = body.messages[0].content;
        }
        return {
          ok: true,
          json: async () => ({
            content: [{ text: JSON.stringify({
              date: '2026-03-20',
              title: 'テスト日記',
              summary: 'テストサマリー',
              body: 'テスト本文',
              tags: ['#テスト'],
              image_prompt: 'A test image prompt'
            }) }]
          })
        };
      }
      // GitHub API - character file load（カスタマイズ可能）
      if (characterMockFn && url.includes('characters/')) {
        return characterMockFn(url, opts);
      }
      // GitHub API GET (file not found)
      if (url.includes('api.github.com') && (!opts || opts.method !== 'PUT')) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      // GitHub API PUT (create file)
      if (url.includes('api.github.com') && opts?.method === 'PUT') {
        return { ok: true, json: async () => ({ content: { sha: 'abc123' } }) };
      }
      return { ok: true, json: async () => ({}) };
    });
  }

  // =================================================================
  // テスト1: dino-storyモードでcharacterId指定時のキャラクター注入
  // =================================================================
  it('dino-storyモード + characterId指定時、キャラクター設定がプロンプトに注入される', async () => {
    setupFetchMock((url) => {
      if (url.includes('characters/quetz-default.json')) {
        const charData = mockCharacter;
        return {
          ok: true,
          json: async () => ({
            content: Buffer.from(JSON.stringify(charData)).toString('base64')
          })
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const req = createMockReq({
      body: {
        rawText: '今日はテストの日です。',
        mode: 'dino-story',
        characterId: 'quetz-default',
      },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(lastClaudePrompt).toContain('キャラクター設定');
    expect(lastClaudePrompt).toContain('ケッツ');
    expect(res._json.characterId).toBe('quetz-default');
    expect(res._json.styleId).toBe('illustration');
  });

  // =================================================================
  // テスト2: characterId未指定時の後方互換性
  // =================================================================
  it('dino-storyモード + characterId未指定時、後方互換性が保たれる', async () => {
    setupFetchMock();

    const req = createMockReq({
      body: {
        rawText: '今日はテストの日です。',
        mode: 'dino-story',
      },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.characterId).toBeUndefined();
    expect(res._json.styleId).toBe('illustration');
  });

  // =================================================================
  // テスト3: normalモードではcharacterIdが無視される
  // =================================================================
  it('normalモードではcharacterIdが無視される', async () => {
    setupFetchMock();

    const req = createMockReq({
      body: {
        rawText: '今日はテストの日です。',
        mode: 'normal',
        characterId: 'quetz-default',
      },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.characterId).toBeUndefined();
    expect(lastClaudePrompt).not.toContain('キャラクター設定');
    expect(res._json.styleId).toBe('illustration');
  });

  // =================================================================
  // テスト4: dino-researchモードではcharacterIdが無視される
  // =================================================================
  it('dino-researchモードではcharacterIdが無視される', async () => {
    setupFetchMock();

    const req = createMockReq({
      body: {
        rawText: '今日はテストの日です。',
        mode: 'dino-research',
        characterId: 'quetz-default',
      },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.characterId).toBeUndefined();
    expect(res._json.styleId).toBe('illustration');
  });

  // =================================================================
  // テスト5: 不正なcharacterIdフォーマットが拒否される
  // =================================================================
  it('不正なcharacterIdフォーマットが400で拒否される', async () => {
    setupFetchMock();

    const req = createMockReq({
      body: {
        rawText: '今日はテストの日です。',
        mode: 'dino-story',
        characterId: 'INVALID!!!',
      },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(400);
  });

  // =================================================================
  // テスト6: 長すぎるcharacterIdが拒否される
  // =================================================================
  it('長すぎるcharacterIdが400で拒否される', async () => {
    setupFetchMock();

    const req = createMockReq({
      body: {
        rawText: '今日はテストの日です。',
        mode: 'dino-story',
        characterId: 'a'.repeat(31),
      },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(400);
  });

  // =================================================================
  // テスト7: キャラクター読み込み失敗時のfail-open動作
  // =================================================================
  it('キャラクター読み込み失敗時、fail-openで日記作成が続行される', async () => {
    setupFetchMock((url) => {
      if (url.includes('characters/nonexistent-char.json')) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const req = createMockReq({
      body: {
        rawText: '今日はテストの日です。',
        mode: 'dino-story',
        characterId: 'nonexistent-char',
      },
    });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.characterId).toBeUndefined();
    expect(res._json.styleId).toBe('illustration');
  });

  // =================================================================
  // テスト8: 不正なstyleIdが400で拒否されること
  // =================================================================
  it('不正なstyleIdが400で拒否されること', async () => {
    setupFetchMock();
    const req = createMockReq({
      body: { rawText: '今日はテストの日です。', styleId: 'invalid-style' },
    });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  // =================================================================
  // テスト9: styleId未指定が400で拒否されること
  // =================================================================
  it('styleId未指定が400で拒否されること', async () => {
    setupFetchMock();
    const req = createMockReq({
      body: { rawText: '今日はテストの日です。' },
    });
    // styleIdをundefinedに設定
    delete req.body.styleId;
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  // =================================================================
  // テスト10: styleIdがClaudeプロンプトに反映されること
  // =================================================================
  it('styleIdがClaudeプロンプトに反映されること', async () => {
    setupFetchMock();
    const req = createMockReq({
      body: { rawText: '今日はテストの日です。', styleId: 'oilpainting' },
    });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    // 油絵スタイルの指示がClaudeプロンプトに含まれること
    expect(lastClaudePrompt).toContain('油絵調');
  });

  // =================================================================
  // テスト11: レスポンスにstyleIdが含まれること
  // =================================================================
  it('レスポンスにstyleIdが含まれること', async () => {
    setupFetchMock();
    const req = createMockReq({
      body: { rawText: '今日はテストの日です。', styleId: 'illustration' },
    });
    const res = createMockRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.styleId).toBe('illustration');
  });
});
