// tests/post-bluesky.test.js
// Phase 5.5 Bluesky投稿API のセキュリティ・機能テスト
//
// テストシナリオ:
// 1. CORS・HTTPメソッド検証
// 2. JWT認証（JWTのみ、AUTH_TOKENフォールバックなし）
// 3. 入力バリデーション（date, text 300 graphemes）
// 4. 環境変数チェック
// 5. Upstash Redis レート制限（fail-closed）
// 6. 重複投稿防止（冪等性保証）
// 7. 日記・画像取得
// 8. Bluesky API連携（createSession→uploadBlob→createRecord）

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { signJwt } from '../api/lib/jwt.js';

// sharpモック（PNG→JPEG変換をシミュレート）
// _nextJpegSize / _nextResizeSize でテスト毎にサイズを制御可能
const sharpMockState = { nextJpegSize: 500_000, nextResizeSize: 300_000 };

vi.mock('sharp', () => ({
  default: vi.fn((buffer) => ({
    jpeg: vi.fn((opts) => ({
      toBuffer: vi.fn(async () => Buffer.alloc(sharpMockState.nextJpegSize, 0xAA)),
    })),
    resize: vi.fn((w, h, fitOpts) => ({
      jpeg: vi.fn((jpegOpts) => ({
        toBuffer: vi.fn(async () => Buffer.alloc(sharpMockState.nextResizeSize, 0xBB)),
      })),
    })),
  }),
  ),
}));

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
  BLUESKY_IDENTIFIER: 'test.bsky.social',
  BLUESKY_APP_PASSWORD: 'test-app-password',
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

// 500バイトのダミー画像（1MB以下）
const SMALL_IMAGE = Buffer.alloc(500, 0xFF);

/**
 * Bluesky投稿の正常フロー用fetchモック
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

    // Upstash GET bs_posted（既投稿チェック）
    if (url.includes('upstash') && url.includes('/get/')) {
      if (overrides.alreadyPosted) {
        return { ok: true, json: async () => ({ result: 'at://did:plc:test/app.bsky.feed.post/existing' }) };
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

    // 画像取得（GitHub Raw）
    if (url.includes('raw.githubusercontent.com')) {
      if (overrides.imageNotFound) {
        return { ok: false, status: 404 };
      }
      const imgBuf = overrides.imageBuffer ?? SMALL_IMAGE;
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => imgBuf.buffer.slice(imgBuf.byteOffset, imgBuf.byteOffset + imgBuf.byteLength),
      };
    }

    // Bluesky createSession
    if (url.includes('bsky.social') && url.includes('createSession')) {
      if (overrides.sessionError) {
        return {
          ok: false,
          status: overrides.sessionErrorStatus ?? 401,
          json: async () => ({ error: 'AuthenticationRequired', message: 'Invalid credentials' }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          accessJwt: 'test-access-jwt',
          refreshJwt: 'test-refresh-jwt',
          did: 'did:plc:testuser123',
          handle: 'test.bsky.social',
        }),
      };
    }

    // Bluesky uploadBlob
    if (url.includes('bsky.social') && url.includes('uploadBlob')) {
      if (overrides.uploadError) {
        return { ok: false, status: 400, json: async () => ({ error: 'UploadFailed' }) };
      }
      return {
        ok: true,
        json: async () => ({
          blob: {
            $type: 'blob',
            ref: { $link: 'bafyreiBUFtest' },
            mimeType: 'image/png',
            size: 500,
          },
        }),
      };
    }

    // Bluesky createRecord
    if (url.includes('bsky.social') && url.includes('createRecord')) {
      if (overrides.recordError) {
        return { ok: false, status: 400, json: async () => ({ error: 'InvalidRecord' }) };
      }
      return {
        ok: true,
        json: async () => ({
          uri: 'at://did:plc:testuser123/app.bsky.feed.post/3abc123',
          cid: 'bafyreicid123',
        }),
      };
    }

    return { ok: true, json: async () => ({}) };
  });

  mockFn._lockDeleted = lockDeleted;
  return mockFn;
}

describe('post-bluesky API', () => {
  let handler;
  let originalFetch;

  beforeEach(async () => {
    Object.assign(process.env, baseEnv);
    originalFetch = globalThis.fetch;
    // sharpモックのサイズをデフォルトにリセット
    sharpMockState.nextJpegSize = 500_000;
    sharpMockState.nextResizeSize = 300_000;
    vi.resetModules();
    const mod = await import('../api/post-bluesky.js');
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

    it('filePath不正形式で400', async () => {
      const req = createMockReq({
        body: { date: '2026-02-19', filePath: 'not/valid/path.txt' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
      expect(res._json.error).toContain('ファイルパス');
    });

    it('filePathパストラバーサルで400', async () => {
      const req = createMockReq({
        body: { date: '2026-02-19', filePath: 'diaries/2026/02/../../../etc/passwd' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
      expect(res._json.error).toContain('ファイルパス');
    });

    it('text 300 graphemes超で400', async () => {
      const req = createMockReq({
        body: { date: '2026-02-19', text: 'あ'.repeat(301) },
      });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      expect(res._json.error).toContain('300');
    });

    it('絵文字のgraphemes計測（結合文字含む）', async () => {
      // 家族絵文字（👨‍👩‍👧‍👦）は1 grapheme
      const familyEmoji = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}';
      // 299個の'あ' + 1個の家族絵文字 = 300 graphemes → OK
      const validText = 'あ'.repeat(299) + familyEmoji;

      globalThis.fetch = createFullFlowFetchMock();
      const req = createMockReq({
        body: { date: '2026-02-19', text: validText },
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
    it('BLUESKY_IDENTIFIER未設定で500', async () => {
      delete process.env.BLUESKY_IDENTIFIER;
      vi.resetModules();
      const mod = await import('../api/post-bluesky.js');
      const req = createMockReq();
      const res = createMockRes();
      await mod.default(req, res);
      expect(res._status).toBe(500);
    });

    it('BLUESKY_APP_PASSWORD未設定で500', async () => {
      delete process.env.BLUESKY_APP_PASSWORD;
      vi.resetModules();
      const mod = await import('../api/post-bluesky.js');
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
    it('Upstash incr HTTPエラー時、500を返しBluesky APIを呼び出さない', async () => {
      let blueskyCalled = false;
      globalThis.fetch = vi.fn(async (url) => {
        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: false, status: 503, json: async () => ({}) };
        }
        if (url.includes('bsky.social')) {
          blueskyCalled = true;
          return { ok: true, json: async () => ({}) };
        }
        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
      expect(blueskyCalled).toBe(false);
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
    it('既投稿済み（bs_posted存在）→ 200 + 既存postUri', async () => {
      globalThis.fetch = createFullFlowFetchMock({ alreadyPosted: true });
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);
      expect(res._json.alreadyPosted).toBe(true);
      expect(res._json.postUri).toBe('at://did:plc:test/app.bsky.feed.post/existing');
    });

    it('ロック競合（bs_lock存在）→ 409 Conflict', async () => {
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
      const mockFetch = createFullFlowFetchMock({ recordError: true });
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
      expect(mockFetch._lockDeleted.value).toBe(true);
    });

    it('bs_posted GET HTTPエラー時に500（fail-closed）', async () => {
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
      let bsApiCalled = false;
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
        if (url.includes('bsky.social')) {
          bsApiCalled = true;
        }
        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
      expect(bsApiCalled).toBe(false);
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

    it('画像1MB超過時にJPEG変換で1MB以下になり投稿成功', async () => {
      sharpMockState.nextJpegSize = 500_000; // JPEG変換で500KBに
      const largeImage = Buffer.alloc(1_100_000, 0xFF);
      const mockFetch = createFullFlowFetchMock({ imageBuffer: largeImage });
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);
      expect(res._json.success).toBe(true);
      const uploadCall = mockFetch.mock.calls.find(c => c[0].includes('uploadBlob'));
      expect(uploadCall[1].headers['Content-Type']).toBe('image/jpeg');
      expect(uploadCall[1].body.byteLength).toBeLessThanOrEqual(1_000_000);
    });

    it('JPEG変換後も1MB超過時にリサイズされて投稿成功', async () => {
      sharpMockState.nextJpegSize = 1_200_000; // JPEG変換でもまだ1.2MB
      sharpMockState.nextResizeSize = 400_000; // リサイズで400KBに
      const largeImage = Buffer.alloc(2_000_000, 0xFF);
      const mockFetch = createFullFlowFetchMock({ imageBuffer: largeImage });
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);
      expect(res._json.success).toBe(true);
      const uploadCall = mockFetch.mock.calls.find(c => c[0].includes('uploadBlob'));
      expect(uploadCall[1].headers['Content-Type']).toBe('image/jpeg');
      expect(uploadCall[1].body.byteLength).toBeLessThanOrEqual(1_000_000);
    });

    it('リサイズ後も1MB超過時に400エラーを返す', async () => {
      sharpMockState.nextJpegSize = 1_500_000; // JPEG変換でもまだ1.5MB
      sharpMockState.nextResizeSize = 1_100_000; // リサイズ後もまだ1.1MB
      const largeImage = Buffer.alloc(3_000_000, 0xFF);
      const mockFetch = createFullFlowFetchMock({ imageBuffer: largeImage });
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      expect(res._json.error).toContain('圧縮後');
      expect(mockFetch._lockDeleted.value).toBe(true);
    });

    it('1MB以下の画像はそのままPNGでアップロードされる', async () => {
      sharpMockState.nextJpegSize = 500_000; // リセット
      sharpMockState.nextResizeSize = 300_000;
      const mockFetch = createFullFlowFetchMock();
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);
      const uploadCall = mockFetch.mock.calls.find(c => c[0].includes('uploadBlob'));
      expect(uploadCall).toBeDefined();
      expect(uploadCall[1].headers['Content-Type']).toBe('image/png');
    });
  });

  // =================================================================
  // 8. Bluesky API連携
  // =================================================================
  describe('Bluesky API連携', () => {
    it('createSession→uploadBlob→createRecord成功で200', async () => {
      globalThis.fetch = createFullFlowFetchMock();
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);
      expect(res._json.success).toBe(true);
      expect(res._json.postUri).toBe('at://did:plc:testuser123/app.bsky.feed.post/3abc123');
    });

    it('createSession失敗（認証エラー）→ 401 + ロック解放', async () => {
      const mockFetch = createFullFlowFetchMock({ sessionError: true, sessionErrorStatus: 401 });
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(401);
      expect(res._json.error).toContain('認証');
      expect(mockFetch._lockDeleted.value).toBe(true);
    });

    it('uploadBlob失敗 → 500 + ロック解放', async () => {
      const mockFetch = createFullFlowFetchMock({ uploadError: true });
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
      expect(mockFetch._lockDeleted.value).toBe(true);
    });

    it('createRecord失敗 → 500 + ロック解放', async () => {
      const mockFetch = createFullFlowFetchMock({ recordError: true });
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(500);
      expect(mockFetch._lockDeleted.value).toBe(true);
    });

    it('テキスト自動生成が行われること（text未指定時）', async () => {
      const mockFetch = createFullFlowFetchMock();
      globalThis.fetch = mockFetch;
      const req = createMockReq({ body: { date: '2026-02-19' } });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);

      // createRecord呼び出しの確認
      const recordCall = mockFetch.mock.calls.find(
        ([url, opts]) => url.includes('createRecord') && opts?.method === 'POST'
      );
      expect(recordCall).toBeDefined();
      const bodyObj = JSON.parse(recordCall[1].body);
      expect(bodyObj.record.text).toContain('テスト日記');
    });

    it('createRecord送信時にcreatedAtと$typeが含まれること', async () => {
      const mockFetch = createFullFlowFetchMock();
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);

      const recordCall = mockFetch.mock.calls.find(
        ([url, opts]) => url.includes('createRecord') && opts?.method === 'POST'
      );
      const bodyObj = JSON.parse(recordCall[1].body);
      expect(bodyObj.record.$type).toBe('app.bsky.feed.post');
      expect(bodyObj.record.createdAt).toBeDefined();
      expect(bodyObj.record.embed.$type).toBe('app.bsky.embed.images');
    });

    it('bs_posted キャッシュがTTLなし（無期限）で保存されること', async () => {
      const mockFetch = createFullFlowFetchMock();
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);

      const setCalls = mockFetch.mock.calls.filter(
        ([url]) => url.includes('upstash') && url.includes('/set/') &&
                   url.includes('bs_posted') && !url.includes('/NX')
      );
      expect(setCalls.length).toBe(1);
      const setUrl = setCalls[0][0];
      expect(setUrl).not.toContain('/EX/');
    });

    it('uploadBlobにAuthorizationヘッダーが設定されること', async () => {
      const mockFetch = createFullFlowFetchMock();
      globalThis.fetch = mockFetch;
      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(200);

      const uploadCall = mockFetch.mock.calls.find(
        ([url]) => url.includes('uploadBlob')
      );
      expect(uploadCall).toBeDefined();
      expect(uploadCall[1].headers.Authorization).toContain('Bearer');
      expect(uploadCall[1].headers['Content-Type']).toBe('image/png');
    });
  });
});
