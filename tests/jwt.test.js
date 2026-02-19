// tests/jwt.test.js
// JWT署名・検証ユーティリティのテスト
//
// テストシナリオ:
// 1. 有効なJWTの生成・検証
// 2. alg固定検証（alg: none攻撃防止）
// 3. exp必須・期限切れ
// 4. nbf検証（有効開始前トークン拒否、境界±60秒）
// 5. iat妥当性（未来のiat拒否）
// 6. 型不正（exp/nbf/iat非数値）
// 7. 署名改ざん検出
// 8. 不正フォーマット

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { signJwt, verifyJwt } from '../api/lib/jwt.js';
import crypto from 'crypto';

const SECRET = 'test-jwt-secret-key-for-unit-tests';
// 固定時刻を使用（テスト決定性を保証）
const FIXED_TIME = new Date('2026-02-19T12:00:00Z');
const now = Math.floor(FIXED_TIME.getTime() / 1000);

// テスト用Base64URLエンコードヘルパー
function base64UrlEncode(data) {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

describe('JWT ユーティリティ', () => {
  // テスト時刻を固定（境界テストの非決定性を排除）
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_TIME);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ================================================================
  // 1. 基本的な生成・検証
  // ================================================================
  describe('signJwt / verifyJwt 基本動作', () => {
    it('有効なJWTを生成・検証できること', () => {
      const payload = { sub: 'diary-admin', iat: now, exp: now + 3600 };
      const token = signJwt(payload, SECRET);

      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);

      const result = verifyJwt(token, SECRET);
      expect(result).not.toBeNull();
      expect(result.sub).toBe('diary-admin');
      expect(result.exp).toBe(now + 3600);
    });

    it('異なるシークレットで検証が失敗すること', () => {
      const payload = { sub: 'admin', iat: now, exp: now + 3600 };
      const token = signJwt(payload, SECRET);
      const result = verifyJwt(token, 'wrong-secret');
      expect(result).toBeNull();
    });
  });

  // ================================================================
  // 2. alg固定検証
  // ================================================================
  describe('alg固定検証', () => {
    it('alg: noneのトークンを拒否すること', () => {
      const header = base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }));
      const payload = base64UrlEncode(JSON.stringify({ sub: 'admin', exp: now + 3600 }));
      const token = `${header}.${payload}.`;
      expect(verifyJwt(token, SECRET)).toBeNull();
    });

    it('alg: HS384のトークンを拒否すること', () => {
      const header = base64UrlEncode(JSON.stringify({ alg: 'HS384', typ: 'JWT' }));
      const payload = base64UrlEncode(JSON.stringify({ sub: 'admin', exp: now + 3600 }));
      const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
      const token = `${header}.${payload}.${sig}`;
      expect(verifyJwt(token, SECRET)).toBeNull();
    });
  });

  // ================================================================
  // 3. exp検証
  // ================================================================
  describe('exp検証', () => {
    it('exp欠落のトークンを拒否すること', () => {
      const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = base64UrlEncode(JSON.stringify({ sub: 'admin', iat: now }));
      const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
      const token = `${header}.${payload}.${sig}`;
      expect(verifyJwt(token, SECRET)).toBeNull();
    });

    it('期限切れJWT（now - 120秒）を拒否すること', () => {
      const payload = { sub: 'admin', iat: now - 7200, exp: now - 120 };
      const token = signJwt(payload, SECRET);
      expect(verifyJwt(token, SECRET)).toBeNull();
    });

    it('clock skew範囲内（now - 30秒）のexpを受け入れること', () => {
      const payload = { sub: 'admin', iat: now - 3600, exp: now - 30 };
      const token = signJwt(payload, SECRET);
      expect(verifyJwt(token, SECRET)).not.toBeNull();
    });
  });

  // ================================================================
  // 4. nbf検証
  // ================================================================
  describe('nbf検証', () => {
    it('nbfなしのトークンを受け入れること', () => {
      const payload = { sub: 'admin', iat: now, exp: now + 3600 };
      const token = signJwt(payload, SECRET);
      expect(verifyJwt(token, SECRET)).not.toBeNull();
    });

    it('有効開始前（now + 120秒）のnbfを拒否すること', () => {
      const payload = { sub: 'admin', iat: now, nbf: now + 120, exp: now + 3600 };
      const token = signJwt(payload, SECRET);
      expect(verifyJwt(token, SECRET)).toBeNull();
    });

    it('clock skew境界（now + 60秒）のnbfを受け入れること', () => {
      const payload = { sub: 'admin', iat: now, nbf: now + 60, exp: now + 3600 };
      const token = signJwt(payload, SECRET);
      expect(verifyJwt(token, SECRET)).not.toBeNull();
    });

    it('clock skew超過（now + 61秒）のnbfを拒否すること', () => {
      const payload = { sub: 'admin', iat: now, nbf: now + 61, exp: now + 3600 };
      const token = signJwt(payload, SECRET);
      expect(verifyJwt(token, SECRET)).toBeNull();
    });
  });

  // ================================================================
  // 5. iat検証
  // ================================================================
  describe('iat検証', () => {
    it('未来のiat（now + 120秒）を拒否すること', () => {
      const payload = { sub: 'admin', iat: now + 120, exp: now + 3600 };
      const token = signJwt(payload, SECRET);
      expect(verifyJwt(token, SECRET)).toBeNull();
    });

    it('clock skew境界内のiat（now + 60秒）を受け入れること', () => {
      const payload = { sub: 'admin', iat: now + 60, exp: now + 3600 };
      const token = signJwt(payload, SECRET);
      expect(verifyJwt(token, SECRET)).not.toBeNull();
    });
  });

  // ================================================================
  // 6. 型不正検証
  // ================================================================
  describe('型不正検証', () => {
    it('exp非数値（文字列）を拒否すること', () => {
      const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = base64UrlEncode(JSON.stringify({ sub: 'admin', exp: 'not-a-number' }));
      const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
      const token = `${header}.${payload}.${sig}`;
      expect(verifyJwt(token, SECRET)).toBeNull();
    });

    it('nbf非数値（文字列）を拒否すること', () => {
      const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = base64UrlEncode(JSON.stringify({ sub: 'admin', exp: now + 3600, nbf: 'invalid' }));
      const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
      const token = `${header}.${payload}.${sig}`;
      expect(verifyJwt(token, SECRET)).toBeNull();
    });

    it('iat非数値（boolean）を拒否すること', () => {
      const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = base64UrlEncode(JSON.stringify({ sub: 'admin', exp: now + 3600, iat: true }));
      const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
      const token = `${header}.${payload}.${sig}`;
      expect(verifyJwt(token, SECRET)).toBeNull();
    });
  });

  // ================================================================
  // 7. 署名改ざん検出
  // ================================================================
  describe('署名改ざん検出', () => {
    it('ペイロード改ざんを検出すること', () => {
      const payload = { sub: 'admin', iat: now, exp: now + 3600 };
      const token = signJwt(payload, SECRET);
      const parts = token.split('.');
      // ペイロードを改ざん（expを延長）
      const tampered = base64UrlEncode(JSON.stringify({ sub: 'admin', iat: now, exp: now + 86400 }));
      const tamperedToken = `${parts[0]}.${tampered}.${parts[2]}`;
      expect(verifyJwt(tamperedToken, SECRET)).toBeNull();
    });
  });

  // ================================================================
  // 8. 不正フォーマット
  // ================================================================
  describe('不正フォーマット', () => {
    it('null入力を拒否すること', () => {
      expect(verifyJwt(null, SECRET)).toBeNull();
    });

    it('空文字列を拒否すること', () => {
      expect(verifyJwt('', SECRET)).toBeNull();
    });

    it('ドット不足（2パート）を拒否すること', () => {
      expect(verifyJwt('abc.def', SECRET)).toBeNull();
    });

    it('ドット過多（4パート）を拒否すること', () => {
      expect(verifyJwt('a.b.c.d', SECRET)).toBeNull();
    });

    it('不正なBase64URLを安全に拒否すること', () => {
      expect(verifyJwt('!!!.@@@.###', SECRET)).toBeNull();
    });

    it('数値入力を拒否すること', () => {
      expect(verifyJwt(12345, SECRET)).toBeNull();
    });
  });
});
