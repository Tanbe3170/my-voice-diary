// tests/owl-api.test.js
// owl-encyclopedia Webhook クライアントのテスト
//
// テストシナリオ:
// 1. OWL_API_URL 未設定 → null、fetch未呼出
// 2. 正常送信 → レスポンスJSON、HMAC署名・ヘッダ・ペイロード検証
// 3. サーバーエラー(500) → null、console.error
// 4. タイムアウト → null、console.error
// 5. ネットワークエラー → null、console.error
// 6. category 大文字変換（全4パターン）

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// テスト用環境変数
const TEST_OWL_API_URL = 'https://owl-api.example.com';
const TEST_WEBHOOK_SECRET = 'test-webhook-secret-key';

// テスト用リサーチデータ（diary の snake_case 形式）
const testResearchData = {
  title: 'ヴェロキラプトルの羽毛進化',
  slug: 'velociraptor-feather-evolution',
  topic: 'ヴェロキラプトル',
  category: 'dinosaur',
  summary: 'テストサマリー',
  key_points: ['ポイント1', 'ポイント2'],
  body: 'テスト本文',
  sources: ['https://example.com/source1'],
  tags: ['恐竜', '羽毛'],
  image_prompt: 'feathered velociraptor',  // 送信されないことを検証
};

const testSourceUrl = 'https://github.com/TestOwner/test-repo/blob/main/research/2026/04/2026-04-11-velociraptor-feather-evolution.md';

describe('owl-api.js', () => {
  let originalEnv;
  let originalFetch;

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalFetch = globalThis.fetch;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('OWL_API_URL 未設定時は null を返却し fetch を呼ばない', async () => {
    delete process.env.OWL_API_URL;
    globalThis.fetch = vi.fn();

    const { sendToOwlEncyclopedia } = await import('../lib/owl-api.js');
    const result = await sendToOwlEncyclopedia(testResearchData, testSourceUrl);

    expect(result).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('正常送信時にレスポンスJSONを返却し、HMAC署名・ヘッダ・ペイロードが正しい', async () => {
    process.env.OWL_API_URL = TEST_OWL_API_URL;
    process.env.OWL_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

    const mockResponse = { id: 1, slug: 'velociraptor-feather-evolution' };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const { sendToOwlEncyclopedia } = await import('../lib/owl-api.js');
    const result = await sendToOwlEncyclopedia(testResearchData, testSourceUrl);

    expect(result).toEqual(mockResponse);
    expect(globalThis.fetch).toHaveBeenCalledOnce();

    // fetch の引数を検証
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`${TEST_OWL_API_URL}/api/v1/webhooks/diary-research`);
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');

    // ペイロード構造検証
    const sentPayload = JSON.parse(options.body);
    expect(sentPayload.title).toBe(testResearchData.title);
    expect(sentPayload.keyPoints).toEqual(testResearchData.key_points);  // snake→camel
    expect(sentPayload.category).toBe('DINOSAUR');                       // uppercase
    expect(sentPayload.sourceUrl).toBe(testSourceUrl);
    expect(sentPayload.image_prompt).toBeUndefined();                    // 送信しない

    // HMAC 署名検証
    const timestamp = options.headers['X-Webhook-Timestamp'];
    const signature = options.headers['X-Webhook-Signature'];
    const expectedSignature = crypto
      .createHmac('sha256', TEST_WEBHOOK_SECRET)
      .update(timestamp + '.' + options.body)
      .digest('hex');
    expect(signature).toBe(expectedSignature);
  });

  it('サーバーエラー(500)時は null を返却し console.error を呼ぶ', async () => {
    process.env.OWL_API_URL = TEST_OWL_API_URL;
    process.env.OWL_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    const { sendToOwlEncyclopedia } = await import('../lib/owl-api.js');
    const result = await sendToOwlEncyclopedia(testResearchData, testSourceUrl);

    expect(result).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it('タイムアウト時は null を返却する', async () => {
    process.env.OWL_API_URL = TEST_OWL_API_URL;
    process.env.OWL_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

    globalThis.fetch = vi.fn().mockRejectedValue(
      new DOMException('The operation was aborted', 'AbortError')
    );

    const { sendToOwlEncyclopedia } = await import('../lib/owl-api.js');
    const result = await sendToOwlEncyclopedia(testResearchData, testSourceUrl);

    expect(result).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it('ネットワークエラー時は null を返却する', async () => {
    process.env.OWL_API_URL = TEST_OWL_API_URL;
    process.env.OWL_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

    globalThis.fetch = vi.fn().mockRejectedValue(
      new TypeError('fetch failed')
    );

    const { sendToOwlEncyclopedia } = await import('../lib/owl-api.js');
    const result = await sendToOwlEncyclopedia(testResearchData, testSourceUrl);

    expect(result).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it('category が大文字に変換される（全4パターン）', async () => {
    process.env.OWL_API_URL = TEST_OWL_API_URL;
    process.env.OWL_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 1 }),
    });

    const { sendToOwlEncyclopedia } = await import('../lib/owl-api.js');

    for (const [input, expected] of [
      ['dinosaur', 'DINOSAUR'],
      ['tech', 'TECH'],
      ['skill', 'SKILL'],
      ['general', 'GENERAL'],
    ]) {
      await sendToOwlEncyclopedia({ ...testResearchData, category: input }, testSourceUrl);
      const sentPayload = JSON.parse(globalThis.fetch.mock.lastCall[1].body);
      expect(sentPayload.category).toBe(expected);
    }
  });
});
