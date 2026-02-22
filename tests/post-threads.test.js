// tests/post-threads.test.js
// Phase 5.5 Threads投稿API のセキュリティ・機能テスト
//
// テストシナリオ:
// 1. CORS・HTTPメソッド検証
// 2. JWT認証（JWTのみ、AUTH_TOKENフォールバックなし）
// 3. 入力バリデーション（date, text 500文字）
// 4. 環境変数チェック
// 5. Upstash Redis レート制限（fail-closed）
// 6. 重複投稿防止（冪等性保証）
// 7. 日記・画像取得
// 8. Threads API連携（Container→Polling→Publish）

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { signJwt } from '../api/lib/jwt.js';

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
      date: '2026-02-19',
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

const baseEnv = {
  VERCEL_PROJECT_PRODUCTION_URL: 'my-voice-diary.vercel.app',
  VERCEL_URL: 'my-voice-diary-xxx.vercel.app',
  JWT_SECRET,
  THREADS_ACCESS_TOKEN: 'test-threads-token',
  THREADS_USER_ID: '12345678',
  GITHUB_TOKEN: 'ghp_test',
  GITHUB_OWNER: 'TestOwner',
  GITHUB_REPO: 'test-repo',
  UPSTASH_REDIS_REST_URL: 'https://test-redis.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'test-redis-token',
};

const DIARY_MARKDOWN = `---
title: "テスト日記"
date: 2026-02-19
tags: [#テスト, #日記, #AI]
image_prompt: "A beautiful sunset over mountains"
---

# テスト日記

## 2026-02-19

### サマリー

テスト用のサマリーです。
今日はテストを実施しました。

---

本文の内容

---

**Tags:** #テスト #日記 #AI`;

const DIARY_BASE64 = Buffer.from(DIARY_MARKDOWN, 'utf-8').toString('base64');

/**
 * Threads投稿の正常フロー用fetchモック
 */
function createFullFlowFetchMock(overrides = {}) {
  const lockDeleted = { value: false };

  const mockFn = vi.fn(async (url, options = {}) => {
    // Upstash incr（レート制限）
    if (url.includes('upstash') && url.includes('/incr/')) {
      return { ok: true, json: async () => ({ result: overrides.rateCount ?? 1 }) };
    }

    // Upstash expire
    if (url.includes('upstash') && url.includes('/expire/')) {
      return { ok: true, json: async () => ({ result: 1 }) };
    }

    // Upstash GET th_posted（既投稿チェック）
    if (url.includes('upstash') && url.includes('/get/')) {
      if (overrides.alreadyPosted) {
        return { ok: true, json: async () => ({ result: 'existing-post-id' }) };
      }
      return { ok: true, json: async () => ({ result: null }) };
    }

    // Upstash SET NX（ロック取得）
    if (url.includes('upstash') && url.includes('/set/') && url.includes('/NX')) {
      if (overrides.lockConflict) {
        return { ok: true, json: async () => ({ result: null }) };
      }
      return { ok: true, json: async () => ({ result: 'OK' }) };
    }

    // Upstash SET（投稿キャッシュ保存）
    if (url.includes('upstash') && url.includes('/set/') && !url.includes('/NX')) {
      return { ok: true, json: async () => ({ result: 'OK' }) };
    }

    // Upstash DEL（ロック解放）
    if (url.includes('upstash') && url.includes('/del/')) {
      lockDeleted.value = true;
      return { ok: true, json: async () => ({ result: 1 }) };
    }

    // GitHub API（日記ファイル取得）
    if (url.includes('api.github.com') && url.includes('contents/diaries')) {
      if (overrides.diaryNotFound) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      return {
        ok: true,
        json: async () => ({ content: DIARY_BASE64, sha: 'abc123' }),
      };
    }

    // 画像存在確認（HEAD）
    if (url.includes('raw.githubusercontent.com') && options?.method === 'HEAD') {
      if (overrides.imageNotFound) {
        return { ok: false, status: 404 };
      }
      return { ok: true, status: 200 };
    }

    // Threads Container Creation
    if (url.includes('graph.threads.net') && url.includes('/threads') && !url.includes('threads_publish') && !url.includes('fields=') && options?.method === 'POST') {
      if (overrides.containerError) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'Container error', code: overrides.containerErrorCode ?? 100 } }),
        };
      }
      return { ok: true, json: async () => ({ id: 'container-123' }) };
    }

    // Threads Status Polling
    if (url.includes('graph.threads.net') && url.includes('fields=')) {
      const status = overrides.containerStatus ?? 'FINISHED';
      return { ok: true, json: async () => ({ id: 'container-123', status, error_message: status === 'ERROR' ? 'Processing failed' : undefined }) };
    }

    // Threads Publish
    if (url.includes('graph.threads.net') && url.includes('threads_publish')) {
      if (overrides.publishError) {
        return { ok: false, status: 400, json: async () => ({ error: { message: 'Publish error' } }) };
      }
      return { ok: true, json: async () => ({ id: 'post-456' }) };
    }

    return { ok: true, json: async () => ({}) };
  });

  mockFn._lockDeleted = lockDeleted;
  return mockFn;
}

describe('post-threads API', () => {
  let handler;
  let originalFetch;

  beforeEach(async () => {
    Object.assign(process.env, baseEnv);
    originalFetch = globalThis.fetch;
    vi.resetModules();
    const mod = await import('../api/post-threads.js');
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

    it('非許可Origin → 403', async () => {
      const req = createMockReq({
        headers: { origin: 'https://evil-site.com', 'content-type': 'application/json' },
      });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(403);
    });
  });

  // =================================================================
  // 2. 認証テスト
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

    it('AUTH_TOKEN単体 → 401（フォールバックなし）', async () => {
      process.env.AUTH_TOKEN = 'legacy-auth-token';
      const req = createMockReq({
        headers: { 'x-auth-token': 'legacy-auth-token' },
      });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(401);
      delete process.env.AUTH_TOKEN;
    });

    it('x-auth-tokenヘッダ未設定 → 401', async () => {
      const req = createMockReq({
        headers: { 'x-auth-token': undefined },
      });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(401);
    });

    it('x-auth-tokenヘッダ未設定 + AUTH_TOKEN環境変数のみ → 401', async () => {
      // ヘッダなし（AUTH_TOKEN環境変数のみ）でも拒否
      process.env.AUTH_TOKEN = 'legacy-auth-token';
      const req = createMockReq({
        headers: { 'x-auth-token': undefined },
      });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(401);
      delete process.env.AUTH_TOKEN;
    });
  });

  // =================================================================
  // 3. 入力バリデーション
  // =================================================================
  describe('入力バリデーション', () => {
    it('date未指定で400', async () => {
      const req = createMockReq({ body: { date: undefined } });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      expect(res._json.error).toContain('パラメータ');
    });

    it('date不正形式（YYYYMMDD）で400', async () => {
      const req = createMockReq({ body: { date: '20260219' } });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      expect(res._json.error).toContain('日付');
    });

    it('date意味的不正（2026-99-99）で400', async () => {
      const req = createMockReq({ body: { date: '2026-99-99' } });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(400);
    });

    it('text 500文字超で400', async () => {
      const req = createMockReq({
        body: { date: '2026-02-19', text: 'あ'.repeat(501) },
      });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      expect(res._json.error).toContain('500');
    });
  });

  // =================================================================
  // 4. 環境変数チェック
  // =================================================================
  describe('環境変数チェック', () => {
    it('THREADS_ACCESS_TOKEN未設定で500', async () => {
      delete process.env.THREADS_ACCESS_TOKEN;
      vi.resetModules();
      const mod = await import('../api/post-threads.js');
      const req = createMockReq();
      const res = createMockRes();
      await mod.default(req, res);
      expect(res._status).toBe(500);
    });

    it('THREADS_USER_ID未設定で500', async () => {
      delete process.env.THREADS_USER_ID;
      vi.resetModules();
      const mod = await import('../api/post-threads.js');
      const req = createMockReq();
      const res = createMockRes();
      await mod.default(req, res);
      expect(res._status).toBe(500);
    });
  });

  // =================================================================
  // 5. レート制限（fail-closed）
  // =================================================================
  describe('Upstash障害時のfail-closed', () => {
    it('Upstash incr HTTPエラー時、500を返しThreads APIを呼び出さない', async () => {
      let threadsCalled = false;
      globalThis.fetch = vi.fn(async (url) => {
        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: false, status: 503, json: async () => ({}) };
        }
        if (url.includes('graph.threads.net')) {
          threadsCalled = true;
          return { ok: true, json: async () => ({}) };
        }
        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
      expect(threadsCalled).toBe(false);
    });

    it('Upstash incr不正レスポンス（result=0）時、500を返す', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 0 }) };
        }
        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
    });

    it('Upstash接続エラー（fetch例外）時、500を返す', async () => {
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

    it('3回超過で429を返す', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 4 }) };
        }
        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(429);
      expect(res._json.error).toContain('上限');
    });
  });

  // =================================================================
  // 6. 重複投稿防止（冪等性保証）
  // =================================================================
  describe('重複投稿防止', () => {
    it('既投稿済み（th_posted存在）→ 200 + 既存postId', async () => {
      globalThis.fetch = createFullFlowFetchMock({ alreadyPosted: true });
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);
      expect(res._json.alreadyPosted).toBe(true);
      expect(res._json.postId).toBe('existing-post-id');
    });

    it('ロック競合（th_lock存在）→ 409 Conflict', async () => {
      globalThis.fetch = createFullFlowFetchMock({ lockConflict: true });
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(409);
      expect(res._json.error).toContain('実行中');
    });

    it('投稿成功後にロックが解放されること', async () => {
      const mockFetch = createFullFlowFetchMock();
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);
      expect(mockFetch._lockDeleted.value).toBe(true);
    });

    it('投稿失敗後にもロックが解放されること', async () => {
      const mockFetch = createFullFlowFetchMock({ publishError: true });
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
      expect(mockFetch._lockDeleted.value).toBe(true);
    });

    it('th_posted GET HTTPエラー時に500（fail-closed）', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn(async (url) => {
        if (url.includes('upstash') && url.includes('/incr/')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        if (url.includes('upstash') && url.includes('/expire/')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        if (url.includes('upstash') && url.includes('/get/')) {
          return { ok: false, status: 500, json: async () => ({}) };
        }
        callCount++;
        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
      expect(callCount).toBe(0);
    });

    it('ロック取得SETNX HTTPエラー時に500（fail-closed）', async () => {
      let thApiCalled = false;
      globalThis.fetch = vi.fn(async (url) => {
        if (url.includes('upstash') && url.includes('/incr/')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        if (url.includes('upstash') && url.includes('/expire/')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        if (url.includes('upstash') && url.includes('/get/')) {
          return { ok: true, json: async () => ({ result: null }) };
        }
        if (url.includes('upstash') && url.includes('/set/') && url.includes('/NX')) {
          return { ok: false, status: 503, json: async () => ({}) };
        }
        if (url.includes('graph.threads.net')) {
          thApiCalled = true;
        }
        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
      expect(thApiCalled).toBe(false);
    });
  });

  // =================================================================
  // 7. 日記・画像取得
  // =================================================================
  describe('日記・画像取得', () => {
    it('日記Markdown未存在で404', async () => {
      const mockFetch = createFullFlowFetchMock({ diaryNotFound: true });
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(404);
      expect(res._json.error).toContain('日記');
      expect(mockFetch._lockDeleted.value).toBe(true);
    });

    it('画像未存在で404', async () => {
      const mockFetch = createFullFlowFetchMock({ imageNotFound: true });
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(404);
      expect(res._json.error).toContain('画像');
      expect(mockFetch._lockDeleted.value).toBe(true);
    });
  });

  // =================================================================
  // 8. Threads API連携
  // =================================================================
  describe('Threads API連携', () => {
    it('Container→FINISHED→Publish成功で200', async () => {
      globalThis.fetch = createFullFlowFetchMock();
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);
      expect(res._json.success).toBe(true);
      expect(res._json.postId).toBe('post-456');
    });

    it('Container ERRORステータスで500 + ロック解放', async () => {
      const mockFetch = createFullFlowFetchMock({ containerStatus: 'ERROR' });
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
      expect(mockFetch._lockDeleted.value).toBe(true);
    });

    it('Container EXPIREDステータスで500 + ロック解放', async () => {
      const mockFetch = createFullFlowFetchMock({ containerStatus: 'EXPIRED' });
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
      expect(mockFetch._lockDeleted.value).toBe(true);
    });

    it('Container PUBLISHEDステータス → 成功扱い', async () => {
      const mockFetch = createFullFlowFetchMock({ containerStatus: 'PUBLISHED' });
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);
      expect(res._json.success).toBe(true);
    });

    it('Container作成エラーで500 + ロック解放', async () => {
      const mockFetch = createFullFlowFetchMock({ containerError: true });
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
      expect(mockFetch._lockDeleted.value).toBe(true);
    });

    it('Threadsトークン期限切れ（code=190）で401 + ロック解放', async () => {
      const mockFetch = createFullFlowFetchMock({
        containerError: true,
        containerErrorCode: 190,
      });
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(401);
      expect(res._json.error).toContain('トークン');
      expect(mockFetch._lockDeleted.value).toBe(true);
    });

    it('Publish失敗で500 + ロック解放', async () => {
      const mockFetch = createFullFlowFetchMock({ publishError: true });
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
      expect(mockFetch._lockDeleted.value).toBe(true);
    });

    it('テキスト自動生成が行われること', async () => {
      const mockFetch = createFullFlowFetchMock();
      globalThis.fetch = mockFetch;
      const req = createMockReq({ body: { date: '2026-02-19' } });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);

      const containerCall = mockFetch.mock.calls.find(
        ([url, opts]) => url.includes('/threads') && !url.includes('threads_publish') && !url.includes('fields=') && opts?.method === 'POST'
      );
      expect(containerCall).toBeDefined();
      const bodyStr = containerCall[1].body;
      expect(bodyStr).toContain('text=');
      expect(decodeURIComponent(bodyStr)).toContain('テスト日記');
    });

    it('ポーリングURLにstatusフィールドが含まれること（status_codeではない）', async () => {
      const mockFetch = createFullFlowFetchMock();
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);

      const pollingCalls = mockFetch.mock.calls.filter(
        ([url]) => url.includes('graph.threads.net') && url.includes('fields=')
      );
      expect(pollingCalls.length).toBeGreaterThan(0);

      for (const [url] of pollingCalls) {
        expect(url).toContain('fields=id,status,error_message');
        expect(url).not.toContain('status_code');
      }
    });

    it('ポーリングURLにaccess_tokenが含まれないこと（Authorizationヘッダー使用）', async () => {
      const mockFetch = createFullFlowFetchMock();
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);

      // StatusポーリングのGET呼び出しを検索
      const pollingCalls = mockFetch.mock.calls.filter(
        ([url]) => url.includes('graph.threads.net') && url.includes('fields=')
      );
      expect(pollingCalls.length).toBeGreaterThan(0);

      // URLにaccess_tokenが含まれていないことを確認
      for (const [url, opts] of pollingCalls) {
        expect(url).not.toContain('access_token=');
        // Authorizationヘッダーが設定されていることを確認
        expect(opts?.headers?.Authorization).toContain('Bearer');
      }
    });

    it('Container/Publish呼び出しのbodyにaccess_tokenが含まれないこと', async () => {
      const mockFetch = createFullFlowFetchMock();
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);

      const containerCall = mockFetch.mock.calls.find(
        ([url, opts]) => url.includes('/threads') && !url.includes('threads_publish') && !url.includes('fields=') && opts?.method === 'POST'
      );
      expect(containerCall).toBeDefined();
      expect(containerCall[1].body).not.toContain('access_token=');
      expect(containerCall[1].headers.Authorization).toContain('Bearer');

      const publishCall = mockFetch.mock.calls.find(
        ([url, opts]) => url.includes('threads_publish') && opts?.method === 'POST'
      );
      expect(publishCall).toBeDefined();
      expect(publishCall[1].body).not.toContain('access_token=');
      expect(publishCall[1].headers.Authorization).toContain('Bearer');
    });

    it('Pollingタイムアウト（IN_PROGRESS継続）で504 + ロック解放', async () => {
      const mockFetch = createFullFlowFetchMock({ containerStatus: 'IN_PROGRESS' });
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(504);
      expect(res._json.error).toContain('タイムアウト');
      expect(mockFetch._lockDeleted.value).toBe(true);
    }, 30000);

    it('デッドライン近傍でポーリング待機が即504になること（near-deadline）', async () => {
      // Container作成成功後、ポーリングループ内でDate.nowを操作して
      // getRemainingTimeout(5000)がnullを返す状態をシミュレーション
      const originalDateNow = Date.now;
      let timeShift = 0;

      const mockFetch = createFullFlowFetchMock({ containerStatus: 'IN_PROGRESS' });
      const wrappedFetch = vi.fn(async (url, opts) => {
        // Container作成のPOSTが完了した直後、ポーリングに入る前に時間を進める
        // Container作成 = threads_user_id へのPOST（statusポーリングではない）
        if (typeof url === 'string' && url.includes('/threads') &&
            opts?.method === 'POST' && !url.includes('threads_publish')) {
          const result = await mockFetch(url, opts);
          // Container作成成功後にDate.nowを24秒進める
          timeShift = 24000;
          return result;
        }
        return mockFetch(url, opts);
      });
      // ロック解放追跡を引き継ぐ
      wrappedFetch._lockDeleted = mockFetch._lockDeleted;

      Date.now = () => originalDateNow() + timeShift;
      globalThis.fetch = wrappedFetch;
      const req = createMockReq();
      const res = createMockRes();

      try {
        await handler(req, res);
        expect(res._status).toBe(504);
        expect(res._json.error).toContain('タイムアウト');
        expect(wrappedFetch._lockDeleted.value).toBe(true);
        // ポーリングのfetch（statusチェック）が呼ばれていないことを確認
        const statusCalls = wrappedFetch.mock.calls.filter(
          ([u]) => typeof u === 'string' && u.includes('fields=id,status')
        );
        expect(statusCalls.length).toBe(0);
      } finally {
        Date.now = originalDateNow;
      }
    });

    it('th_posted キャッシュがTTLなし（無期限）で保存されること', async () => {
      const mockFetch = createFullFlowFetchMock();
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);

      const setCalls = mockFetch.mock.calls.filter(
        ([url]) => url.includes('upstash') && url.includes('/set/') &&
                   url.includes('th_posted') && !url.includes('/NX')
      );
      expect(setCalls.length).toBe(1);
      const setUrl = setCalls[0][0];
      expect(setUrl).not.toContain('/EX/');
    });

    it('Container作成時にmedia_type=IMAGEが含まれること', async () => {
      const mockFetch = createFullFlowFetchMock();
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);

      const containerCall = mockFetch.mock.calls.find(
        ([url, opts]) => url.includes('/threads') && !url.includes('threads_publish') && !url.includes('fields=') && opts?.method === 'POST'
      );
      expect(containerCall[1].body).toContain('media_type=IMAGE');
    });
  });
});
