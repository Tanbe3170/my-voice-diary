// api/lib/jwt.js
// JWT署名・検証ユーティリティ（Node.js標準crypto使用、外部依存なし）
//
// HS256（HMAC-SHA256）アルゴリズム
// セキュリティ要件:
// - alg固定検証（alg: none攻撃防止）
// - exp必須・数値型必須
// - nbf/iat: 存在する場合のみ数値型必須
// - clock skew: ±60秒許容
// - timingSafeEqual（タイミング攻撃対策）

import crypto from 'crypto';

// clock skew許容（秒）
const CLOCK_SKEW = 60;

/**
 * Base64URLエンコード
 * @param {string} data - エンコード対象の文字列
 * @returns {string} Base64URL文字列
 */
function base64UrlEncode(data) {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Base64URLデコード
 * @param {string} str - Base64URL文字列
 * @returns {string} デコード後の文字列
 */
function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf-8');
}

/**
 * JWT生成（HS256）
 * @param {object} payload - JWTペイロード（sub, iat, exp等）
 * @param {string} secret - 署名用シークレット
 * @returns {string} JWT文字列
 */
export function signJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * JWT検証（HS256、timingSafeEqual使用）
 *
 * 検証項目:
 * 1. フォーマット（3パート）
 * 2. alg === 'HS256'
 * 3. 署名（HMAC-SHA256 + timingSafeEqual）
 * 4. exp: 必須・数値型・期限内（clock skew適用）
 * 5. nbf: 存在時は数値型・有効開始後（clock skew適用）
 * 6. iat: 存在時は数値型・未来でない（clock skew適用）
 *
 * @param {string} token - JWT文字列
 * @param {string} secret - 署名用シークレット
 * @returns {object|null} 検証成功時はペイロード、失敗時はnull
 */
export function verifyJwt(token, secret) {
  // フォーマット検証
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;

  // ヘッダー検証（alg固定）
  let header;
  try {
    header = JSON.parse(base64UrlDecode(headerB64));
  } catch {
    return null;
  }
  if (!header || header.alg !== 'HS256') return null;

  // 署名検証（タイミング攻撃対策）
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  const sigBuf = Buffer.from(signatureB64, 'base64url');
  const expectedBuf = Buffer.from(expectedSig, 'base64url');

  if (sigBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  // ペイロードデコード
  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch {
    return null;
  }

  if (!payload || typeof payload !== 'object') return null;

  const now = Math.floor(Date.now() / 1000);

  // exp: 必須・数値型必須
  if (payload.exp === undefined || payload.exp === null) return null;
  if (typeof payload.exp !== 'number') return null;
  if (payload.exp <= now - CLOCK_SKEW) return null;

  // nbf: 存在する場合のみ数値型必須
  if (payload.nbf !== undefined && payload.nbf !== null) {
    if (typeof payload.nbf !== 'number') return null;
    if (payload.nbf > now + CLOCK_SKEW) return null;
  }

  // iat: 存在する場合のみ数値型必須
  if (payload.iat !== undefined && payload.iat !== null) {
    if (typeof payload.iat !== 'number') return null;
    if (payload.iat > now + CLOCK_SKEW) return null;
  }

  return payload;
}
