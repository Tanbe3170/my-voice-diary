// tests/create-diary-timeout.test.js
// create-diary API のタイムアウト・image_promptフォールバックテスト
//
// テストシナリオ:
// 1. image_prompt欠落時にtitleベースのフォールバックで日記作成成功
// 2. Claude APIタイムアウト時の適切なエラー処理

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { signJwt } from '../lib/jwt.js';

const JWT_SECRET = 'test-jwt-secret-key-for-timeout-tests';

function createValidJwt() {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({ sub: 'diary-admin', iat: now, exp: now + 3600 }, JWT_SECRET);
}

function createMockReq(overrides = {}) {
  return {
    method: 'POST',
    headers: {
      origin: 'https://my-voice-diary.vercel.app',
      'content-type': 'application/json',
      'x-auth-token': createValidJwt(),
      'x-forwarded-for': '192.168.1.1',
      ...overrides.headers,
    },
    body: {
      rawText: '今日はテストの日です。',
      styleId: 'illustration',
      ...overrides.body,
    },
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
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

describe('create-diary API タイムアウト・フォールバック', () => {
  let handler;
  let originalFetch;

  beforeEach(async () => {
    Object.assign(process.env, baseEnv);
    originalFetch = globalThis.fetch;
    vi.resetModules();
    const mod = await import('../api/create-diary.js');
    handler = mod.default;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('image_prompt欠落時にフォールバックで日記作成成功', async () => {
    // Claude APIがimage_promptを含まないJSONを返す
    const claudeResponse = {
      title: 'テストの日',
      summary: 'テスト要約\n2行目\n3行目',
      body: 'テスト本文',
      tags: ['#テスト'],
      // image_prompt 欠落
    };

    globalThis.fetch = vi.fn(async (url, opts) => {
      // Upstash INCR
      if (url.includes('upstash') && url.includes('incr')) {
        return { ok: true, json: async () => ({ result: 1 }) };
      }
      // Upstash EXPIRE
      if (url.includes('upstash') && url.includes('expire')) {
        return { ok: true, json: async () => ({ result: 1 }) };
      }
      // Claude API
      if (url.includes('anthropic.com')) {
        return {
          ok: true,
          json: async () => ({
            content: [{ text: JSON.stringify(claudeResponse) }],
          }),
        };
      }
      // GitHub GET（ファイル存在確認）
      if (url.includes('api.github.com') && opts?.method !== 'PUT') {
        return { ok: false, status: 404 };
      }
      // GitHub PUT（ファイル保存）
      if (url.includes('api.github.com') && opts?.method === 'PUT') {
        return { ok: true, json: async () => ({ content: {} }) };
      }
      return { ok: true, json: async () => ({}) };
    });

    const req = createMockReq();
    const res = createMockRes();
    await handler(req, res);

    // 500ではなく200（フォールバックで成功）
    expect(res._status).toBe(200);
    expect(res._json.success).toBe(true);
  });

  it('Claude APIタイムアウト（AbortError）時にエラー返却', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      // Upstash INCR
      if (url.includes('upstash') && url.includes('incr')) {
        return { ok: true, json: async () => ({ result: 1 }) };
      }
      // Upstash EXPIRE
      if (url.includes('upstash') && url.includes('expire')) {
        return { ok: true, json: async () => ({ result: 1 }) };
      }
      // Claude API → AbortError
      if (url.includes('anthropic.com')) {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }
      return { ok: true, json: async () => ({}) };
    });

    const req = createMockReq();
    const res = createMockRes();
    await handler(req, res);

    // エラーレスポンス
    expect(res._status).toBe(500);
    expect(res._json.error).toBeDefined();
  });
});
