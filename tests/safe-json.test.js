// tests/safe-json.test.js
// safeJson ユニットテスト
import { describe, it, expect } from 'vitest';
import { safeJson } from '../docs/js/safe-json.js';

/**
 * Responseライクオブジェクトを生成するヘルパー
 */
function fakeResponse(body, status = 200) {
  return {
    status,
    text: async () => body,
  };
}

describe('safeJson', () => {
  it('正常なJSON → パース結果を返す', async () => {
    const res = fakeResponse(JSON.stringify({ title: 'test', count: 42 }));
    const result = await safeJson(res);
    expect(result).toEqual({ title: 'test', count: 42 });
  });

  it('非JSON（HTMLエラーページ） → 汎用メッセージを返し、HTML本文を露出しない', async () => {
    const html = '<html><body>An error occurred</body></html>';
    const res = fakeResponse(html, 502);
    const result = await safeJson(res);
    expect(result).toEqual({ error: 'HTTP 502' });
    expect(result.error).not.toContain('<html');
  });

  it('空レスポンス → { error: "HTTP {status}" } を返す', async () => {
    const res = fakeResponse('', 503);
    const result = await safeJson(res);
    expect(result).toEqual({ error: 'HTTP 503' });
  });

  it('不正なJSON文字列 → 汎用メッセージを返し、本文を露出しない', async () => {
    const res = fakeResponse('{"broken": ', 500);
    const result = await safeJson(res);
    expect(result).toEqual({ error: 'HTTP 500' });
    expect(result.error).not.toContain('broken');
  });

  it('プレーンテキストエラー → 汎用メッセージを返し、本文を露出しない', async () => {
    const res = fakeResponse('Internal Server Error', 500);
    const result = await safeJson(res);
    expect(result).toEqual({ error: 'HTTP 500' });
    expect(result.error).not.toContain('Internal');
  });
});
