// api/create-memo.js
// Vercel Serverless Function - アイデアメモキャプチャAPI
//
// iPhoneからアイデアやメモを素早くキャプチャし、
// GitHub APIを通じて .company/secretary/inbox/ に保存する。
//
// セキュリティ機能:
// 1. CORS設定（共通ヘルパー: lib/cors.js）
// 2. JWT認証（JWTのみ、AUTH_TOKENフォールバックなし）
// 3. Upstash Redis永続レート制限（50req/日、IPベース）
// 4. 入力検証（text: 必須1-5000文字、tag: 任意1-50文字）
// 5. GitHub API連携（既存ファイル追記 or テンプレートから新規作成）
//
// 外部API（Claude/DALL-E）は一切呼ばない。GitHub APIのみ。

import { isIP } from 'net';
import { handleCors } from '../lib/cors.js';
import { verifyJwt } from '../lib/jwt.js';

export default async function handler(req, res) {
  // ===================================================================
  // 1. CORS設定（共通ヘルパー使用）
  // ===================================================================

  if (handleCors(req, res, { allowHeaders: 'Content-Type, X-Auth-Token' })) {
    return;
  }

  // ===================================================================
  // 2. メソッド検証（POSTのみ）
  // ===================================================================

  if (req.method !== 'POST') {
    return res.status(405).json({ error: '許可されていないメソッドです。' });
  }

  try {
    // ===================================================================
    // 3. Content-Type検証
    // ===================================================================

    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      return res.status(400).json({ error: '不正なリクエスト形式です。' });
    }

    // ===================================================================
    // 4. JWT認証（JWTのみ、AUTH_TOKENフォールバックなし）
    // ===================================================================

    const authToken = req.headers['x-auth-token'];
    const JWT_SECRET = process.env.JWT_SECRET;

    if (!JWT_SECRET) {
      console.error('JWT_SECRET環境変数が未設定');
      return res.status(500).json({ error: 'サーバー設定エラー' });
    }

    const jwtPayload = authToken ? verifyJwt(authToken, JWT_SECRET) : null;
    if (!jwtPayload || jwtPayload.sub !== 'diary-admin') {
      return res.status(401).json({
        error: '認証に失敗しました。有効なJWTトークンが必要です。'
      });
    }

    // ===================================================================
    // 5. 入力バリデーション
    // ===================================================================

    const { text, tag } = req.body;

    // text: 必須、string型、1-5000文字
    if (text === undefined || text === null) {
      return res.status(400).json({ error: 'テキストが必要です。' });
    }
    if (typeof text !== 'string') {
      return res.status(400).json({ error: 'テキストの形式が不正です。' });
    }
    if (text.length < 1 || text.length > 5000) {
      return res.status(400).json({ error: 'テキストは1〜5000文字で入力してください。' });
    }

    // tag: 任意、string型、1-50文字
    if (tag !== undefined && tag !== null) {
      if (typeof tag !== 'string') {
        return res.status(400).json({ error: 'タグの形式が不正です。' });
      }
      if (tag.length < 1 || tag.length > 50) {
        return res.status(400).json({ error: 'タグは1〜50文字で入力してください。' });
      }
    }

    // ===================================================================
    // 6. 環境変数チェック（fail-closed）
    // ===================================================================

    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_OWNER = process.env.GITHUB_OWNER;
    const GITHUB_REPO = process.env.GITHUB_REPO;
    const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
    const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO ||
        !UPSTASH_URL || !UPSTASH_TOKEN) {
      console.error('環境変数が未設定:', {
        GITHUB_TOKEN: !!GITHUB_TOKEN,
        GITHUB_OWNER: !!GITHUB_OWNER,
        GITHUB_REPO: !!GITHUB_REPO,
        UPSTASH_REDIS_REST_URL: !!UPSTASH_URL,
        UPSTASH_REDIS_REST_TOKEN: !!UPSTASH_TOKEN
      });
      return res.status(500).json({ error: 'サーバーの設定に問題があります。' });
    }

    // ===================================================================
    // 7. Upstash Redis永続レート制限（50req/日、IPベース）
    // ===================================================================

    const rawIP = (req.headers['x-vercel-forwarded-for']?.split(',')[0].trim() ||
                   req.headers['x-forwarded-for']?.split(',')[0].trim() ||
                   req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
    const clientIP = isIP(rawIP) !== 0 ? rawIP : 'unknown';

    const todayISO = new Date().toISOString().split('T')[0];
    const rateKey = `memo_rate:${clientIP}:${todayISO}`;

    // fail-closed: Redis障害時はGitHub APIに進まず500を返す
    let rateCount;
    try {
      const countRes = await fetch(`${UPSTASH_URL}/incr/${encodeURIComponent(rateKey)}`, {
        headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}` },
        signal: AbortSignal.timeout(5000)
      });

      if (!countRes.ok) {
        console.error('Upstash incr HTTPエラー:', countRes.status);
        return res.status(500).json({
          error: 'サーバーの一時的なエラーです。しばらくしてから再度お試しください。'
        });
      }

      const countData = await countRes.json();
      rateCount = countData.result;

      if (!Number.isInteger(rateCount) || rateCount < 1) {
        console.error('Upstash incr不正レスポンス:', countData);
        return res.status(500).json({
          error: 'サーバーの一時的なエラーです。しばらくしてから再度お試しください。'
        });
      }
    } catch (redisError) {
      console.error('Upstash接続エラー:', redisError);
      return res.status(500).json({
        error: 'サーバーの一時的なエラーです。しばらくしてから再度お試しください。'
      });
    }

    if (rateCount === 1) {
      // 初回: TTL設定（24時間）- fail-closed: TTL未設定なら500
      try {
        const expireRes = await fetch(`${UPSTASH_URL}/expire/${encodeURIComponent(rateKey)}/86400`, {
          headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}` },
          signal: AbortSignal.timeout(5000)
        });
        if (!expireRes.ok) {
          console.error('Upstash expire HTTPエラー:', expireRes.status);
          return res.status(500).json({
            error: 'サーバーの一時的なエラーです。しばらくしてから再度お試しください。'
          });
        }
      } catch (expireError) {
        console.error('Upstash expire接続エラー:', expireError);
        return res.status(500).json({
          error: 'サーバーの一時的なエラーです。しばらくしてから再度お試しください。'
        });
      }
    }

    if (rateCount > 50) {
      return res.status(429).json({
        error: '本日のメモ保存回数の上限（50回）に達しました。明日再度お試しください。'
      });
    }

    // ===================================================================
    // 8. JSTタイムスタンプ生成
    // ===================================================================

    const now = new Date();
    const jstFormatter = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const jstParts = jstFormatter.formatToParts(now);
    const jstYear = jstParts.find(p => p.type === 'year').value;
    const jstMonth = jstParts.find(p => p.type === 'month').value;
    const jstDay = jstParts.find(p => p.type === 'day').value;
    const jstHour = jstParts.find(p => p.type === 'hour').value;
    const jstMinute = jstParts.find(p => p.type === 'minute').value;

    const jstDate = `${jstYear}-${jstMonth}-${jstDay}`;
    const jstTime = `${jstHour}:${jstMinute}`;

    // ===================================================================
    // 9. GitHub API連携（既存ファイル追記 or テンプレートから新規作成）
    // ===================================================================

    const filePath = `.company/secretary/inbox/${jstDate}.md`;
    const githubApiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;

    // メモ行を構築
    const memoLine = tag
      ? `- **${jstTime}** | [${tag}] ${text}`
      : `- **${jstTime}** | ${text}`;

    // 既存ファイルの取得を試みる
    let existingSha = null;
    let newContent;

    try {
      const getRes = await fetch(githubApiUrl, {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        },
        signal: AbortSignal.timeout(5000)
      });

      if (getRes.ok) {
        // 既存ファイルがある → 追記
        const fileData = await getRes.json();
        existingSha = fileData.sha;
        const existingContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
        // 末尾に改行がない場合は追加
        const separator = existingContent.endsWith('\n') ? '' : '\n';
        newContent = existingContent + separator + memoLine + '\n';
      } else if (getRes.status === 404) {
        // ファイルが存在しない → テンプレートから新規作成
        newContent = `---\ndate: "${jstDate}"\ntype: inbox\n---\n\n# Inbox - ${jstDate}\n\n## キャプチャ\n\n${memoLine}\n`;
      } else {
        console.error('GitHub GET HTTPエラー:', getRes.status);
        return res.status(500).json({
          error: 'GitHub APIの呼び出しに失敗しました。'
        });
      }
    } catch (githubGetError) {
      console.error('GitHub GET接続エラー:', githubGetError);
      return res.status(500).json({
        error: 'GitHub APIの呼び出しに失敗しました。'
      });
    }

    // ファイルをPUT（作成 or 更新）
    let githubUrl;
    try {
      const putBody = {
        message: `memo: ${jstDate} ${jstTime} アイデアメモ追加`,
        content: Buffer.from(newContent, 'utf-8').toString('base64')
      };
      if (existingSha) {
        putBody.sha = existingSha;
      }

      const putRes = await fetch(githubApiUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(putBody),
        signal: AbortSignal.timeout(10000)
      });

      if (!putRes.ok) {
        const putError = await putRes.json().catch(() => ({}));
        console.error('GitHub PUT HTTPエラー:', putRes.status, putError);
        return res.status(500).json({
          error: 'メモの保存に失敗しました。'
        });
      }

      const putData = await putRes.json();
      githubUrl = putData.content?.html_url || `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/main/${filePath}`;
    } catch (githubPutError) {
      console.error('GitHub PUT接続エラー:', githubPutError);
      return res.status(500).json({
        error: 'メモの保存に失敗しました。'
      });
    }

    // ===================================================================
    // 10. 成功レスポンス
    // ===================================================================

    return res.status(200).json({
      success: true,
      filePath,
      timestamp: jstTime,
      githubUrl
    });

  } catch (error) {
    console.error('サーバーエラー:', error);
    return res.status(500).json({
      error: 'メモ保存中にエラーが発生しました。しばらくしてから再度お試しください。'
    });
  }
}
