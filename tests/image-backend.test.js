// tests/image-backend.test.js
// 画像生成バックエンド共通ライブラリのテスト
//
// テストシナリオ:
// 1. フォールバックチェーン（NB2→NBpro→DALL-E 3）
// 2. APIキー未設定時のスキップ
// 3. sanitizeError

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoistedでvi.mock内から参照できるモック関数を定義
const { mockGenerateContent } = vi.hoisted(() => {
  return { mockGenerateContent: vi.fn() };
});

// @google/genai モジュールをモック
vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGoogleGenAI {
    constructor() {
      this.models = {
        generateContent: mockGenerateContent,
      };
    }
  },
}));

// テスト対象をトップレベルでインポート
import { generateImageWithFallback, sanitizeError } from '../api/lib/image-backend.js';

// fetchモック
const originalFetch = global.fetch;

// 環境変数のバックアップ
let envBackup;

beforeEach(() => {
  envBackup = { ...process.env };
  mockGenerateContent.mockClear();
  global.fetch = vi.fn();
  // デフォルトのAPIキー設定
  process.env.GOOGLE_API_KEY = 'test-google-key';
  process.env.OPENAI_API_KEY = 'test-openai-key';
  delete process.env.GEMINI_NB2_MODEL;
  delete process.env.GEMINI_NBPRO_MODEL;
});

afterEach(() => {
  process.env = envBackup;
  global.fetch = originalFetch;
});

// Gemini成功レスポンスのヘルパー
function geminiSuccessResponse() {
  return {
    candidates: [{
      content: {
        parts: [{
          inlineData: {
            data: Buffer.from('fake-image-data').toString('base64'),
          },
        }],
      },
    }],
  };
}

// Gemini画像なしレスポンスのヘルパー
function geminiNoImageResponse() {
  return {
    candidates: [{
      content: {
        parts: [{ text: 'テキストのみ' }],
      },
    }],
  };
}

// DALL-E成功レスポンスのヘルパー
function dalleSuccessResponse() {
  return {
    ok: true,
    json: async () => ({
      data: [{
        b64_json: Buffer.from('dalle-image-data').toString('base64'),
      }],
    }),
  };
}

describe('generateImageWithFallback', () => {
  it('NB2成功時にNB2の結果を返す', async () => {
    mockGenerateContent.mockResolvedValueOnce(geminiSuccessResponse());

    const result = await generateImageWithFallback('test prompt', 'negative');

    expect(result.backend).toBe('gemini');
    expect(result.model).toBe('NB2');
    expect(result.modelId).toBe('gemini-3.1-flash-image-preview');
    expect(result.imageData).toBeInstanceOf(Buffer);
  });

  it('NB2失敗→NBpro成功時にNBproの結果を返す', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('NB2 error'))
      .mockResolvedValueOnce(geminiSuccessResponse());

    const result = await generateImageWithFallback('test prompt', 'negative');

    expect(result.backend).toBe('gemini');
    expect(result.model).toBe('NBpro');
    expect(result.modelId).toBe('gemini-3-pro-image-preview');
  });

  it('NB2/NBpro失敗→DALL-E 3成功時にDALL-E 3の結果を返す', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('NB2 error'))
      .mockRejectedValueOnce(new Error('NBpro error'));

    global.fetch = vi.fn().mockResolvedValueOnce(dalleSuccessResponse());

    const result = await generateImageWithFallback('test prompt', 'negative');

    expect(result.backend).toBe('dalle');
    expect(result.model).toBe('DALL-E 3');
    expect(result.modelId).toBe('dall-e-3');
    expect(result.imageData).toBeInstanceOf(Buffer);
  });

  it('全バックエンド失敗時にエラーをthrow', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('NB2 error'))
      .mockRejectedValueOnce(new Error('NBpro error'));

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      text: async () => 'API error',
      status: 500,
    });

    await expect(generateImageWithFallback('test prompt', '')).rejects.toThrow('全画像生成バックエンドが失敗しました');
  });

  it('GOOGLE_API_KEY未設定時にGeminiをスキップしDALL-Eを使用', async () => {
    delete process.env.GOOGLE_API_KEY;
    global.fetch = vi.fn().mockResolvedValueOnce(dalleSuccessResponse());

    const result = await generateImageWithFallback('test prompt', '');

    expect(result.backend).toBe('dalle');
    expect(result.model).toBe('DALL-E 3');
    // Geminiが呼ばれていないことを確認
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('OPENAI_API_KEY未設定時にDALL-E 3をスキップ', async () => {
    delete process.env.OPENAI_API_KEY;
    mockGenerateContent.mockResolvedValueOnce(geminiSuccessResponse());

    const result = await generateImageWithFallback('test prompt', '');

    expect(result.backend).toBe('gemini');
    expect(result.model).toBe('NB2');
  });

  it('全APIキー未設定時にエラーをthrow', async () => {
    delete process.env.GOOGLE_API_KEY;
    delete process.env.OPENAI_API_KEY;

    await expect(generateImageWithFallback('test prompt', '')).rejects.toThrow('全画像生成バックエンドが失敗しました');
  });

  it('Geminiレスポンスに画像なしの場合は次のバックエンドにフォールバック', async () => {
    mockGenerateContent
      .mockResolvedValueOnce(geminiNoImageResponse())
      .mockResolvedValueOnce(geminiSuccessResponse());

    const result = await generateImageWithFallback('test prompt', '');

    expect(result.model).toBe('NBpro');
  });

  it('negativePromptがGeminiプロンプトに追記される', async () => {
    mockGenerateContent.mockResolvedValueOnce(geminiSuccessResponse());

    await generateImageWithFallback('main prompt', 'ugly, blurry');

    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.contents).toContain('main prompt');
    expect(callArgs.contents).toContain('Avoid: ugly, blurry');
  });
});

describe('sanitizeError', () => {
  it('APIキーがエラーメッセージから除去される', () => {
    const result = sanitizeError('Error with key abc123xyz in request', 'abc123xyz');
    expect(result).toBe('Error with key [REDACTED] in request');
    expect(result).not.toContain('abc123xyz');
  });

  it('キーがない場合はメッセージをそのまま返す', () => {
    const result = sanitizeError('Normal error message');
    expect(result).toBe('Normal error message');
  });

  it('複数キーの除去', () => {
    const result = sanitizeError('key1=aaa key2=bbb', 'aaa', 'bbb');
    expect(result).toBe('key1=[REDACTED] key2=[REDACTED]');
  });
});
