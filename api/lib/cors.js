// api/lib/cors.js
// CORS検証の共通ヘルパー
//
// create-diary.js と generate-image.js で同一ロジックを共有する。
// 許可Originの構築、検証、ヘッダー設定、OPTIONSプリフライト処理を一元管理。

/**
 * CORS検証を実行する
 * @param {object} req - リクエストオブジェクト
 * @param {object} res - レスポンスオブジェクト
 * @param {object} options - オプション
 * @param {string} options.allowHeaders - 許可するヘッダー（デフォルト: 'Content-Type'）
 * @returns {boolean|undefined} true: リクエスト処理済み（呼び出し元はreturnすべき）、undefined: 続行OK
 */
export function handleCors(req, res, options = {}) {
  const allowHeaders = options.allowHeaders || 'Content-Type';

  // 許可Originリスト（Vercelドメインのみ）
  const allowedOrigins = [
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null
  ].filter(Boolean);

  const origin = req.headers.origin;

  // Origin必須化（ブラウザ以外を拒否）
  if (req.method !== 'OPTIONS' && !origin) {
    res.status(403).json({
      error: 'アクセスが拒否されました。ブラウザからアクセスしてください。'
    });
    return true;
  }

  // 非許可Originを拒否
  if (req.method !== 'OPTIONS' && origin && !allowedOrigins.includes(origin)) {
    res.status(403).json({
      error: 'アクセスが拒否されました。許可されたドメインからアクセスしてください。'
    });
    return true;
  }

  // 許可Originのヘッダー設定
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', allowHeaders);

  // OPTIONSプリフライト処理
  if (req.method === 'OPTIONS') {
    if (origin && !allowedOrigins.includes(origin)) {
      res.status(403).json({ error: 'アクセスが拒否されました。' });
      return true;
    }
    res.status(200).end();
    return true;
  }

  return false;
}
