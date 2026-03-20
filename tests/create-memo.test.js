// tests/create-memo.test.js
// アイデアメモキャプチャAPI のセキュリティ・機能テスト
//
// テストシナリオ:
// 1. CORS・HTTPメソッド検証
// 2. JWT認証（JWTのみ、AUTH_TOKENフォールバックなし）
// 3. 入力バリデーション（text, tag）
// 4. 環境変数チェック
// 5. Upstash Redis レート制限（fail-closed）
// 6. GitHub API連携（新規作成・追記）
// 7. レスポンス検証

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { signJwt } from '../lib/jwt.js';

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
      text: 'テストメモです',
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
  GITHUB_TOKEN: 'ghp_test',
  GITHUB_OWNER: 'TestOwner',
  GITHUB_REPO: 'test-repo',
  UPSTASH_REDIS_REST_URL: 'https://test-redis.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'test-redis-token',
};

// 既存Inboxファイルのコンテンツ（Base64エンコード前）
const EXISTING_INBOX = `---
date: "2026-03-17"
type: inbox
---

# Inbox - 2026-03-17

## キャプチャ

- **10:00** | 既存メモ
`;

const EXISTING_INBOX_BASE64 = Buffer.from(EXISTING_INBOX, 'utf-8').toString('base64');

/**
 * メモ保存の正常フロー用fetchモック
 */
function createFullFlowFetchMock(overrides = {}) {
  const mockFn = vi.fn(async (url, options = {}) => {
    // Upstash incr（レート制限）
    if (url.includes('upstash') && url.includes('/incr/')) {
      return { ok: true, json: async () => ({ result: overrides.rateCount ?? 1 }) };
    }

    // Upstash expire
    if (url.includes('upstash') && url.includes('/expire/')) {
      return { ok: true, json: async () => ({ result: 1 }) };
    }

    // GitHub GET（既存ファイル取得）
    if (url.includes('api.github.com') && url.includes('contents/') && (!options.method || options.method === 'GET')) {
      if (overrides.fileExists) {
        return {
          ok: true,
          json: async () => ({
            sha: 'existing-sha-123',
            content: overrides.existingContent ?? EXISTING_INBOX_BASE64
          })
        };
      }
      // 新規（ファイルなし）
      return { ok: false, status: 404 };
    }

    // GitHub PUT（ファイル作成/更新）
    if (url.includes('api.github.com') && url.includes('contents/') && options.method === 'PUT') {
      if (overrides.putError) {
        return { ok: false, status: 500, json: async () => ({ message: 'Internal Server Error' }) };
      }
      return {
        ok: true,
        json: async () => ({
          content: {
            html_url: `https://github.com/TestOwner/test-repo/blob/main/.company/secretary/inbox/2026-03-17.md`
          }
        })
      };
    }

    return { ok: true, json: async () => ({}) };
  });

  return mockFn;
}

describe('create-memo API', () => {
  let handler;
  let originalFetch;

  beforeEach(async () => {
    process.env = { ...baseEnv };
    originalFetch = globalThis.fetch;
    vi.resetModules();
    const mod = await import('../api/create-memo.js');
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

    it('POST受理（正常フロー）', async () => {
      globalThis.fetch = createFullFlowFetchMock();
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);
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

    it('sub不一致（sub=other）→ 401', async () => {
      const badJwt = createValidJwt({ sub: 'other-user' });
      const req = createMockReq({
        headers: { 'x-auth-token': badJwt },
      });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(401);
    });

    it('JWT_SECRET未設定で500', async () => {
      delete process.env.JWT_SECRET;
      vi.resetModules();
      const mod = await import('../api/create-memo.js');
      const req = createMockReq();
      const res = createMockRes();
      await mod.default(req, res);
      expect(res._status).toBe(500);
      expect(res._json.error).toContain('サーバー設定エラー');
    });
  });

  // =================================================================
  // 3. 入力バリデーション
  // =================================================================
  describe('入力バリデーション', () => {
    it('text未指定で400', async () => {
      const req = createMockReq({ body: { text: undefined } });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      expect(res._json.error).toContain('テキスト');
    });

    it('text非string型で400', async () => {
      const req = createMockReq({ body: { text: 12345 } });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      expect(res._json.error).toContain('テキスト');
    });

    it('text 5001文字で400', async () => {
      const req = createMockReq({ body: { text: 'あ'.repeat(5001) } });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      expect(res._json.error).toContain('5000');
    });

    it('tag 51文字で400', async () => {
      const req = createMockReq({ body: { text: 'テスト', tag: 'a'.repeat(51) } });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      expect(res._json.error).toContain('タグ');
    });

    it('Content-Type非JSONで400', async () => {
      const req = createMockReq({
        headers: { 'content-type': 'text/plain' },
      });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      expect(res._json.error).toContain('リクエスト形式');
    });
  });

  // =================================================================
  // 4. 環境変数チェック
  // =================================================================
  describe('環境変数チェック', () => {
    it('GITHUB_TOKEN未設定で500', async () => {
      delete process.env.GITHUB_TOKEN;
      vi.resetModules();
      const mod = await import('../api/create-memo.js');
      globalThis.fetch = createFullFlowFetchMock();
      const req = createMockReq();
      const res = createMockRes();
      await mod.default(req, res);
      expect(res._status).toBe(500);
      expect(res._json.error).toContain('設定');
    });

    it('UPSTASH未設定で500', async () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      vi.resetModules();
      const mod = await import('../api/create-memo.js');
      globalThis.fetch = createFullFlowFetchMock();
      const req = createMockReq();
      const res = createMockRes();
      await mod.default(req, res);
      expect(res._status).toBe(500);
      expect(res._json.error).toContain('設定');
    });
  });

  // =================================================================
  // 5. レート制限（fail-closed）
  // =================================================================
  describe('レート制限', () => {
    it('50回以内は通過', async () => {
      globalThis.fetch = createFullFlowFetchMock({ rateCount: 50 });
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);
    });

    it('51回目で429', async () => {
      globalThis.fetch = createFullFlowFetchMock({ rateCount: 51 });
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(429);
      expect(res._json.error).toContain('上限');
    });

    it('Redis障害時500（fail-closed）', async () => {
      let githubCalled = false;
      globalThis.fetch = vi.fn(async (url) => {
        if (url.includes('upstash') && url.includes('/incr/')) {
          return { ok: false, status: 503, json: async () => ({}) };
        }
        if (url.includes('api.github.com')) {
          githubCalled = true;
          return { ok: true, json: async () => ({}) };
        }
        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
      expect(githubCalled).toBe(false);
    });

    it('TTL設定（rateCount=1でexpireが呼ばれる）', async () => {
      const mockFetch = createFullFlowFetchMock({ rateCount: 1 });
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);

      // expire呼び出しの確認
      const expireCalls = mockFetch.mock.calls.filter(
        ([url]) => url.includes('upstash') && url.includes('/expire/')
      );
      expect(expireCalls.length).toBe(1);
      expect(expireCalls[0][0]).toContain('/86400');
    });
  });

  // =================================================================
  // 6. GitHub API連携
  // =================================================================
  describe('GitHub API連携', () => {
    it('新規ファイル作成成功（GETで404 → PUTで新規）', async () => {
      const mockFetch = createFullFlowFetchMock({ fileExists: false });
      globalThis.fetch = mockFetch;
      const req = createMockReq({ body: { text: '新規メモです' } });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);

      // PUTが呼ばれたことを確認
      const putCalls = mockFetch.mock.calls.filter(
        ([url, opts]) => url.includes('api.github.com') && opts?.method === 'PUT'
      );
      expect(putCalls.length).toBe(1);

      // PUTボディにshaが含まれないこと（新規作成）
      const putBody = JSON.parse(putCalls[0][1].body);
      expect(putBody.sha).toBeUndefined();

      // コンテンツのデコードとテンプレート形式検証
      const content = Buffer.from(putBody.content, 'base64').toString('utf-8');
      expect(content).toContain('type: inbox');
      expect(content).toContain('# Inbox -');
      expect(content).toContain('## キャプチャ');
      expect(content).toContain('新規メモです');
    });

    it('既存ファイルへの追記成功（GETでBase64コンテンツ返却 → PUTで更新）', async () => {
      const mockFetch = createFullFlowFetchMock({ fileExists: true });
      globalThis.fetch = mockFetch;
      const req = createMockReq({ body: { text: '追記メモです' } });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);

      // PUTが呼ばれたことを確認
      const putCalls = mockFetch.mock.calls.filter(
        ([url, opts]) => url.includes('api.github.com') && opts?.method === 'PUT'
      );
      expect(putCalls.length).toBe(1);

      // PUTボディにshaが含まれること（更新）
      const putBody = JSON.parse(putCalls[0][1].body);
      expect(putBody.sha).toBe('existing-sha-123');

      // コンテンツに既存メモと追記メモの両方があること
      const content = Buffer.from(putBody.content, 'base64').toString('utf-8');
      expect(content).toContain('既存メモ');
      expect(content).toContain('追記メモです');
    });

    it('テンプレート形式の検証（frontmatter、タイムスタンプ）', async () => {
      const mockFetch = createFullFlowFetchMock({ fileExists: false });
      globalThis.fetch = mockFetch;
      const req = createMockReq({ body: { text: 'テスト内容' } });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);

      const putCalls = mockFetch.mock.calls.filter(
        ([url, opts]) => url.includes('api.github.com') && opts?.method === 'PUT'
      );
      const putBody = JSON.parse(putCalls[0][1].body);
      const content = Buffer.from(putBody.content, 'base64').toString('utf-8');

      // frontmatter検証
      expect(content).toMatch(/^---\ndate: "\d{4}-\d{2}-\d{2}"\ntype: inbox\n---/);
      // タイムスタンプ形式検証（HH:MM）
      expect(content).toMatch(/\*\*\d{2}:\d{2}\*\*/);
    });

    it('tag付きメモの保存', async () => {
      const mockFetch = createFullFlowFetchMock({ fileExists: false });
      globalThis.fetch = mockFetch;
      const req = createMockReq({ body: { text: 'タグ付きメモ', tag: 'アイデア' } });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);

      const putCalls = mockFetch.mock.calls.filter(
        ([url, opts]) => url.includes('api.github.com') && opts?.method === 'PUT'
      );
      const putBody = JSON.parse(putCalls[0][1].body);
      const content = Buffer.from(putBody.content, 'base64').toString('utf-8');

      // [タグ名] 形式の検証
      expect(content).toContain('[アイデア] タグ付きメモ');
    });

    it('GitHub API障害時500', async () => {
      globalThis.fetch = vi.fn(async (url, options = {}) => {
        // Upstash系はすべて正常
        if (url.includes('upstash') && url.includes('/incr/')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        if (url.includes('upstash') && url.includes('/expire/')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        // GitHub GET障害
        if (url.includes('api.github.com')) {
          return { ok: false, status: 500, json: async () => ({ message: 'Internal Server Error' }) };
        }
        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
    });

    it('日付パス検証（GitHub APIのURLにJST日付が含まれる）', async () => {
      const mockFetch = createFullFlowFetchMock({ fileExists: false });
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);

      // GitHub APIのURLに .company/secretary/inbox/ パスが含まれること
      const githubCalls = mockFetch.mock.calls.filter(
        ([url]) => url.includes('api.github.com')
      );
      expect(githubCalls.length).toBeGreaterThanOrEqual(1);
      expect(githubCalls[0][0]).toContain('.company/secretary/inbox/');
      // YYYY-MM-DD形式の日付が含まれること
      expect(githubCalls[0][0]).toMatch(/\d{4}-\d{2}-\d{2}\.md/);
    });
  });

  // =================================================================
  // 7. レスポンス検証
  // =================================================================
  describe('レスポンス検証', () => {
    it('成功レスポンス形式', async () => {
      globalThis.fetch = createFullFlowFetchMock();
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);
      expect(res._json.success).toBe(true);
      expect(res._json).toHaveProperty('filePath');
      expect(res._json).toHaveProperty('timestamp');
      expect(res._json).toHaveProperty('githubUrl');
    });

    it('filePath/timestamp/githubUrl値', async () => {
      globalThis.fetch = createFullFlowFetchMock();
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);

      // filePath: .company/secretary/inbox/YYYY-MM-DD.md 形式
      expect(res._json.filePath).toMatch(/^\.company\/secretary\/inbox\/\d{4}-\d{2}-\d{2}\.md$/);
      // timestamp: HH:MM 形式
      expect(res._json.timestamp).toMatch(/^\d{2}:\d{2}$/);
      // githubUrl: GitHubのURL形式
      expect(res._json.githubUrl).toContain('github.com');
    });
  });
});
