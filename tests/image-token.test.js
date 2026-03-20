// tests/image-token.test.js
// HMAC署名の契約テスト（API間署名整合性保証）
//
// create-diary.js と generate-image.js が同一のHMACペイロードを使用することを
// 構造的に保証するための契約テスト。

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildTokenPayload,
  generateImageToken,
  verifyImageToken,
} from '../api/lib/image-token.js';

const TEST_SECRET = 'test-hmac-secret-key-32bytes!!!';

describe('buildTokenPayload', () => {
  it('同一パラメータで同一文字列を返すこと', () => {
    const params = {
      date: '2026-03-20',
      filePath: 'diaries/2026/03/2026-03-20.md',
      characterId: 'quetz-default',
      mode: 'dino-story',
      styleId: 'illustration',
      timestamp: '1742400000000',
    };
    const a = buildTokenPayload(params);
    const b = buildTokenPayload(params);
    expect(a).toBe(b);
  });

  it('filePath指定ありのペイロード構造', () => {
    const payload = buildTokenPayload({
      date: '2026-03-20',
      filePath: 'diaries/2026/03/2026-03-20.md',
      characterId: 'quetz',
      mode: 'dino-story',
      styleId: 'illustration',
      timestamp: '12345',
    });
    expect(payload).toBe('2026-03-20:diaries/2026/03/2026-03-20.md:quetz:dino-story:illustration:12345');
  });

  it('filePath未指定のペイロード構造', () => {
    const payload = buildTokenPayload({
      date: '2026-03-20',
      characterId: '',
      mode: 'normal',
      styleId: 'oilpainting',
      timestamp: '12345',
    });
    expect(payload).toBe('2026-03-20::normal:oilpainting:12345');
  });

  it('characterId/mode未指定時にデフォルト値が使用されること', () => {
    const payload = buildTokenPayload({
      date: '2026-03-20',
      styleId: 'illustration',
      timestamp: '12345',
    });
    expect(payload).toBe('2026-03-20::normal:illustration:12345');
  });

  it('styleId未指定でErrorがthrowされること', () => {
    expect(() => buildTokenPayload({
      date: '2026-03-20',
      timestamp: '12345',
    })).toThrow('date, styleId, timestamp are required');
  });

  it('date未指定でErrorがthrowされること', () => {
    expect(() => buildTokenPayload({
      styleId: 'illustration',
      timestamp: '12345',
    })).toThrow('date, styleId, timestamp are required');
  });

  it('timestamp未指定でErrorがthrowされること', () => {
    expect(() => buildTokenPayload({
      date: '2026-03-20',
      styleId: 'illustration',
    })).toThrow('date, styleId, timestamp are required');
  });
});

describe('generateImageToken + verifyImageToken 契約テスト', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('illustrationスタイルで生成→検証が成功すること', () => {
    const params = {
      date: '2026-03-20',
      filePath: 'diaries/2026/03/2026-03-20.md',
      characterId: '',
      mode: 'normal',
      styleId: 'illustration',
      timestamp: Date.now(),
    };
    const token = generateImageToken(params, TEST_SECRET);
    const result = verifyImageToken(token, {
      date: params.date,
      filePath: params.filePath,
      characterId: params.characterId,
      mode: params.mode,
      styleId: params.styleId,
    }, TEST_SECRET);

    expect(result.valid).toBe(true);
    expect(result.timestamp).toBe(params.timestamp);
    expect(result.reason).toBeUndefined();
  });

  it('oilpaintingスタイルで生成→検証が成功すること', () => {
    const params = {
      date: '2026-03-20',
      characterId: 'quetz-default',
      mode: 'dino-story',
      styleId: 'oilpainting',
      timestamp: Date.now(),
    };
    const token = generateImageToken(params, TEST_SECRET);
    const result = verifyImageToken(token, {
      date: params.date,
      characterId: params.characterId,
      mode: params.mode,
      styleId: params.styleId,
    }, TEST_SECRET);

    expect(result.valid).toBe(true);
  });

  // === 改ざん検出テスト ===

  it('styleId改ざん（illustration→oilpainting）で検証失敗すること', () => {
    const params = {
      date: '2026-03-20',
      characterId: '',
      mode: 'normal',
      styleId: 'illustration',
      timestamp: Date.now(),
    };
    const token = generateImageToken(params, TEST_SECRET);

    // styleIdを改ざんして検証
    const result = verifyImageToken(token, {
      date: params.date,
      characterId: params.characterId,
      mode: params.mode,
      styleId: 'oilpainting', // 改ざん
    }, TEST_SECRET);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('hmac_mismatch');
  });

  it('characterId改ざんで検証失敗すること', () => {
    const params = {
      date: '2026-03-20',
      characterId: 'quetz-default',
      mode: 'dino-story',
      styleId: 'illustration',
      timestamp: Date.now(),
    };
    const token = generateImageToken(params, TEST_SECRET);

    const result = verifyImageToken(token, {
      date: params.date,
      characterId: 'other-char', // 改ざん
      mode: params.mode,
      styleId: params.styleId,
    }, TEST_SECRET);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('hmac_mismatch');
  });

  it('mode改ざんで検証失敗すること', () => {
    const params = {
      date: '2026-03-20',
      characterId: '',
      mode: 'dino-story',
      styleId: 'illustration',
      timestamp: Date.now(),
    };
    const token = generateImageToken(params, TEST_SECRET);

    const result = verifyImageToken(token, {
      date: params.date,
      characterId: params.characterId,
      mode: 'normal', // 改ざん
      styleId: params.styleId,
    }, TEST_SECRET);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('hmac_mismatch');
  });

  it('date改ざんで検証失敗すること', () => {
    const params = {
      date: '2026-03-20',
      characterId: '',
      mode: 'normal',
      styleId: 'illustration',
      timestamp: Date.now(),
    };
    const token = generateImageToken(params, TEST_SECRET);

    const result = verifyImageToken(token, {
      date: '2026-03-21', // 改ざん
      characterId: params.characterId,
      mode: params.mode,
      styleId: params.styleId,
    }, TEST_SECRET);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('hmac_mismatch');
  });
});

describe('verifyImageToken 異常系', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const validParams = {
    date: '2026-03-20',
    characterId: '',
    mode: 'normal',
    styleId: 'illustration',
  };

  it('null入力でtoken_not_stringを返すこと', () => {
    const result = verifyImageToken(null, validParams, TEST_SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('token_not_string');
  });

  it('undefined入力でtoken_not_stringを返すこと', () => {
    const result = verifyImageToken(undefined, validParams, TEST_SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('token_not_string');
  });

  it('数値入力でtoken_not_stringを返すこと', () => {
    const result = verifyImageToken(12345, validParams, TEST_SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('token_not_string');
  });

  it('コロンなしの文字列でtoken_format_invalidを返すこと', () => {
    const result = verifyImageToken('no-colon-here', validParams, TEST_SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('token_format_invalid');
  });

  it('非数値timestampでtimestamp_invalidを返すこと', () => {
    const result = verifyImageToken('abc:' + 'a'.repeat(64), validParams, TEST_SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('timestamp_invalid');
  });

  it('負のtimestampでtimestamp_invalidを返すこと', () => {
    const result = verifyImageToken('-1:' + 'a'.repeat(64), validParams, TEST_SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('timestamp_invalid');
  });

  it('0のtimestampでtimestamp_invalidを返すこと', () => {
    const result = verifyImageToken('0:' + 'a'.repeat(64), validParams, TEST_SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('timestamp_invalid');
  });

  it('非hex文字を含むhmacでhmac_format_invalidを返すこと', () => {
    const result = verifyImageToken(`${Date.now()}:${'g'.repeat(64)}`, validParams, TEST_SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('hmac_format_invalid');
  });

  it('64文字未満のhmacでhmac_format_invalidを返すこと', () => {
    const result = verifyImageToken(`${Date.now()}:${'a'.repeat(63)}`, validParams, TEST_SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('hmac_format_invalid');
  });

  it('64文字超のhmacでhmac_format_invalidを返すこと', () => {
    const result = verifyImageToken(`${Date.now()}:${'a'.repeat(65)}`, validParams, TEST_SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('hmac_format_invalid');
  });

  it('期限切れトークンでtoken_expiredを返すこと', () => {
    // 6分前のタイムスタンプ
    const expiredTs = Date.now() - 6 * 60 * 1000;
    const params = { ...validParams, timestamp: expiredTs };
    const token = generateImageToken(params, TEST_SECRET);

    const result = verifyImageToken(token, validParams, TEST_SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('token_expired');
  });

  it('未来timestampでtoken_expiredを返すこと', () => {
    // 1分後のタイムスタンプ（未来時刻）
    const futureTs = Date.now() + 60 * 1000;
    const params = { ...validParams, timestamp: futureTs };
    const token = generateImageToken(params, TEST_SECRET);

    const result = verifyImageToken(token, validParams, TEST_SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('token_expired');
  });

  it('大文字hex（署名不一致）でhmac_format_invalidを返すこと', () => {
    const result = verifyImageToken(`${Date.now()}:${'A'.repeat(64)}`, validParams, TEST_SECRET);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('hmac_format_invalid');
  });
});
