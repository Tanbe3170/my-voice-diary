// lib/owl-api.js
// owl-encyclopedia Webhook クライアント
//
// diary のリサーチデータを owl-encyclopedia に送信する。
// fail-open 設計: すべてのエラーを吸収し null を返却する。

import crypto from 'crypto';

/**
 * owl-encyclopedia にリサーチデータを Webhook 送信する
 * @param {object} researchData - Claude API の構造化出力（snake_case）
 * @param {string} sourceUrl - GitHub 上のリサーチファイル URL
 * @returns {Promise<object|null>} 成功時はレスポンスJSON、失敗時は null
 */
export async function sendToOwlEncyclopedia(researchData, sourceUrl) {
  const OWL_API_URL = process.env.OWL_API_URL;

  // OWL_API_URL 未設定 → サイレントスキップ（開発環境向け）
  if (!OWL_API_URL) {
    return null;
  }

  const OWL_WEBHOOK_SECRET = process.env.OWL_WEBHOOK_SECRET;
  if (!OWL_WEBHOOK_SECRET) {
    console.error('OWL_WEBHOOK_SECRET が未設定です（OWL_API_URL は設定済み）');
    return null;
  }

  try {
    // ペイロード構築（snake_case → camelCase 変換）
    const payload = {
      title: researchData.title,
      slug: researchData.slug,
      topic: researchData.topic,
      category: researchData.category.toUpperCase(),  // "dinosaur" → "DINOSAUR"
      summary: researchData.summary,
      keyPoints: researchData.key_points,              // snake_case → camelCase
      body: researchData.body,
      sources: researchData.sources,
      tags: researchData.tags,
      sourceUrl,
    };

    const bodyStr = JSON.stringify(payload);

    // HMAC-SHA256 署名生成
    // 形式: HMAC-SHA256(secret, timestamp + "." + body) → hex lowercase
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = crypto
      .createHmac('sha256', OWL_WEBHOOK_SECRET)
      .update(timestamp + '.' + bodyStr)
      .digest('hex');

    // Webhook 送信（8秒タイムアウト）
    const response = await fetch(
      `${OWL_API_URL}/api/v1/webhooks/diary-research`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Timestamp': timestamp,
          'X-Webhook-Signature': signature,
        },
        body: bodyStr,
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => '(読み取り不可)');
      console.error(`owl-encyclopedia Webhook エラー: ${response.status} ${errorText}`);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error('owl-encyclopedia Webhook 送信失敗（無視）:', err.message);
    return null;
  }
}
