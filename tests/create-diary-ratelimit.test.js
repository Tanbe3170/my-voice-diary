// tests/create-diary-ratelimit.test.js
// create-diary API の Upstash Redis レート制限テスト
//
// テストシナリオ:
// 1. Upstash障害時にClaude API呼び出しが行われないこと（fail-closed）
// 2. 正常時、30回/日を超えると429を返すこと
// 3. 正常リクエスト時、レート制限を通過してClaude API呼び出しに進むこと
// 4. TTL原子性（初回EXPIRE失敗時にTTL確認→再設定）

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// JWT生成用ヘルパー
import { signJwt } from '../api/lib/jwt.js';

const JWT_SECRET = 'test-jwt-secret-key-for-ratelimit-tests';

function createValidJwt() {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({ sub: 'diary-admin', iat: now, exp: now + 3600 }, JWT_SECRET);
}

// モック用のreq/resファクトリ
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

describe('create-diary API レート制限', () => {
  let handler;
  let originalFetch;
  let fetchCalls;

  beforeEach(async () => {
    // 環境変数を設定
    Object.assign(process.env, baseEnv);

    // fetch呼び出しを記録
    fetchCalls = [];
    originalFetch = globalThis.fetch;

    // モジュールキャッシュをクリアしてハンドラを再読み込み
    vi.resetModules();
    const mod = await import('../api/create-diary.js');
    handler = mod.default;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // =================================================================
  // テスト1: Upstash障害時のfail-closed
  // =================================================================
  describe('Upstash障害時のfail-closed', () => {
    it('Upstash incr HTTPエラー時、500を返しClaude APIを呼び出さない', async () => {
      let claudeCalled = false;

      globalThis.fetch = vi.fn(async (url) => {
        fetchCalls.push(url);

        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: false, status: 503, json: async () => ({}) };
        }

        if (url.includes('api.anthropic.com')) {
          claudeCalled = true;
          return { ok: true, json: async () => ({}) };
        }

        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(500);
      expect(claudeCalled).toBe(false);
      const claudeCalls = fetchCalls.filter(u => u.includes('api.anthropic.com'));
      expect(claudeCalls).toHaveLength(0);
    });

    it('Upstash incr不正レスポンス（result=0）時、500を返しClaude APIを呼び出さない', async () => {
      let claudeCalled = false;

      globalThis.fetch = vi.fn(async (url) => {
        fetchCalls.push(url);

        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 0 }) };
        }

        if (url.includes('api.anthropic.com')) {
          claudeCalled = true;
          return { ok: true, json: async () => ({}) };
        }

        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(500);
      expect(claudeCalled).toBe(false);
    });

    it('Upstash接続エラー（fetch例外）時、500を返しClaude APIを呼び出さない', async () => {
      let claudeCalled = false;

      globalThis.fetch = vi.fn(async (url) => {
        fetchCalls.push(url);

        if (url.includes('upstash') && url.includes('incr')) {
          throw new Error('Network error');
        }

        if (url.includes('api.anthropic.com')) {
          claudeCalled = true;
          return { ok: true, json: async () => ({}) };
        }

        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(500);
      expect(claudeCalled).toBe(false);
    });

    it('Upstash環境変数未設定時、500を返すこと', async () => {
      delete process.env.UPSTASH_REDIS_REST_URL;

      vi.resetModules();
      const mod = await import('../api/create-diary.js');
      const freshHandler = mod.default;

      const req = createMockReq();
      const res = createMockRes();
      await freshHandler(req, res);

      expect(res._status).toBe(500);
      expect(res._json.error).toContain('サーバーの設定');
    });
  });

  // =================================================================
  // テスト2: レート制限（30req/日）
  // =================================================================
  describe('レート制限（30req/日）', () => {
    it('count > 30 のとき429を返す', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        fetchCalls.push(url);

        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 31 }) };
        }

        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(429);
      expect(res._json.error).toContain('上限');
    });

    it('count === 30 のとき429を返さないこと', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        fetchCalls.push(url);

        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 30 }) };
        }

        // Claude API → 正常レスポンス（レート制限を通過した証拠）
        if (url.includes('api.anthropic.com')) {
          return {
            ok: true,
            json: async () => ({
              content: [{ text: '```json\n{"title":"テスト","summary":"テスト","body":"テスト","tags":["#test"],"image_prompt":"test"}\n```' }]
            })
          };
        }

        // GitHub API → 正常レスポンス
        if (url.includes('api.github.com')) {
          return {
            ok: true,
            json: async () => ({ content: { html_url: 'https://github.com/test' } })
          };
        }

        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      // 429ではないことを確認（200 or Claude API通過）
      expect(res._status).not.toBe(429);
      const claudeCalls = fetchCalls.filter(u => u.includes('api.anthropic.com'));
      expect(claudeCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =================================================================
  // テスト3: 正常リクエスト時、レート制限通過確認
  // =================================================================
  describe('正常リクエスト時のレート制限通過', () => {
    it('count === 1 のとき、EXPIRE呼び出しが行われること', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        fetchCalls.push(url);

        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }

        if (url.includes('upstash') && url.includes('expire')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }

        if (url.includes('api.anthropic.com')) {
          return {
            ok: true,
            json: async () => ({
              content: [{ text: '```json\n{"title":"テスト","summary":"テスト","body":"テスト","tags":["#test"],"image_prompt":"test"}\n```' }]
            })
          };
        }

        if (url.includes('api.github.com')) {
          return {
            ok: true,
            json: async () => ({ content: { html_url: 'https://github.com/test' } })
          };
        }

        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      // EXPIREが呼ばれたことを確認
      const expireCalls = fetchCalls.filter(u => u.includes('upstash') && u.includes('expire'));
      expect(expireCalls.length).toBeGreaterThanOrEqual(1);

      // Claude APIに到達したことを確認
      const claudeCalls = fetchCalls.filter(u => u.includes('api.anthropic.com'));
      expect(claudeCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('count === 5 のとき、EXPIREが呼ばれないこと', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        fetchCalls.push(url);

        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 5 }) };
        }

        if (url.includes('api.anthropic.com')) {
          return {
            ok: true,
            json: async () => ({
              content: [{ text: '```json\n{"title":"テスト","summary":"テスト","body":"テスト","tags":["#test"],"image_prompt":"test"}\n```' }]
            })
          };
        }

        if (url.includes('api.github.com')) {
          return {
            ok: true,
            json: async () => ({ content: { html_url: 'https://github.com/test' } })
          };
        }

        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      // EXPIREが呼ばれないことを確認
      const expireCalls = fetchCalls.filter(u => u.includes('upstash') && u.includes('expire'));
      expect(expireCalls).toHaveLength(0);
    });
  });

  // =================================================================
  // テスト4: TTL原子性（fail-closed）
  // =================================================================
  describe('TTL原子性（fail-closed）', () => {
    it('EXPIRE失敗→TTL=-1→再EXPIRE成功で処理継続すること', async () => {
      let expireCallCount = 0;

      globalThis.fetch = vi.fn(async (url) => {
        fetchCalls.push(url);

        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }

        // EXPIRE呼び出しのカウント
        if (url.includes('upstash') && url.includes('expire')) {
          expireCallCount++;
          if (expireCallCount === 1) {
            // 初回EXPIRE → 失敗
            return { ok: false, status: 500, json: async () => ({}) };
          }
          // 再試行EXPIRE → 成功
          return { ok: true, json: async () => ({ result: 1 }) };
        }

        // TTL確認 → 無期限（-1）
        if (url.includes('upstash') && url.includes('/ttl/')) {
          return { ok: true, json: async () => ({ result: -1 }) };
        }

        if (url.includes('api.anthropic.com')) {
          return {
            ok: true,
            json: async () => ({
              content: [{ text: '```json\n{"title":"テスト","summary":"テスト","body":"テスト","tags":["#test"],"image_prompt":"test"}\n```' }]
            })
          };
        }

        if (url.includes('api.github.com')) {
          return {
            ok: true,
            json: async () => ({ content: { html_url: 'https://github.com/test' } })
          };
        }

        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      // TTL確認が行われたことを確認
      const ttlCalls = fetchCalls.filter(u => u.includes('upstash') && u.includes('/ttl/'));
      expect(ttlCalls.length).toBeGreaterThanOrEqual(1);

      // Claude APIに到達したことを確認（処理継続）
      const claudeCalls = fetchCalls.filter(u => u.includes('api.anthropic.com'));
      expect(claudeCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('EXPIRE失敗→TTL取得失敗で500を返すこと（fail-closed）', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        fetchCalls.push(url);

        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }

        if (url.includes('upstash') && url.includes('expire')) {
          return { ok: false, status: 500, json: async () => ({}) };
        }

        // TTL取得も失敗
        if (url.includes('upstash') && url.includes('/ttl/')) {
          return { ok: false, status: 500, json: async () => ({}) };
        }

        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(500);
      // Claude APIに到達していないことを確認
      const claudeCalls = fetchCalls.filter(u => u.includes('api.anthropic.com'));
      expect(claudeCalls).toHaveLength(0);
    });

    it('EXPIRE失敗→TTL=-1→再EXPIRE失敗で500を返すこと（fail-closed）', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        fetchCalls.push(url);

        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }

        // 全EXPIREが失敗
        if (url.includes('upstash') && url.includes('expire')) {
          return { ok: false, status: 500, json: async () => ({}) };
        }

        // TTL → 無期限
        if (url.includes('upstash') && url.includes('/ttl/')) {
          return { ok: true, json: async () => ({ result: -1 }) };
        }

        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(500);
      // Claude APIに到達していないことを確認
      const claudeCalls = fetchCalls.filter(u => u.includes('api.anthropic.com'));
      expect(claudeCalls).toHaveLength(0);
    });

    it('EXPIRE失敗→TTL!=-1（既に設定済み）で処理継続すること', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        fetchCalls.push(url);

        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }

        if (url.includes('upstash') && url.includes('expire')) {
          return { ok: false, status: 500, json: async () => ({}) };
        }

        // TTL → 既に設定済み（例: 残り50000秒）
        if (url.includes('upstash') && url.includes('/ttl/')) {
          return { ok: true, json: async () => ({ result: 50000 }) };
        }

        if (url.includes('api.anthropic.com')) {
          return {
            ok: true,
            json: async () => ({
              content: [{ text: '```json\n{"title":"テスト","summary":"テスト","body":"テスト","tags":["#test"],"image_prompt":"test"}\n```' }]
            })
          };
        }

        if (url.includes('api.github.com')) {
          return {
            ok: true,
            json: async () => ({ content: { html_url: 'https://github.com/test' } })
          };
        }

        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      // 500ではないことを確認
      expect(res._status).not.toBe(500);
      // Claude APIに到達
      const claudeCalls = fetchCalls.filter(u => u.includes('api.anthropic.com'));
      expect(claudeCalls.length).toBeGreaterThanOrEqual(1);
    });
  });
});
