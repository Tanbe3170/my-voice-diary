// tests/create-research.test.js
// リサーチ記事作成API のセキュリティ・機能テスト
//
// テストシナリオ:
// 1. CORS・HTTPメソッド検証
// 2. JWT認証（JWTのみ、AUTH_TOKENフォールバックなし）
// 3. 入力バリデーション（rawText, category, topic）
// 4. 環境変数チェック
// 5. Upstash Redis レート制限（fail-closed）
// 6. Claude API連携
// 7. LLM出力スキーマ検証
// 8. GitHub API保存
// 9. imageToken生成
// 10. slug検証

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { signJwt } from '../api/lib/jwt.js';

// テスト用JWT生成ヘルパー
const JWT_SECRET = 'test-jwt-secret-key-32bytes-long!';

function createValidJwt(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: 'diary-admin',
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
  return signJwt(payload, JWT_SECRET);
}

// モック用のreq/resファクトリ
function createMockReq(overrides = {}) {
  const { headers, body, ...rest } = overrides;
  return {
    method: 'POST',
    headers: {
      origin: 'https://my-voice-diary.vercel.app',
      'content-type': 'application/json',
      'x-auth-token': createValidJwt(),
      'x-forwarded-for': '192.168.1.1',
      ...headers,
    },
    body: {
      rawText: '恐竜の飛行進化について調べた。始祖鳥は最古の鳥類化石として有名。',
      ...body,
    },
    socket: { remoteAddress: '127.0.0.1' },
    ...rest,
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
  AUTH_TOKEN: 'legacy-auth-token',
  CLAUDE_API_KEY: 'sk-ant-test',
  GITHUB_TOKEN: 'ghp_test',
  GITHUB_OWNER: 'TestOwner',
  GITHUB_REPO: 'test-repo',
  UPSTASH_REDIS_REST_URL: 'https://test-redis.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'test-redis-token',
  IMAGE_TOKEN_SECRET: 'test-image-secret',
};

// Claude APIの成功レスポンスデータ
const CLAUDE_SUCCESS_DATA = {
  date: '2026-03-17',
  title: 'テストリサーチ記事',
  topic: 'テストトピック',
  category: 'tech',
  summary: 'テストサマリー1行目\nテストサマリー2行目\nテストサマリー3行目',
  key_points: ['ポイント1', 'ポイント2', 'ポイント3'],
  body: 'テスト本文の内容です。',
  sources: ['参考文献1'],
  tags: ['#テスト', '#リサーチ'],
  image_prompt: 'A test research image',
  slug: 'test-research',
};

/**
 * リサーチ作成の正常フロー用fetchモック
 */
function createFullFlowFetchMock(overrides = {}) {
  return vi.fn(async (url, options = {}) => {
    // Upstash incr（レート制限）
    if (url.includes('upstash') && url.includes('/incr/')) {
      return { ok: true, json: async () => ({ result: overrides.rateCount ?? 1 }) };
    }

    // Upstash expire
    if (url.includes('upstash') && url.includes('/expire/')) {
      if (overrides.expireFail) {
        return { ok: false, status: 500 };
      }
      return { ok: true, json: async () => ({ result: 1 }) };
    }

    // Upstash TTL確認
    if (url.includes('upstash') && url.includes('/ttl/')) {
      return { ok: true, json: async () => ({ result: overrides.ttlValue ?? 86400 }) };
    }

    // Claude API
    if (url.includes('api.anthropic.com')) {
      if (overrides.claudeError) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: { message: 'Internal error' } }),
        };
      }
      const responseData = overrides.claudeData ?? CLAUDE_SUCCESS_DATA;
      return {
        ok: true,
        json: async () => ({
          content: [{
            text: overrides.claudeRawText ?? JSON.stringify(responseData),
          }],
        }),
      };
    }

    // GitHub API GET（SHA取得）
    if (url.includes('api.github.com') && url.includes('contents/research') && (!options.method || options.method === 'GET')) {
      if (overrides.githubGetFound) {
        return {
          ok: true,
          json: async () => ({ sha: 'existing-sha-123' }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }

    // GitHub API PUT（ファイル保存）
    if (url.includes('api.github.com') && options.method === 'PUT') {
      if (overrides.githubPutError) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ message: 'Internal Server Error' }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          content: { html_url: 'https://github.com/TestOwner/test-repo/blob/main/research/2026/03/2026-03-17-test-research.md' },
        }),
      };
    }

    return { ok: true, json: async () => ({}) };
  });
}

describe('create-research API', () => {
  let handler;
  let originalFetch;

  beforeEach(async () => {
    process.env = { ...baseEnv };
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn();
    vi.resetModules();
    const mod = await import('../api/create-research.js');
    handler = mod.default;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // =================================================================
  // 1. CORS・HTTPメソッド検証
  // =================================================================
  describe('CORS・HTTPメソッド', () => {
    it('OPTIONS → 200 プリフライト正常応答', async () => {
      const req = createMockReq({
        method: 'OPTIONS',
        headers: { origin: 'https://my-voice-diary.vercel.app' },
      });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);
    });

    it('GET → 405 Method Not Allowed', async () => {
      const req = createMockReq({ method: 'GET' });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(405);
    });

    it('許可Origin → CORSヘッダー設定', async () => {
      globalThis.fetch = createFullFlowFetchMock();
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._headers['Access-Control-Allow-Origin']).toBe('https://my-voice-diary.vercel.app');
    });
  });

  // =================================================================
  // 2. JWT認証
  // =================================================================
  describe('JWT認証', () => {
    it('有効なJWT（sub=diary-admin）→ 処理続行', async () => {
      globalThis.fetch = createFullFlowFetchMock();
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);
    });

    it('不正なJWTトークン → 401', async () => {
      const req = createMockReq({
        headers: { 'x-auth-token': 'invalid-jwt-token' },
      });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(401);
    });

    it('期限切れJWT → 401', async () => {
      const expiredJwt = createValidJwt({ exp: Math.floor(Date.now() / 1000) - 3600 });
      const req = createMockReq({
        headers: { 'x-auth-token': expiredJwt },
      });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(401);
    });

    it('AUTH_TOKEN単独では401（フォールバック廃止済み）', async () => {
      globalThis.fetch = createFullFlowFetchMock();
      const req = createMockReq({
        headers: { 'x-auth-token': 'legacy-auth-token' },
      });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(401);
    });
  });

  // =================================================================
  // 3. 入力バリデーション
  // =================================================================
  describe('入力バリデーション', () => {
    it('rawText未指定で400', async () => {
      globalThis.fetch = createFullFlowFetchMock();
      const req = createMockReq({ body: { rawText: undefined } });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      expect(res._json.error).toContain('リサーチの内容');
    });

    it('rawTextが数値型で400', async () => {
      globalThis.fetch = createFullFlowFetchMock();
      const req = createMockReq({ body: { rawText: 12345 } });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      expect(res._json.error).toContain('不正な入力');
    });

    it('rawTextが10000文字超過で400', async () => {
      globalThis.fetch = createFullFlowFetchMock();
      const req = createMockReq({ body: { rawText: 'あ'.repeat(10001) } });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      expect(res._json.error).toContain('10000文字');
    });

    it('不正なcategoryで400', async () => {
      globalThis.fetch = createFullFlowFetchMock();
      const req = createMockReq({ body: { category: 'invalid-category' } });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      expect(res._json.error).toContain('カテゴリ');
    });

    it('有効なcategory（dinosaur）→ 処理続行', async () => {
      globalThis.fetch = createFullFlowFetchMock({ claudeData: { ...CLAUDE_SUCCESS_DATA, category: 'dinosaur' } });
      const req = createMockReq({ body: { category: 'dinosaur' } });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);
    });

    it('topic 50文字超過で400', async () => {
      globalThis.fetch = createFullFlowFetchMock();
      const req = createMockReq({ body: { topic: 'あ'.repeat(51) } });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      expect(res._json.error).toContain('トピック');
    });

    it('topic数値型で400', async () => {
      globalThis.fetch = createFullFlowFetchMock();
      const req = createMockReq({ body: { topic: 12345 } });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      expect(res._json.error).toContain('トピック');
    });
  });

  // =================================================================
  // 4. 環境変数チェック
  // =================================================================
  describe('環境変数チェック', () => {
    it('JWT_SECRET未設定で500', async () => {
      delete process.env.JWT_SECRET;
      globalThis.fetch = createFullFlowFetchMock();
      vi.resetModules();
      const mod = await import('../api/create-research.js');
      const req = createMockReq();
      const res = createMockRes();
      await mod.default(req, res);
      expect(res._status).toBe(500);
      expect(res._json.error).toContain('設定に問題');
    });

    it('CLAUDE_API_KEY未設定で500', async () => {
      delete process.env.CLAUDE_API_KEY;
      globalThis.fetch = createFullFlowFetchMock();
      vi.resetModules();
      const mod = await import('../api/create-research.js');
      const req = createMockReq();
      const res = createMockRes();
      await mod.default(req, res);
      expect(res._status).toBe(500);
      expect(res._json.error).toContain('設定に問題');
    });

    it('GITHUB_TOKEN未設定で500', async () => {
      delete process.env.GITHUB_TOKEN;
      globalThis.fetch = createFullFlowFetchMock();
      vi.resetModules();
      const mod = await import('../api/create-research.js');
      const req = createMockReq();
      const res = createMockRes();
      await mod.default(req, res);
      expect(res._status).toBe(500);
      expect(res._json.error).toContain('設定に問題');
    });
  });

  // =================================================================
  // 5. Upstash Redisレート制限
  // =================================================================
  describe('Upstash Redisレート制限', () => {
    it('正常カウント（1回目）→ 処理続行', async () => {
      globalThis.fetch = createFullFlowFetchMock({ rateCount: 1 });
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);
    });

    it('15回超過で429', async () => {
      globalThis.fetch = createFullFlowFetchMock({ rateCount: 16 });
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(429);
      expect(res._json.error).toContain('上限');
    });

    it('Upstash incr HTTPエラー時、500（fail-closed）', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: false, status: 503, json: async () => ({}) };
        }
        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
    });

    it('Upstash接続エラー時、500（fail-closed）', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        if (url.includes('upstash') && url.includes('incr')) {
          throw new Error('Network error');
        }
        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
    });

    it('初回EXPIRE失敗・TTL確認失敗で500（fail-closed）', async () => {
      let callIndex = 0;
      globalThis.fetch = vi.fn(async (url) => {
        if (url.includes('upstash') && url.includes('/incr/')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        if (url.includes('upstash') && url.includes('/expire/')) {
          return { ok: false, status: 500 };
        }
        if (url.includes('upstash') && url.includes('/ttl/')) {
          return { ok: false, status: 500 };
        }
        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
    });
  });

  // =================================================================
  // 6. Claude API連携
  // =================================================================
  describe('Claude API連携', () => {
    it('Claude API正常レスポンス → 200', async () => {
      globalThis.fetch = createFullFlowFetchMock();
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);
      expect(res._json.success).toBe(true);
      expect(res._json.title).toBe('テストリサーチ記事');
    });

    it('Claude APIエラー → 500', async () => {
      globalThis.fetch = createFullFlowFetchMock({ claudeError: true });
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
    });

    it('Claude APIレスポンスからJSON抽出失敗 → 500', async () => {
      globalThis.fetch = createFullFlowFetchMock({ claudeRawText: 'これはJSONではないテキストです。' });
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
    });

    it('Claude APIレスポンスのスキーマ検証失敗 → 500', async () => {
      const invalidData = { ...CLAUDE_SUCCESS_DATA, title: '' };
      globalThis.fetch = createFullFlowFetchMock({ claudeData: invalidData });
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
    });
  });

  // =================================================================
  // 7. LLM出力スキーマ検証
  // =================================================================
  describe('LLM出力スキーマ検証', () => {
    it('titleが空 → 500', async () => {
      globalThis.fetch = createFullFlowFetchMock({ claudeData: { ...CLAUDE_SUCCESS_DATA, title: '' } });
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
    });

    it('topicが欠落 → 500', async () => {
      const data = { ...CLAUDE_SUCCESS_DATA };
      delete data.topic;
      globalThis.fetch = createFullFlowFetchMock({ claudeData: data });
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
    });

    it('slugが不正形式（大文字含む）→ 500', async () => {
      globalThis.fetch = createFullFlowFetchMock({ claudeData: { ...CLAUDE_SUCCESS_DATA, slug: 'Invalid-Slug' } });
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
    });

    it('key_pointsが配列でない → 500', async () => {
      globalThis.fetch = createFullFlowFetchMock({ claudeData: { ...CLAUDE_SUCCESS_DATA, key_points: 'not-array' } });
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
    });

    it('tagsが10個超過 → 500', async () => {
      const manyTags = Array.from({ length: 11 }, (_, i) => `#tag${i}`);
      globalThis.fetch = createFullFlowFetchMock({ claudeData: { ...CLAUDE_SUCCESS_DATA, tags: manyTags } });
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
    });
  });

  // =================================================================
  // 8. GitHub API保存
  // =================================================================
  describe('GitHub API保存', () => {
    it('新規作成（404 → PUT）→ 200', async () => {
      globalThis.fetch = createFullFlowFetchMock();
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);
      expect(res._json.filePath).toMatch(/^research\/\d{4}\/\d{2}\//);
    });

    it('既存ファイル上書き（SHA取得 → PUT with sha）→ 200', async () => {
      const mockFetch = createFullFlowFetchMock({ githubGetFound: true });
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);

      // PUT呼び出し時にshaが含まれていることを確認
      const putCall = mockFetch.mock.calls.find(
        ([url, opts]) => url.includes('api.github.com') && opts?.method === 'PUT'
      );
      expect(putCall).toBeDefined();
      const putBody = JSON.parse(putCall[1].body);
      expect(putBody.sha).toBe('existing-sha-123');
    });

    it('GitHub PUT失敗 → 500', async () => {
      globalThis.fetch = createFullFlowFetchMock({ githubPutError: true });
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
    });
  });

  // =================================================================
  // 9. imageToken生成
  // =================================================================
  describe('imageToken生成', () => {
    it('IMAGE_TOKEN_SECRET設定時、imageTokenが返される', async () => {
      globalThis.fetch = createFullFlowFetchMock();
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);
      expect(res._json.imageToken).toBeDefined();
      expect(res._json.imageToken).toMatch(/^\d+:[a-f0-9]+$/);
    });

    it('IMAGE_TOKEN_SECRET未設定時、imageTokenがnull', async () => {
      delete process.env.IMAGE_TOKEN_SECRET;
      globalThis.fetch = createFullFlowFetchMock();
      vi.resetModules();
      const mod = await import('../api/create-research.js');
      const req = createMockReq();
      const res = createMockRes();
      await mod.default(req, res);
      expect(res._status).toBe(200);
      expect(res._json.imageToken).toBeNull();
    });
  });

  // =================================================================
  // 10. slug検証
  // =================================================================
  describe('slug検証', () => {
    it('有効なslug（ハイフン区切り英小文字）→ filePath含む', async () => {
      globalThis.fetch = createFullFlowFetchMock();
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);
      expect(res._json.slug).toBe('test-research');
      expect(res._json.filePath).toContain('test-research.md');
    });

    it('slugにアンダースコア → 500（スキーマ検証失敗）', async () => {
      globalThis.fetch = createFullFlowFetchMock({ claudeData: { ...CLAUDE_SUCCESS_DATA, slug: 'test_research' } });
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
    });
  });
});
