// api/post-instagram.js
// Vercel Serverless Function - Instagram自動投稿API（Phase 5）
//
// 日記作成・画像生成後にInstagram Graph APIで自動投稿する。
//
// セキュリティ機能:
// 1. CORS設定（共通ヘルパー: api/lib/cors.js）
// 2. JWT認証（JWTのみ、AUTH_TOKENフォールバックなし）
// 3. Upstash Redis永続レート制限（5req/日、IPベース）
// 4. 重複投稿防止（Redis SETNX/GETで冪等性保証）
// 5. 入力検証（date: YYYY-MM-DD、caption: 最大2200文字）
// 6. 動的タイムアウト（25秒デッドライン、getRemainingTimeout）
// 7. エラーハンドリング（try/finallyでロック解放保証）

import { isIP } from 'net';
import { handleCors } from './lib/cors.js';
import { verifyJwt } from './lib/jwt.js';

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

    const { date, caption } = req.body;

    if (!date) {
      return res.status(400).json({ error: '必要なパラメータが不足しています。' });
    }

    // date形式検証（YYYY-MM-DD）
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: '日付の形式が不正です。' });
    }

    // 日付の意味的妥当性検証
    const parsedDate = new Date(date + 'T00:00:00Z');
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ error: '日付の形式が不正です。' });
    }
    const reformatted = parsedDate.toISOString().split('T')[0];
    if (reformatted !== date) {
      return res.status(400).json({ error: '日付の形式が不正です。' });
    }

    // caption検証（任意パラメータ、最大2200文字）
    if (caption !== undefined && caption !== null) {
      if (typeof caption !== 'string') {
        return res.status(400).json({ error: 'キャプションの形式が不正です。' });
      }
      if (caption.length > 2200) {
        return res.status(400).json({
          error: 'キャプションが長すぎます（最大2200文字）。'
        });
      }
    }

    // ===================================================================
    // 6. 環境変数チェック（fail-closed）
    // ===================================================================

    const IG_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
    const IG_ACCOUNT_ID = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_OWNER = process.env.GITHUB_OWNER;
    const GITHUB_REPO = process.env.GITHUB_REPO;
    const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
    const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!IG_ACCESS_TOKEN || !IG_ACCOUNT_ID || !GITHUB_TOKEN ||
        !GITHUB_OWNER || !GITHUB_REPO || !UPSTASH_URL || !UPSTASH_TOKEN) {
      console.error('環境変数が未設定:', {
        INSTAGRAM_ACCESS_TOKEN: !!IG_ACCESS_TOKEN,
        INSTAGRAM_BUSINESS_ACCOUNT_ID: !!IG_ACCOUNT_ID,
        GITHUB_TOKEN: !!GITHUB_TOKEN,
        GITHUB_OWNER: !!GITHUB_OWNER,
        GITHUB_REPO: !!GITHUB_REPO,
        UPSTASH_REDIS_REST_URL: !!UPSTASH_URL,
        UPSTASH_REDIS_REST_TOKEN: !!UPSTASH_TOKEN
      });
      return res.status(500).json({ error: 'サーバーの設定に問題があります。' });
    }

    // ===================================================================
    // 7. Upstash Redis永続レート制限（5req/日、IPベース）
    // ===================================================================

    // IP取得の信頼境界: x-vercel-forwarded-forを最優先
    const rawIP = (req.headers['x-vercel-forwarded-for']?.split(',')[0].trim() ||
                   req.headers['x-forwarded-for']?.split(',')[0].trim() ||
                   req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
    const clientIP = isIP(rawIP) !== 0 ? rawIP : 'unknown';

    const todayISO = new Date().toISOString().split('T')[0];
    const rateKey = `ig_rate:${clientIP}:${todayISO}`;

    // fail-closed: Redis障害時はInstagram APIに進まず500を返す
    let rateCount;
    try {
      const countRes = await fetch(`${UPSTASH_URL}/incr/${encodeURIComponent(rateKey)}`, {
        headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}` }
      });

      if (!countRes.ok) {
        console.error('Upstash incr HTTPエラー:', countRes.status);
        return res.status(500).json({
          error: 'サーバーの一時的なエラーです。しばらくしてから再度お試しください。'
        });
      }

      const countData = await countRes.json();
      rateCount = countData.result;

      // レスポンス値の型検証（INCRは必ず1以上の整数を返す）
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
      // 初回: TTL設定（24時間）
      try {
        const expireRes = await fetch(`${UPSTASH_URL}/expire/${encodeURIComponent(rateKey)}/86400`, {
          headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}` }
        });
        if (!expireRes.ok) {
          console.error('Upstash expire HTTPエラー:', expireRes.status);
        }
      } catch (expireError) {
        console.error('Upstash expire接続エラー:', expireError);
      }
    }

    if (rateCount > 5) {
      return res.status(429).json({
        error: '本日のInstagram投稿回数の上限（5回）に達しました。明日再度お試しください。'
      });
    }

    // ===================================================================
    // 8. 重複投稿防止（冪等性保証）
    // ===================================================================

    const postedKey = `ig_posted:${date}`;
    const lockKey = `ig_lock:${date}`;

    // 既投稿チェック: ig_posted:{date}にpostIdが保存されていれば即返却
    try {
      const postedRes = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(postedKey)}`, {
        headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}` }
      });
      if (!postedRes.ok) {
        // HTTP障害 → fail-closed（500）
        console.error('Upstash既投稿チェックHTTPエラー:', postedRes.status);
        return res.status(500).json({
          error: 'サーバーの一時的なエラーです。しばらくしてから再度お試しください。'
        });
      }
      const postedData = await postedRes.json();
      if (postedData.result) {
        return res.status(200).json({
          success: true,
          postId: postedData.result,
          alreadyPosted: true,
          message: 'この日付の日記は既にInstagramに投稿済みです。'
        });
      }
    } catch (checkError) {
      console.error('Upstash既投稿チェックエラー:', checkError);
      return res.status(500).json({
        error: 'サーバーの一時的なエラーです。しばらくしてから再度お試しください。'
      });
    }

    // ロック取得: SETNX（TTL 60秒）で排他制御
    let lockAcquired = false;
    try {
      const lockRes = await fetch(
        `${UPSTASH_URL}/set/${encodeURIComponent(lockKey)}/1/EX/60/NX`,
        { headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}` } }
      );
      if (!lockRes.ok) {
        // HTTP障害 → fail-closed（500）
        console.error('Upstashロック取得HTTPエラー:', lockRes.status);
        return res.status(500).json({
          error: 'サーバーの一時的なエラーです。しばらくしてから再度お試しください。'
        });
      }
      const lockData = await lockRes.json();
      lockAcquired = lockData.result === 'OK';
    } catch (lockError) {
      console.error('Upstashロック取得エラー:', lockError);
      return res.status(500).json({
        error: 'サーバーの一時的なエラーです。しばらくしてから再度お試しください。'
      });
    }

    if (!lockAcquired) {
      return res.status(409).json({
        error: 'この日付の投稿処理が既に実行中です。しばらくしてから再度お試しください。'
      });
    }

    // ===================================================================
    // 9. 実行デッドライン設定（25秒）
    // ===================================================================

    const deadline = Date.now() + 25_000;

    /**
     * 残り時間を計算し、マージン不足なら null を返す
     * @param {number} margin - 安全マージン（ミリ秒）
     * @returns {number|null} 残りミリ秒、またはマージン不足時は null
     */
    function getRemainingTimeout(margin = 2000) {
      const remaining = deadline - Date.now() - margin;
      return remaining > 0 ? remaining : null;
    }

    // try/finally: 成功・失敗・例外問わず必ずロック解放
    try {
      // ===================================================================
      // 10. GitHubから日記ファイルを取得
      // ===================================================================

      const remaining10 = getRemainingTimeout();
      if (remaining10 === null) {
        return res.status(504).json({ error: '処理時間が不足しています。' });
      }

      const year = date.split('-')[0];
      const month = date.split('-')[1];
      const diaryPath = `diaries/${year}/${month}/${date}.md`;
      const diaryApiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${diaryPath}`;

      const diaryResponse = await fetch(diaryApiUrl, {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        },
        signal: AbortSignal.timeout(Math.min(5000, remaining10))
      });

      if (!diaryResponse.ok) {
        console.error('日記ファイル取得失敗:', diaryResponse.status);
        return res.status(404).json({ error: '指定された日付の日記が見つかりません。' });
      }

      const diaryFile = await diaryResponse.json();
      const diaryContent = Buffer.from(diaryFile.content, 'base64').toString('utf-8');

      // YAML Front Matterからtitle, tags, summaryを抽出
      const frontMatterMatch = diaryContent.match(/^---\s*\n([\s\S]*?)\n---/);
      if (!frontMatterMatch) {
        return res.status(400).json({ error: '日記ファイルの形式が不正です。' });
      }

      const frontMatter = frontMatterMatch[1];
      const titleMatch = frontMatter.match(/title:\s*"((?:[^"\\]|\\.)*)"/);
      const tagsMatch = frontMatter.match(/tags:\s*\[([^\]]*)\]/);

      const title = titleMatch ? titleMatch[1].replace(/\\"/g, '"') : '';

      // タグ抽出
      let tags = [];
      if (tagsMatch) {
        tags = tagsMatch[1].split(',').map(t => t.trim()).filter(Boolean);
      }

      // サマリー抽出（### サマリー セクション）
      const summaryMatch = diaryContent.match(/###\s*サマリー\s*\n([\s\S]*?)(?:\n---|\n###|\n$)/);
      const summary = summaryMatch ? summaryMatch[1].trim() : '';

      // ===================================================================
      // 11. 画像URL構築 + 存在確認
      // ===================================================================

      const remaining11 = getRemainingTimeout();
      if (remaining11 === null) {
        return res.status(504).json({ error: '処理時間が不足しています。' });
      }

      const imagePath = `docs/images/${date}.png`;
      const imageUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/${imagePath}`;

      const headResponse = await fetch(imageUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(Math.min(5000, remaining11))
      });

      if (!headResponse.ok) {
        return res.status(404).json({
          error: '画像が見つかりません。先に画像を生成してください。'
        });
      }

      // ===================================================================
      // 12. キャプション生成
      // ===================================================================

      let finalCaption;
      if (caption) {
        finalCaption = caption;
      } else {
        // 自動生成: タイトル + サマリー + タグ
        const parts = [];
        if (title) parts.push(title);
        if (summary) parts.push(`\n\n${summary}`);
        if (tags.length > 0) {
          // タグをハッシュタグ化（既に#付きならそのまま）
          const hashtags = tags.map(t => t.startsWith('#') ? t : `#${t}`);
          parts.push(`\n\n${hashtags.join(' ')}`);
        }
        parts.push('\n\n#日記 #VoiceDiary #AI日記');
        finalCaption = parts.join('');
      }

      // 2200文字制限（Instagramの上限）
      if (finalCaption.length > 2200) {
        finalCaption = finalCaption.substring(0, 2197) + '...';
      }

      // ===================================================================
      // 13. Instagram Container Creation
      // ===================================================================

      const remaining13 = getRemainingTimeout();
      if (remaining13 === null) {
        return res.status(504).json({ error: '処理時間が不足しています。' });
      }

      const containerParams = new URLSearchParams({
        image_url: imageUrl,
        caption: finalCaption,
      });

      const containerResponse = await fetch(
        `https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/media`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Bearer ${IG_ACCESS_TOKEN}`
          },
          body: containerParams.toString(),
          signal: AbortSignal.timeout(Math.min(8000, remaining13))
        }
      );

      if (!containerResponse.ok) {
        const containerError = await containerResponse.json().catch(() => ({}));
        console.error('Instagram Container作成エラー:', containerError);

        // トークン無効/期限切れの検出
        const errorCode = containerError?.error?.code;
        if (errorCode === 190 || errorCode === 102) {
          return res.status(401).json({
            error: 'Instagramアクセストークンが無効または期限切れです。トークンをリフレッシュしてください。'
          });
        }

        throw new Error('Instagram Container作成に失敗しました。');
      }

      const containerData = await containerResponse.json();
      const containerId = containerData.id;

      if (!containerId) {
        console.error('Container IDが取得できません:', containerData);
        throw new Error('Instagram Container IDの取得に失敗しました。');
      }

      // ===================================================================
      // 14. Status Polling（最大5回、2秒間隔）
      // ===================================================================

      let containerReady = false;
      for (let i = 0; i < 5; i++) {
        const remainingPoll = getRemainingTimeout();
        if (remainingPoll === null) {
          return res.status(504).json({
            error: '投稿処理がタイムアウトしました。しばらくしてから再度お試しください。'
          });
        }

        // 2秒待機
        await new Promise(resolve => setTimeout(resolve, 2000));

        const statusResponse = await fetch(
          `https://graph.facebook.com/v21.0/${containerId}?fields=status_code`,
          {
            headers: { 'Authorization': `Bearer ${IG_ACCESS_TOKEN}` },
            signal: AbortSignal.timeout(Math.min(3000, remainingPoll))
          }
        );

        if (!statusResponse.ok) {
          console.error('Instagram Statusチェックエラー:', statusResponse.status);
          continue;
        }

        const statusData = await statusResponse.json();
        const statusCode = statusData.status_code;

        if (statusCode === 'FINISHED') {
          containerReady = true;
          break;
        }

        if (statusCode === 'ERROR') {
          console.error('Instagram Container処理エラー:', statusData);
          throw new Error('Instagramの画像処理でエラーが発生しました。');
        }

        // IN_PROGRESS: 次のポーリングへ
      }

      if (!containerReady) {
        return res.status(504).json({
          error: 'Instagramの画像処理がタイムアウトしました。しばらくしてから再度お試しください。'
        });
      }

      // ===================================================================
      // 15. Media Publish
      // ===================================================================

      const remaining15 = getRemainingTimeout();
      if (remaining15 === null) {
        return res.status(504).json({ error: '処理時間が不足しています。' });
      }

      const publishParams = new URLSearchParams({
        creation_id: containerId,
      });

      const publishResponse = await fetch(
        `https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/media_publish`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Bearer ${IG_ACCESS_TOKEN}`
          },
          body: publishParams.toString(),
          signal: AbortSignal.timeout(Math.min(8000, remaining15))
        }
      );

      if (!publishResponse.ok) {
        const publishError = await publishResponse.json().catch(() => ({}));
        console.error('Instagram Publishエラー:', publishError);
        throw new Error('Instagramへの投稿に失敗しました。');
      }

      const publishData = await publishResponse.json();
      const postId = publishData.id;

      if (!postId) {
        console.error('Post IDが取得できません:', publishData);
        throw new Error('Instagram Post IDの取得に失敗しました。');
      }

      // ===================================================================
      // 16. 投稿成功: Redis に postId をキャッシュ（無期限保存）
      // ===================================================================

      try {
        // TTLなし（無期限保存）: 同一日付の再投稿を永続的に防止
        await fetch(
          `${UPSTASH_URL}/set/${encodeURIComponent(postedKey)}/${encodeURIComponent(postId)}`,
          { headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}` } }
        );
      } catch (cacheError) {
        // キャッシュ失敗は投稿成功に影響しない（ログのみ）
        console.error('Upstash投稿キャッシュ保存エラー:', cacheError);
      }

      // ===================================================================
      // 17. 成功レスポンス
      // ===================================================================

      return res.status(200).json({
        success: true,
        postId,
        message: 'Instagramへの投稿が完了しました。'
      });

    } finally {
      // ===================================================================
      // ロック解放（成功・失敗・例外問わず必ず実行）
      // ===================================================================
      try {
        await fetch(`${UPSTASH_URL}/del/${encodeURIComponent(lockKey)}`, {
          headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}` }
        });
      } catch (unlockError) {
        console.error('Upstashロック解放エラー:', unlockError);
      }
    }

  } catch (error) {
    console.error('サーバーエラー:', error);
    return res.status(500).json({
      error: 'Instagram投稿中にエラーが発生しました。しばらくしてから再度お試しください。'
    });
  }
}
