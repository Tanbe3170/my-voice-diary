// tests/generate-image.test.js
// Phase 4 画像生成API のセキュリティテスト + キャラクター統合テスト
//
// テストシナリオ:
// 1. Upstash障害時に画像生成へ進まないこと（fail-closed）
// 2. 正常時、10回/日で429を返すこと
// 3. 期限切れ/不正imageTokenで401を返すこと
// 4. filePathパラメータ
// 5. Base64プレビューレスポンス
// 6. キャラクター画像生成（characterId指定・プロンプト合成・フォールバック）

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateImageToken } from '../api/lib/image-token.js';

// vi.hoisted でモック関数を定義（vi.mock ファクトリ内で参照可能にする）
const { mockGenerateImageWithFallback } = vi.hoisted(() => ({
  mockGenerateImageWithFallback: vi.fn(),
}));

const { mockLoadCharacter, mockComposeImagePrompt } = vi.hoisted(() => ({
  mockLoadCharacter: vi.fn(),
  mockComposeImagePrompt: vi.fn(),
}));

// image-backend をモック（@google/genai の依存も回避）
vi.mock('../api/lib/image-backend.js', () => ({
  generateImageWithFallback: mockGenerateImageWithFallback,
  sanitizeError: (msg) => msg,
}));

// character.js をモック
vi.mock('../api/lib/character.js', () => ({
  loadCharacter: mockLoadCharacter,
  composeImagePrompt: mockComposeImagePrompt,
}));

// テスト用の有効なHMACトークンを生成するヘルパー
const IMAGE_TOKEN_SECRET = 'test-secret-key';
function createValidToken(date, filePath, characterId, mode = 'normal', styleId = 'illustration') {
  const timestamp = Date.now();
  return generateImageToken({
    date,
    filePath,
    characterId: characterId || '',
    mode,
    styleId,
    timestamp,
  }, IMAGE_TOKEN_SECRET);
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

// 全テストで共通の環境変数
const baseEnv = {
  VERCEL_PROJECT_PRODUCTION_URL: 'my-voice-diary.vercel.app',
  VERCEL_URL: 'my-voice-diary-xxx.vercel.app',
  IMAGE_TOKEN_SECRET,
  OPENAI_API_KEY: 'sk-test-key',
  GOOGLE_API_KEY: 'test-google-key',
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

    // モックをリセット
    mockGenerateImageWithFallback.mockClear();
    mockLoadCharacter.mockClear();
    mockComposeImagePrompt.mockClear();

    // デフォルトのモック動作設定
    mockLoadCharacter.mockResolvedValue(null); // デフォルトはキャラクターなし
    mockComposeImagePrompt.mockImplementation((prompt, char, sid) => ({
      prompt: char ? `composed: ${prompt}` : `styled(${sid}): ${prompt}`,
      negativePrompt: char ? 'negative' : (sid ? 'style-negative' : ''),
    }));

    // fetch呼び出しを記録
    fetchCalls = [];
    originalFetch = globalThis.fetch;

    // モジュールキャッシュをクリアしてハンドラを再読み込み
    vi.resetModules();
    const mod = await import('../api/generate-image.js');
    handler = mod.default;
  });

  afterEach(() => {
    // グローバルfetchを復元（テスト間の状態汚染を防ぐ）
    globalThis.fetch = originalFetch;
  });

  // =================================================================
  // テスト1: Upstash障害時に画像生成が行われないこと（fail-closed）
  // =================================================================
  describe('Upstash障害時のfail-closed', () => {
    it('Upstash incr HTTPエラー時、500を返し画像生成を呼び出さない', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        fetchCalls.push(url);

        // Upstash incrリクエスト → HTTPエラー
        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: false, status: 503, json: async () => ({}) };
        }

        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(500);
      expect(mockGenerateImageWithFallback).not.toHaveBeenCalled();
    });

    it('Upstash incr不正レスポンス（result=0）時、500を返し画像生成を呼び出さない', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        fetchCalls.push(url);

        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 0 }) };
        }

        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(500);
      expect(mockGenerateImageWithFallback).not.toHaveBeenCalled();
    });

    it('Upstash接続エラー（fetch例外）時、500を返し画像生成を呼び出さない', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        fetchCalls.push(url);

        if (url.includes('upstash') && url.includes('incr')) {
          throw new Error('Network error');
        }

        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(500);
      expect(mockGenerateImageWithFallback).not.toHaveBeenCalled();
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

        // GitHub画像保存
        if (url.includes('api.github.com') && url.includes('contents/docs/images')) {
          return { ok: true, json: async () => ({ content: {} }) };
        }

        return { ok: true, json: async () => ({}) };
      });

      // generateImageWithFallback の成功モック
      mockGenerateImageWithFallback.mockResolvedValueOnce({
        imageData: Buffer.from('fake-png'),
        backend: 'dalle',
        model: 'DALL-E 3',
        modelId: 'dall-e-3',
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      // 200で正常完了し、generateImageWithFallbackが呼ばれたことを確認
      expect(res._status).toBe(200);
      expect(mockGenerateImageWithFallback).toHaveBeenCalledTimes(1);
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
      const expiredToken = generateImageToken({
        date,
        characterId: '',
        mode: 'normal',
        styleId: 'illustration',
        timestamp: expiredTs,
      }, IMAGE_TOKEN_SECRET);

      globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));

      const req = createMockReq({
        body: { date, imageToken: expiredToken, styleId: 'illustration' },
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
        body: { date, imageToken: invalidToken, styleId: 'illustration' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(401);
      expect(res._json.error).toContain('認証');
    });

    it('未来timestampのトークンで401を返す', async () => {
      // 1分後のタイムスタンプ（未来時刻）
      const futureTs = Date.now() + 60 * 1000;
      const date = '2026-02-19';
      const futureToken = generateImageToken({
        date,
        characterId: '',
        mode: 'normal',
        styleId: 'illustration',
        timestamp: futureTs,
      }, IMAGE_TOKEN_SECRET);

      globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));

      const req = createMockReq({
        body: { date, imageToken: futureToken, styleId: 'illustration' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(401);
    });

    it('TTL境界: 299,999ms前のトークンは許可されること', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const date = '2026-02-19';
      const tokenTs = now - 299_999;
      const token = generateImageToken({
        date,
        characterId: '',
        mode: 'normal',
        styleId: 'illustration',
        timestamp: tokenTs,
      }, IMAGE_TOKEN_SECRET);

      globalThis.fetch = vi.fn(async (url) => {
        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        if (url.includes('upstash') && url.includes('expire')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        if (url.includes('api.github.com') && url.includes('contents/diaries')) {
          const content = Buffer.from(
            '---\nimage_prompt: "A test image prompt"\n---\n# Test',
            'utf-8'
          ).toString('base64');
          return { ok: true, json: async () => ({ content, sha: 'abc123' }) };
        }
        if (url.includes('api.github.com') && url.includes('contents/docs/images')) {
          return { ok: true, json: async () => ({ content: {} }) };
        }
        return { ok: true, json: async () => ({}) };
      });

      mockGenerateImageWithFallback.mockResolvedValueOnce({
        imageData: Buffer.from('fake-png'),
        backend: 'dalle',
        model: 'DALL-E 3',
        modelId: 'dall-e-3',
      });

      const req = createMockReq({
        body: { date, imageToken: token, styleId: 'illustration' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      vi.useRealTimers();
    });

    it('TTL境界: ちょうど300,000ms前のトークンは許可されること', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const date = '2026-02-19';
      const tokenTs = now - 300_000;
      const token = generateImageToken({
        date,
        characterId: '',
        mode: 'normal',
        styleId: 'illustration',
        timestamp: tokenTs,
      }, IMAGE_TOKEN_SECRET);

      globalThis.fetch = vi.fn(async (url) => {
        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        if (url.includes('upstash') && url.includes('expire')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        if (url.includes('api.github.com') && url.includes('contents/diaries')) {
          const content = Buffer.from(
            '---\nimage_prompt: "A test image prompt"\n---\n# Test',
            'utf-8'
          ).toString('base64');
          return { ok: true, json: async () => ({ content, sha: 'abc123' }) };
        }
        if (url.includes('api.github.com') && url.includes('contents/docs/images')) {
          return { ok: true, json: async () => ({ content: {} }) };
        }
        return { ok: true, json: async () => ({}) };
      });

      mockGenerateImageWithFallback.mockResolvedValueOnce({
        imageData: Buffer.from('fake-png'),
        backend: 'dalle',
        model: 'DALL-E 3',
        modelId: 'dall-e-3',
      });

      const req = createMockReq({
        body: { date, imageToken: token, styleId: 'illustration' },
      });
      const res = createMockRes();
      await handler(req, res);

      // age > 300_000 なので、300,000msちょうどは許可
      expect(res._status).toBe(200);
      vi.useRealTimers();
    });

    it('TTL境界: 300,001ms前のトークンで401を返すこと', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const date = '2026-02-19';
      const tokenTs = now - 300_001;
      const token = generateImageToken({
        date,
        characterId: '',
        mode: 'normal',
        styleId: 'illustration',
        timestamp: tokenTs,
      }, IMAGE_TOKEN_SECRET);

      globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));

      const req = createMockReq({
        body: { date, imageToken: token, styleId: 'illustration' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(401);
      vi.useRealTimers();
    });

    it('不正な形式のトークンで401を返す', async () => {
      globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));

      const req = createMockReq({
        body: { date: '2026-02-19', imageToken: 'invalid-token-format', styleId: 'illustration' },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(401);
    });
  });

  // =================================================================
  // テスト4: filePathパラメータ
  // =================================================================
  describe('filePathパラメータ', () => {
    it('filePath指定時にそのパスで日記を取得すること', async () => {
      let requestedDiaryUrl = null;

      globalThis.fetch = vi.fn(async (url) => {
        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        if (url.includes('upstash') && url.includes('expire')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        if (url.includes('api.github.com') && url.includes('contents/diaries')) {
          requestedDiaryUrl = url;
          const content = Buffer.from(
            '---\nimage_prompt: "A test image prompt"\n---\n# Test',
            'utf-8'
          ).toString('base64');
          return { ok: true, json: async () => ({ content, sha: 'abc123' }) };
        }
        if (url.includes('api.github.com') && url.includes('contents/docs/images')) {
          return { ok: true, json: async () => ({ content: {} }) };
        }
        return { ok: true, json: async () => ({}) };
      });

      mockGenerateImageWithFallback.mockResolvedValueOnce({
        imageData: Buffer.from('fake-png'),
        backend: 'dalle',
        model: 'DALL-E 3',
        modelId: 'dall-e-3',
      });

      const req = createMockReq({
        body: {
          date: '2026-02-19',
          imageToken: createValidToken('2026-02-19', 'diaries/2026/02/my-custom-diary.md'),
          filePath: 'diaries/2026/02/my-custom-diary.md',
          styleId: 'illustration',
        },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      // filePathで指定したパスがGitHub APIのURLに含まれること
      expect(requestedDiaryUrl).toContain('diaries/2026/02/my-custom-diary.md');
    });

    it('filePath不正形式（パストラバーサル）で400を返す', async () => {
      globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));

      const req = createMockReq({
        body: {
          date: '2026-02-19',
          imageToken: createValidToken('2026-02-19'),
          filePath: '../../../etc/passwd',
          styleId: 'illustration',
        },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
      expect(res._json.error).toContain('ファイルパス');
    });

    it('filePath未指定時はdate基準のパスを使用すること（後方互換性）', async () => {
      let requestedDiaryUrl = null;

      globalThis.fetch = vi.fn(async (url) => {
        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        if (url.includes('upstash') && url.includes('expire')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        if (url.includes('api.github.com') && url.includes('contents/diaries')) {
          requestedDiaryUrl = url;
          const content = Buffer.from(
            '---\nimage_prompt: "A test image prompt"\n---\n# Test',
            'utf-8'
          ).toString('base64');
          return { ok: true, json: async () => ({ content, sha: 'abc123' }) };
        }
        if (url.includes('api.github.com') && url.includes('contents/docs/images')) {
          return { ok: true, json: async () => ({ content: {} }) };
        }
        return { ok: true, json: async () => ({}) };
      });

      mockGenerateImageWithFallback.mockResolvedValueOnce({
        imageData: Buffer.from('fake-png'),
        backend: 'dalle',
        model: 'DALL-E 3',
        modelId: 'dall-e-3',
      });

      const req = createMockReq(); // filePath未指定
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      // デフォルトのdate基準パスが使用されること
      expect(requestedDiaryUrl).toContain('diaries/2026/02/2026-02-19.md');
    });
  });

  // =================================================================
  // テスト5: Base64プレビューレスポンス
  // =================================================================
  describe('Base64プレビューレスポンス', () => {
    // 正常フローの共通fetchモック（Upstash + GitHub APIのみ）
    function createNormalFetchMock() {
      return vi.fn(async (url) => {
        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        if (url.includes('upstash') && url.includes('expire')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        if (url.includes('api.github.com') && url.includes('contents/diaries')) {
          const content = Buffer.from(
            '---\nimage_prompt: "A test image prompt"\n---\n# Test',
            'utf-8'
          ).toString('base64');
          return { ok: true, json: async () => ({ content, sha: 'abc123' }) };
        }
        if (url.includes('api.github.com') && url.includes('contents/docs/images')) {
          return { ok: true, json: async () => ({ content: {} }) };
        }
        return { ok: true, json: async () => ({}) };
      });
    }

    it('2.5MB未満の画像でimageBase64フィールドが含まれること', async () => {
      const smallBase64 = Buffer.from('small-fake-png').toString('base64');
      globalThis.fetch = createNormalFetchMock();
      mockGenerateImageWithFallback.mockResolvedValueOnce({
        imageData: Buffer.from('small-fake-png'),
        backend: 'dalle',
        model: 'DALL-E 3',
        modelId: 'dall-e-3',
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._json.imageBase64).toBe(smallBase64);
      expect(res._json.imageUrl).toBeDefined();
    });

    it('2.5MB以上の画像でimageBase64が省略されキャッシュバスター付きURLになること', async () => {
      // 2.5MB超のデータを生成
      const largeBuffer = Buffer.alloc(2_000_000, 'A'); // 約2.67MB in base64
      globalThis.fetch = createNormalFetchMock();
      mockGenerateImageWithFallback.mockResolvedValueOnce({
        imageData: largeBuffer,
        backend: 'dalle',
        model: 'DALL-E 3',
        modelId: 'dall-e-3',
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._json.imageBase64).toBeUndefined();
      // キャッシュバスター（?t=タイムスタンプ）が付与されていること
      expect(res._json.imageUrl).toContain('?t=');
    });

    it('ちょうど2,500,000文字の画像でimageBase64が省略されること（境界値）', async () => {
      // 境界値: base64文字列がちょうど2,500,000文字になるバッファを作成
      // base64エンコードは4/3倍なので、1,875,000バイト → 2,500,000文字
      const boundaryBuffer = Buffer.alloc(1_875_000, 'B');
      globalThis.fetch = createNormalFetchMock();
      mockGenerateImageWithFallback.mockResolvedValueOnce({
        imageData: boundaryBuffer,
        backend: 'dalle',
        model: 'DALL-E 3',
        modelId: 'dall-e-3',
      });

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._json.imageBase64).toBeUndefined();
      expect(res._json.imageUrl).toContain('?t=');
    });
  });

  // =================================================================
  // テスト6: キャラクター画像生成
  // =================================================================
  describe('キャラクター画像生成', () => {
    // 正常フローの共通fetchモック（Upstash + GitHub APIのみ）
    function createNormalFetchMock() {
      return vi.fn(async (url) => {
        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        if (url.includes('upstash') && url.includes('expire')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        if (url.includes('api.github.com') && url.includes('contents/diaries')) {
          const content = Buffer.from(
            '---\nimage_prompt: "A sunny day at the park"\n---\n# Test',
            'utf-8'
          ).toString('base64');
          return { ok: true, json: async () => ({ content, sha: 'abc123' }) };
        }
        if (url.includes('api.github.com') && url.includes('contents/docs/images')) {
          return { ok: true, json: async () => ({ content: {} }) };
        }
        return { ok: true, json: async () => ({}) };
      });
    }

    it('characterId指定時にloadCharacterが呼ばれプロンプト合成されること', async () => {
      const mockCharacter = {
        id: 'dino',
        name: '恐竜くん',
        imageStyle: { basePrompt: 'cute dinosaur character' },
      };
      mockLoadCharacter.mockResolvedValueOnce(mockCharacter);
      mockComposeImagePrompt.mockReturnValueOnce({
        prompt: 'composed: A sunny day at the park with cute dinosaur character',
        negativePrompt: 'realistic, photo',
      });
      mockGenerateImageWithFallback.mockResolvedValueOnce({
        imageData: Buffer.from('fake-png'),
        backend: 'imagen',
        model: 'Imagen 3',
        modelId: 'imagen-3.0-generate-002',
      });

      globalThis.fetch = createNormalFetchMock();

      const req = createMockReq({
        body: {
          date: '2026-02-19',
          imageToken: createValidToken('2026-02-19', undefined, 'dino', 'dino-story'),
          characterId: 'dino',
          mode: 'dino-story',
          styleId: 'illustration',
        },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      // loadCharacterが呼ばれたことを検証
      expect(mockLoadCharacter).toHaveBeenCalledTimes(1);
      expect(mockLoadCharacter).toHaveBeenCalledWith('dino', expect.objectContaining({
        token: 'ghp_test',
        owner: 'TestOwner',
        repo: 'test-repo',
      }));
      // composeImagePromptが呼ばれたことを検証
      expect(mockComposeImagePrompt).toHaveBeenCalledTimes(1);
      expect(mockComposeImagePrompt).toHaveBeenCalledWith('A sunny day at the park', mockCharacter, 'illustration');
      // generateImageWithFallbackが合成プロンプトで呼ばれたことを検証
      expect(mockGenerateImageWithFallback).toHaveBeenCalledWith(
        'composed: A sunny day at the park with cute dinosaur character',
        'realistic, photo',
      );
      // レスポンスにcharacterIdが含まれること
      expect(res._json.characterId).toBe('dino');
    });

    it('characterId未指定時にloadCharacterが呼ばれないこと（後方互換）', async () => {
      mockGenerateImageWithFallback.mockResolvedValueOnce({
        imageData: Buffer.from('fake-png'),
        backend: 'dalle',
        model: 'DALL-E 3',
        modelId: 'dall-e-3',
      });

      globalThis.fetch = createNormalFetchMock();

      const req = createMockReq(); // characterId未指定
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      // loadCharacterが呼ばれていないことを検証
      expect(mockLoadCharacter).not.toHaveBeenCalled();
      // composeImagePromptがnullキャラクター + styleIdで呼ばれることを検証
      expect(mockComposeImagePrompt).toHaveBeenCalledWith('A sunny day at the park', null, 'illustration');
      // generateImageWithFallbackは呼ばれることを検証
      expect(mockGenerateImageWithFallback).toHaveBeenCalledTimes(1);
    });

    it('キャラクターファイル不存在時にフォールバック（スタイルは適用される）', async () => {
      mockLoadCharacter.mockResolvedValueOnce(null); // キャラクター見つからない
      mockGenerateImageWithFallback.mockResolvedValueOnce({
        imageData: Buffer.from('fake-png'),
        backend: 'dalle',
        model: 'DALL-E 3',
        modelId: 'dall-e-3',
      });

      globalThis.fetch = createNormalFetchMock();

      const req = createMockReq({
        body: {
          date: '2026-02-19',
          imageToken: createValidToken('2026-02-19', undefined, 'nonexistent', 'dino-story'),
          characterId: 'nonexistent',
          mode: 'dino-story',
          styleId: 'illustration',
        },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      // loadCharacterは呼ばれるがnullを返す
      expect(mockLoadCharacter).toHaveBeenCalledTimes(1);
      // composeImagePromptがnullキャラクター + styleIdで呼ばれることを検証
      expect(mockComposeImagePrompt).toHaveBeenCalledWith('A sunny day at the park', null, 'illustration');
      // generateImageWithFallbackはスタイル適用済みプロンプトで呼ばれることを検証
      expect(mockGenerateImageWithFallback).toHaveBeenCalledWith(
        'styled(illustration): A sunny day at the park',
        'style-negative',
      );
    });

    it('レスポンスにbackend/modelが含まれること', async () => {
      mockGenerateImageWithFallback.mockResolvedValueOnce({
        imageData: Buffer.from('fake-png'),
        backend: 'imagen',
        model: 'Imagen 3',
        modelId: 'imagen-3.0-generate-002',
      });

      globalThis.fetch = createNormalFetchMock();

      const req = createMockReq();
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._json.backend).toBe('imagen');
      expect(res._json.model).toBe('Imagen 3');
      expect(res._json.modelId).toBe('imagen-3.0-generate-002');
    });

    it('characterId指定時にmode=normalで400を返す', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq({
        body: {
          date: '2026-02-19',
          imageToken: createValidToken('2026-02-19', undefined, 'quetz-default', 'normal'),
          characterId: 'quetz-default',
          mode: 'normal',
          styleId: 'illustration',
        },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
      expect(res._json.error).toContain('dino-story');
    });

    it('mode改ざん（署名と不一致）で401を返す', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        return { ok: true, json: async () => ({}) };
      });

      // トークンはmode='dino-story'で署名
      const req = createMockReq({
        body: {
          date: '2026-02-19',
          imageToken: createValidToken('2026-02-19', undefined, '', 'dino-story'),
          // リクエストではmode='normal'を送信（改ざん）
          mode: 'normal',
          styleId: 'illustration',
        },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(401);
      expect(res._json.error).toContain('認証');
    });

    it('characterId改ざん（署名と不一致）で401を返す', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        return { ok: true, json: async () => ({}) };
      });

      // トークンはcharacterId='quetz-default'で署名
      const req = createMockReq({
        body: {
          date: '2026-02-19',
          imageToken: createValidToken('2026-02-19', undefined, 'quetz-default', 'dino-story'),
          characterId: 'other-char',
          mode: 'dino-story',
          styleId: 'illustration',
        },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(401);
      expect(res._json.error).toContain('認証');
    });

    it('不正なmode値で400を返すこと', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        return { ok: true, json: async () => ({}) };
      });

      const req = createMockReq({
        body: {
          date: '2026-02-19',
          imageToken: createValidToken('2026-02-19'),
          mode: 'invalid-mode',
          styleId: 'illustration',
        },
      });
      const res = createMockRes();
      await handler(req, res);

      expect(res._status).toBe(400);
      expect(res._json.error).toContain('モード');
    });

    it('不正なcharacterId形式で400を返すこと', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        return { ok: true, json: async () => ({}) };
      });

      // パストラバーサル攻撃
      const req1 = createMockReq({
        body: {
          date: '2026-02-19',
          imageToken: createValidToken('2026-02-19'),
          characterId: '../secret',
          styleId: 'illustration',
        },
      });
      const res1 = createMockRes();
      await handler(req1, res1);
      expect(res1._status).toBe(400);

      // 大文字（許可されない形式）
      const req2 = createMockReq({
        body: {
          date: '2026-02-19',
          imageToken: createValidToken('2026-02-19'),
          characterId: 'UPPERCASE',
          styleId: 'illustration',
        },
      });
      const res2 = createMockRes();
      await handler(req2, res2);
      expect(res2._status).toBe(400);
    });
  });

  // =================================================================
  // テスト7: styleIdバリデーション
  // =================================================================
  describe('styleIdバリデーション', () => {
    it('不正なstyleIdで400を返すこと', async () => {
      globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
      const req = createMockReq({
        body: {
          date: '2026-02-19',
          imageToken: createValidToken('2026-02-19'),
          styleId: 'invalid-style',
        },
      });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(400);
      expect(res._json.error).toContain('スタイル');
    });

    it('styleId未指定で400を返すこと', async () => {
      globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
      const req = createMockReq();
      delete req.body.styleId;
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(400);
    });

    it('styleId改ざん（署名と不一致）で401を返す', async () => {
      globalThis.fetch = vi.fn(async (url) => {
        if (url.includes('upstash') && url.includes('incr')) {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        return { ok: true, json: async () => ({}) };
      });

      // トークンはstyleId='illustration'で署名
      const req = createMockReq({
        body: {
          date: '2026-02-19',
          imageToken: createValidToken('2026-02-19', undefined, '', 'normal', 'illustration'),
          styleId: 'oilpainting', // 改ざん
        },
      });
      const res = createMockRes();
      await handler(req, res);
      expect(res._status).toBe(401);
      expect(res._json.error).toContain('認証');
    });
  });
});
