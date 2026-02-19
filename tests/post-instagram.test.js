// tests/post-instagram.test.js
// Phase 5 Instagram投稿API のセキュリティ・機能テスト
//
// テストシナリオ:
// 1. CORS・HTTPメソッド検証
// 2. JWT認証（JWTのみ、AUTH_TOKENフォールバックなし）
// 3. 入力バリデーション（date, caption）
// 4. 環境変数チェック
// 5. Upstash Redis レート制限（fail-closed）
// 6. 重複投稿防止（冪等性保証）
// 7. 日記・画像取得
// 8. Instagram API連携（Container→Polling→Publish）

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

// 全テストで共通の環境変数
const baseEnv = {
  VERCEL_PROJECT_PRODUCTION_URL: 'my-voice-diary.vercel.app',
  VERCEL_URL: 'my-voice-diary-xxx.vercel.app',
  JWT_SECRET,
  INSTAGRAM_ACCESS_TOKEN: 'test-ig-token',
  INSTAGRAM_BUSINESS_ACCOUNT_ID: '12345678',
  GITHUB_TOKEN: 'ghp_test',
  GITHUB_OWNER: 'TestOwner',
  GITHUB_REPO: 'test-repo',
  UPSTASH_REDIS_REST_URL: 'https://test-redis.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'test-redis-token',
};

// 日記Markdownコンテンツ（Base64エンコード前）
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
 * Instagram投稿の正常フロー用fetchモック
 * レート制限 → 既投稿チェック → ロック取得 → GitHub日記取得 → 画像HEAD → Container → Polling → Publish → キャッシュ → ロック解放
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

    // Upstash GET ig_posted（既投稿チェック）
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

    // Instagram Container Creation
    if (url.includes('graph.facebook.com') && url.includes('/media') && !url.includes('media_publish') && !url.includes('status_code') && options?.method === 'POST') {
      if (overrides.containerError) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'Container error', code: overrides.containerErrorCode ?? 100 } }),
        };
      }
      return { ok: true, json: async () => ({ id: 'container-123' }) };
    }

    // Instagram Status Polling
    if (url.includes('graph.facebook.com') && url.includes('status_code')) {
      const statusCode = overrides.containerStatus ?? 'FINISHED';
      return { ok: true, json: async () => ({ status_code: statusCode }) };
    }

    // Instagram Media Publish
    if (url.includes('graph.facebook.com') && url.includes('media_publish')) {
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

describe('post-instagram API', () => {
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
    const mod = await import('../api/post-instagram.js');
    handler = mod.default;
  });

  afterEach(() => {
    // グローバルfetchを復元
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
      // AUTH_TOKENを設定しても、JWTでないトークンは拒否
      process.env.AUTH_TOKEN = 'legacy-auth-token';
      const req = createMockReq({
        headers: { 'x-auth-token': 'legacy-auth-token' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(401);
      delete process.env.AUTH_TOKEN;
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

    it('caption 2200文字超で400', async () => {
      const req = createMockReq({
        body: { date: '2026-02-19', caption: 'あ'.repeat(2201) },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
      expect(res._json.error).toContain('2200');
    });

    it('caption 2200文字以内は正常処理', async () => {
      globalThis.fetch = createFullFlowFetchMock();
      const req = createMockReq({
        body: { date: '2026-02-19', caption: 'テスト投稿' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
    });
  });

  // =================================================================
  // 4. 環境変数チェック
  // =================================================================
  describe('環境変数チェック', () => {
    it('INSTAGRAM_ACCESS_TOKEN未設定で500', async () => {
      delete process.env.INSTAGRAM_ACCESS_TOKEN;
      // モジュール再読み込み
      vi.resetModules();
      const mod = await import('../api/post-instagram.js');

      const req = createMockReq();
      const res = createMockRes();
      await mod.default(req, res);

      expect(res._status).toBe(500);
    });

    it('INSTAGRAM_BUSINESS_ACCOUNT_ID未設定で500', async () => {
      delete process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
      vi.resetModules();
      const mod = await import('../api/post-instagram.js');

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
    it('Upstash incr HTTPエラー時、500を返しInstagram APIを呼び出さない', async () => {
      let instagramCalled = false;

      globalThis.fetch = vi.fn(async (url) => {
        fetchCalls.push(url);

        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: false, status: 503, json: async () => ({}) };
        }

        if (url.includes('graph.facebook.com')) {
          instagramCalled = true;
          return { ok: true, json: async () => ({}) };
        }

        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(500);
      expect(instagramCalled).toBe(false);
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

    it('5回超過で429を返す', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 6 }) };
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
    it('既投稿済み（ig_posted存在）→ 200 + 既存postId', async () => {
      globalThis.fetch = createFullFlowFetchMock({ alreadyPosted: true });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._json.alreadyPosted).toBe(true);
      expect(res._json.postId).toBe('existing-post-id');
    });

    it('ロック競合（ig_lock存在）→ 409 Conflict', async () => {
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

    it('ig_posted GET HTTPエラー時に500（fail-closed）', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn(async (url) => {
        // レート制限通過
        if (url.includes('upstash') && url.includes('/incr/')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        if (url.includes('upstash') && url.includes('/expire/')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        // ig_posted GET → HTTPエラー
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
      // Instagram APIは呼ばれないこと
      expect(callCount).toBe(0);
    });

    it('ロック取得SETNX HTTPエラー時に500（fail-closed）', async () => {
      let igApiCalled = false;
      globalThis.fetch = vi.fn(async (url) => {
        // レート制限通過
        if (url.includes('upstash') && url.includes('/incr/')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        if (url.includes('upstash') && url.includes('/expire/')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        // ig_posted GET → 未投稿
        if (url.includes('upstash') && url.includes('/get/')) {
          return { ok: true, json: async () => ({ result: null }) };
        }
        // SETNX → HTTPエラー
        if (url.includes('upstash') && url.includes('/set/') && url.includes('/NX')) {
          return { ok: false, status: 503, json: async () => ({}) };
        }
        if (url.includes('graph.facebook.com')) {
          igApiCalled = true;
        }
        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(500);
      expect(igApiCalled).toBe(false);
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
      // ロック解放確認
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
  // 8. Instagram API連携
  // =================================================================
  describe('Instagram API連携', () => {
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

    it('Container作成エラーで500 + ロック解放', async () => {
      const mockFetch = createFullFlowFetchMock({ containerError: true });
      globalThis.fetch = mockFetch;

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(500);
      expect(mockFetch._lockDeleted.value).toBe(true);
    });

    it('Instagramトークン期限切れ（code=190）で401 + ロック解放', async () => {
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

    it('正常フローでキャプション自動生成が行われること', async () => {
      const mockFetch = createFullFlowFetchMock();
      globalThis.fetch = mockFetch;

      // captionを指定しない → 自動生成
      const req = createMockReq({ body: { date: '2026-02-19' } });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);

      // Container作成時のfetch呼び出しでcaptionが含まれているか確認
      const containerCall = mockFetch.mock.calls.find(
        ([url, opts]) => url.includes('/media') && !url.includes('media_publish') && !url.includes('status_code') && opts?.method === 'POST'
      );
      expect(containerCall).toBeDefined();
      // bodyにcaptionパラメータが含まれることを確認
      const bodyStr = containerCall[1].body;
      expect(bodyStr).toContain('caption=');
      // タイトルが含まれていること
      expect(decodeURIComponent(bodyStr)).toContain('テスト日記');
    });

    it('StatusポーリングURLにaccess_tokenが含まれないこと（Authorizationヘッダー使用）', async () => {
      const mockFetch = createFullFlowFetchMock();
      globalThis.fetch = mockFetch;

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);

      // StatusポーリングのGET呼び出しを検索
      const pollingCalls = mockFetch.mock.calls.filter(
        ([url]) => url.includes('graph.facebook.com') && url.includes('status_code')
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

      // Container Creation POST呼び出し
      const containerCall = mockFetch.mock.calls.find(
        ([url, opts]) => url.includes('/media') && !url.includes('media_publish') && !url.includes('status_code') && opts?.method === 'POST'
      );
      expect(containerCall).toBeDefined();
      expect(containerCall[1].body).not.toContain('access_token=');
      expect(containerCall[1].headers.Authorization).toContain('Bearer');

      // Media Publish POST呼び出し
      const publishCall = mockFetch.mock.calls.find(
        ([url, opts]) => url.includes('media_publish') && opts?.method === 'POST'
      );
      expect(publishCall).toBeDefined();
      expect(publishCall[1].body).not.toContain('access_token=');
      expect(publishCall[1].headers.Authorization).toContain('Bearer');
    });

    it('Pollingタイムアウト（IN_PROGRESS継続）で504 + ロック解放', async () => {
      // containerStatusが常にIN_PROGRESSを返す → 5回ポーリング後タイムアウト
      // 各ポーリング間に2秒待機があるため、タイムアウトを延長
      const mockFetch = createFullFlowFetchMock({ containerStatus: 'IN_PROGRESS' });
      globalThis.fetch = mockFetch;

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(504);
      expect(res._json.error).toContain('タイムアウト');
      expect(mockFetch._lockDeleted.value).toBe(true);
    }, 15000);

    it('ig_posted キャッシュがTTLなし（無期限）で保存されること', async () => {
      const mockFetch = createFullFlowFetchMock();
      globalThis.fetch = mockFetch;

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);

      // ig_posted SET呼び出しを検索（DELやSETNXではない通常のSET）
      const setCalls = mockFetch.mock.calls.filter(
        ([url]) => url.includes('upstash') && url.includes('/set/') &&
                   url.includes('ig_posted') && !url.includes('/NX')
      );
      expect(setCalls.length).toBe(1);

      // URLにEX（TTL指定）が含まれていないことを確認（無期限保存）
      const setUrl = setCalls[0][0];
      expect(setUrl).not.toContain('/EX/');
    });
  });
});
