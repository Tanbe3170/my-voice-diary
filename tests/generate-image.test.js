// tests/generate-image.test.js
// Phase 4 画像生成API のセキュリティテスト
//
// テストシナリオ:
// 1. Upstash障害時に課金処理（DALL-E）へ進まないこと（fail-closed）
// 2. 正常時、10回/日で429を返すこと
// 3. 期限切れ/不正imageTokenで401を返すこと

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// テスト用の有効なHMACトークンを生成するヘルパー
const IMAGE_TOKEN_SECRET = 'test-secret-key';
function createValidToken(date) {
  const timestamp = Date.now();
  const payload = `${date}:${timestamp}`;
  const hmac = crypto.createHmac('sha256', IMAGE_TOKEN_SECRET)
    .update(payload).digest('hex');
  return `${timestamp}:${hmac}`;
}

// モック用のreq/resファクトリ
function createMockReq(overrides = {}) {
  return {
    method: 'POST',
    headers: {
      origin: 'https://my-voice-diary.vercel.app',
      'content-type': 'application/json',
      'x-forwarded-for': '192.168.1.1',
      ...overrides.headers,
    },
    body: {
      date: '2026-02-19',
      imageToken: createValidToken('2026-02-19'),
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
  IMAGE_TOKEN_SECRET,
  OPENAI_API_KEY: 'sk-test-key',
  GITHUB_TOKEN: 'ghp_test',
  GITHUB_OWNER: 'TestOwner',
  GITHUB_REPO: 'test-repo',
  UPSTASH_REDIS_REST_URL: 'https://test-redis.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'test-redis-token',
};

describe('generate-image API', () => {
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
    // vitestのモジュールリセットで対応
    vi.resetModules();
    const mod = await import('../api/generate-image.js');
    handler = mod.default;
  });

  afterEach(() => {
    // グローバルfetchを復元（テスト間の状態汚染を防ぐ）
    globalThis.fetch = originalFetch;
  });

  // =================================================================
  // テスト1: Upstash障害時にDALL-E呼び出しが行われないこと（fail-closed）
  // =================================================================
  describe('Upstash障害時のfail-closed', () => {
    it('Upstash incr HTTPエラー時、500を返しOpenAI APIを呼び出さない', async () => {
      let openaiCalled = false;

      globalThis.fetch = vi.fn(async (url) => {
        fetchCalls.push(url);

        // Upstash incrリクエスト → HTTPエラー
        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: false, status: 503, json: async () => ({}) };
        }

        // OpenAI API（到達してはいけない）
        if (url.includes('api.openai.com')) {
          openaiCalled = true;
          return { ok: true, json: async () => ({}) };
        }

        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(500);
      expect(openaiCalled).toBe(false);
      // OpenAI URLが呼ばれていないことを確認
      const openaiCalls = fetchCalls.filter(u => u.includes('api.openai.com'));
      expect(openaiCalls).toHaveLength(0);
    });

    it('Upstash incr不正レスポンス（result=0）時、500を返しOpenAI APIを呼び出さない', async () => {
      let openaiCalled = false;

      globalThis.fetch = vi.fn(async (url) => {
        fetchCalls.push(url);

        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 0 }) };
        }

        if (url.includes('api.openai.com')) {
          openaiCalled = true;
          return { ok: true, json: async () => ({}) };
        }

        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(500);
      expect(openaiCalled).toBe(false);
    });

    it('Upstash接続エラー（fetch例外）時、500を返しOpenAI APIを呼び出さない', async () => {
      let openaiCalled = false;

      globalThis.fetch = vi.fn(async (url) => {
        fetchCalls.push(url);

        if (url.includes('upstash') && url.includes('incr')) {
          throw new Error('Network error');
        }

        if (url.includes('api.openai.com')) {
          openaiCalled = true;
          return { ok: true, json: async () => ({}) };
        }

        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(500);
      expect(openaiCalled).toBe(false);
    });
  });

  // =================================================================
  // テスト2: 正常時、10回/日を超えると429を返すこと
  // =================================================================
  describe('レート制限（10req/日）', () => {
    it('count > 10 のとき429を返す', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        fetchCalls.push(url);

        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 11 }) };
        }

        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(429);
      expect(res._json.error).toContain('上限');
    });

    it('count <= 10 のとき429を返さない（処理続行）', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        fetchCalls.push(url);

        // Upstash incr: カウント5（制限内）
        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 5 }) };
        }

        // GitHub API（日記ファイル取得）
        if (url.includes('api.github.com') && url.includes('contents/diaries')) {
          // YAML frontmatter付きMarkdownを返す
          const content = Buffer.from(
            '---\nimage_prompt: "A test image prompt"\n---\n# Test',
            'utf-8'
          ).toString('base64');
          return {
            ok: true,
            json: async () => ({ content, sha: 'abc123' }),
          };
        }

        // OpenAI DALL-E API
        if (url.includes('api.openai.com')) {
          return {
            ok: true,
            json: async () => ({
              data: [{ b64_json: Buffer.from('fake-png').toString('base64') }],
            }),
          };
        }

        // GitHub画像保存
        if (url.includes('api.github.com') && url.includes('contents/images')) {
          return { ok: true, json: async () => ({ content: {} }) };
        }

        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      // 200で正常完了し、OpenAI APIが呼ばれたことを確認
      expect(res._status).toBe(200);
      const openaiCalls = fetchCalls.filter(u => u.includes('api.openai.com'));
      expect(openaiCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =================================================================
  // テスト3: 期限切れ/不正imageTokenで401を返すこと
  // =================================================================
  describe('imageToken認証', () => {
    it('期限切れトークン（5分超過）で401を返す', async () => {
      // 6分前のタイムスタンプでトークン生成
      const expiredTs = Date.now() - 6 * 60 * 1000;
      const date = '2026-02-19';
      const payload = `${date}:${expiredTs}`;
      const hmac = crypto.createHmac('sha256', IMAGE_TOKEN_SECRET)
        .update(payload).digest('hex');
      const expiredToken = `${expiredTs}:${hmac}`;

      globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));

      const req = createMockReq({
        body: { date, imageToken: expiredToken },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(401);
      expect(res._json.error).toContain('有効期限');
    });

    it('不正なHMAC署名で401を返す', async () => {
      const date = '2026-02-19';
      const ts = Date.now();
      const fakeHmac = 'a'.repeat(64); // 偽のHMAC
      const invalidToken = `${ts}:${fakeHmac}`;

      globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));

      const req = createMockReq({
        body: { date, imageToken: invalidToken },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(401);
      expect(res._json.error).toContain('認証');
    });

    it('不正な形式のトークンで401を返す', async () => {
      globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));

      const req = createMockReq({
        body: { date: '2026-02-19', imageToken: 'invalid-token-format' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(401);
    });
  });
});
