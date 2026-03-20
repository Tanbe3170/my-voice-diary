// lib/image-token.js
// HMAC署名生成・検証共通ユーティリティ
//
// create-diary.js と generate-image.js 間のペイロード不一致リスクを
// 構造的に排除するため、HMAC計算ロジックをこのモジュールに共通化する。

import crypto from 'crypto';

/**
 * imageToken用のHMACペイロードを構築する（create/generate共通）
 * 全パラメータは呼び出し元で必須検証済みであること（デフォルト補完なし）
 * @param {object} params
 * @param {string} params.date - 日付（YYYY-MM-DD）
 * @param {string} [params.filePath] - 日記ファイルパス
 * @param {string} [params.characterId] - キャラクターID
 * @param {string} [params.mode] - モード
 * @param {string} params.styleId - スタイルID（必須）
 * @param {string|number} params.timestamp - タイムスタンプ（必須）
 * @returns {string} HMAC署名用ペイロード文字列
 * @throws {Error} 必須パラメータ（date, styleId, timestamp）が欠落時
 */
export function buildTokenPayload({ date, filePath, characterId, mode, styleId, timestamp }) {
  if (!date || !styleId || !timestamp) {
    throw new Error('buildTokenPayload: date, styleId, timestamp are required');
  }
  const parts = [date];
  if (filePath) parts.push(filePath);
  parts.push(characterId || '', mode || 'normal', styleId, String(timestamp));
  return parts.join(':');
}

/**
 * imageTokenを生成する
 * @param {object} params - buildTokenPayloadと同じパラメータ
 * @param {string} secret - HMAC署名キー
 * @returns {string} "timestamp:hmac" 形式のトークン
 */
export function generateImageToken(params, secret) {
  const payload = buildTokenPayload(params);
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${params.timestamp}:${hmac}`;
}

/**
 * imageTokenの検証（fail-closed設計）
 *
 * 検証手順:
 * 1. imageToken形式検証: "timestamp:hmac" 形式であること
 * 2. timestamp: 数値文字列であること
 * 3. hmac: 64文字のhex文字列であること（SHA-256）
 * 4. TTL検証: 5分以内であること
 * 5. HMAC再計算 + timingSafeEqual比較
 *
 * 異常系はすべて { valid: false, reason } を返す（例外を外に出さない）
 * @param {*} imageToken - 検証対象のトークン
 * @param {object} params - buildTokenPayloadと同じパラメータ（timestampはトークンから取得するため不要）
 * @param {string} secret - HMAC署名キー
 * @returns {{ valid: boolean, reason?: string, timestamp?: number }}
 */
export function verifyImageToken(imageToken, params, secret) {
  // 1. 形式検証
  if (typeof imageToken !== 'string') {
    return { valid: false, reason: 'token_not_string' };
  }
  const colonIdx = imageToken.indexOf(':');
  if (colonIdx === -1) {
    return { valid: false, reason: 'token_format_invalid' };
  }
  const tsStr = imageToken.slice(0, colonIdx);
  const providedHmac = imageToken.slice(colonIdx + 1);

  // 2. timestamp検証
  const ts = Number(tsStr);
  if (!Number.isFinite(ts) || ts <= 0) {
    return { valid: false, reason: 'timestamp_invalid' };
  }

  // 3. hmac形式検証（SHA-256 = 64文字hex）
  if (!/^[0-9a-f]{64}$/.test(providedHmac)) {
    return { valid: false, reason: 'hmac_format_invalid' };
  }

  // 4. TTL検証（5分 = 300,000ms、未来時刻も拒否）
  const age = Date.now() - ts;
  if (age < 0 || age > 300_000) {
    return { valid: false, reason: 'token_expired' };
  }

  // 5. HMAC再計算 + timingSafeEqual
  try {
    const payload = buildTokenPayload({ ...params, timestamp: tsStr });
    const expectedHmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const valid = crypto.timingSafeEqual(
      Buffer.from(providedHmac, 'hex'),
      Buffer.from(expectedHmac, 'hex')
    );
    return { valid, timestamp: ts, reason: valid ? undefined : 'hmac_mismatch' };
  } catch {
    return { valid: false, reason: 'verification_error' };
  }
}
