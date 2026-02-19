// api/generate-image.js
// Vercel Serverless Function - AI画像生成API（Phase 4）
//
// 日記作成後にDALL-E 3で画像を生成し、GitHubリポジトリに保存する。
//
// セキュリティ機能:
// 1. CORS設定（共通ヘルパー: api/lib/cors.js）
// 2. HMAC署名付きトークン認証（IMAGE_TOKEN_SECRET、AUTH_TOKENは使用しない）
// 3. Upstash Redis永続レート制限（10req/日、IPベース）
// 4. 入力検証（date: YYYY-MM-DD、imagePromptはサーバー側取得）
// 5. エラーハンドリング（汎用エラーのみ返却）

import crypto from 'crypto';
import { isIP } from 'net';
import { handleCors } from './lib/cors.js';

export default async function handler(req, res) {
  // ===================================================================
  // 1. CORS設定（共通ヘルパー使用）
  // ===================================================================

  if (handleCors(req, res)) {
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
    // 4. 環境変数チェック（fail-closed）
    // ===================================================================

    const IMAGE_SECRET = process.env.IMAGE_TOKEN_SECRET;
    if (!IMAGE_SECRET) {
      console.error('IMAGE_TOKEN_SECRET環境変数が未設定');
      return res.status(500).json({ error: 'サーバー設定エラー' });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_OWNER = process.env.GITHUB_OWNER;
    const GITHUB_REPO = process.env.GITHUB_REPO;
    const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
    const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!OPENAI_API_KEY || !GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO ||
        !UPSTASH_URL || !UPSTASH_TOKEN) {
      console.error('環境変数が未設定:', {
        OPENAI_API_KEY: !!OPENAI_API_KEY,
        GITHUB_TOKEN: !!GITHUB_TOKEN,
        GITHUB_OWNER: !!GITHUB_OWNER,
        GITHUB_REPO: !!GITHUB_REPO,
        UPSTASH_REDIS_REST_URL: !!UPSTASH_URL,
        UPSTASH_REDIS_REST_TOKEN: !!UPSTASH_TOKEN
      });
      return res.status(500).json({ error: 'サーバーの設定に問題があります。' });
    }

    // ===================================================================
    // 5. HMAC署名付きトークン検証（AUTH_TOKENは使用しない）
    // ===================================================================

    const { date, imageToken } = req.body;

    if (!date || !imageToken) {
      return res.status(400).json({ error: '必要なパラメータが不足しています。' });
    }

    // date形式検証（YYYY-MM-DD）
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: '日付の形式が不正です。' });
    }

    // 日付の意味的妥当性検証（2026-99-99のような値を拒否）
    const parsedDate = new Date(date + 'T00:00:00Z');
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ error: '日付の形式が不正です。' });
    }
    const reformatted = parsedDate.toISOString().split('T')[0];
    if (reformatted !== date) {
      return res.status(400).json({ error: '日付の形式が不正です。' });
    }

    // imageToken = "timestamp:hmac" 形式検証
    if (typeof imageToken !== 'string') {
      return res.status(401).json({ error: '不正なトークン形式' });
    }
    const parts = imageToken.split(':');
    if (parts.length !== 2) {
      return res.status(401).json({ error: '不正なトークン形式' });
    }
    const [tsStr, receivedHmac] = parts;
    const ts = Number(tsStr);
    if (!Number.isFinite(ts) || ts <= 0) {
      return res.status(401).json({ error: '不正なトークン形式' });
    }

    // TTL検証（5分間）
    const elapsed = Date.now() - ts;
    if (elapsed < 0 || elapsed > 5 * 60 * 1000) {
      return res.status(401).json({ error: 'トークンの有効期限切れ' });
    }

    // HMAC再計算と検証（タイミング攻撃対策: crypto.timingSafeEqual使用）
    const expectedHmac = crypto.createHmac('sha256', IMAGE_SECRET)
      .update(`${date}:${tsStr}`).digest('hex');
    const a = Buffer.from(receivedHmac, 'hex');
    const b = Buffer.from(expectedHmac, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ error: '認証に失敗しました' });
    }

    // ===================================================================
    // 6. Upstash Redis永続レート制限（10req/日、IPベース）
    // ===================================================================

    // IP取得の信頼境界: x-vercel-forwarded-forを最優先
    const rawIP = (req.headers['x-vercel-forwarded-for']?.split(',')[0].trim() ||
                   req.headers['x-forwarded-for']?.split(',')[0].trim() ||
                   req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
    const clientIP = isIP(rawIP) !== 0 ? rawIP : 'unknown';

    const todayISO = new Date().toISOString().split('T')[0];
    const key = `img_rate:${clientIP}:${todayISO}`;

    // fail-closed: Redis障害時は課金処理に進まず500エラーを返す
    let count;
    try {
      const countRes = await fetch(`${UPSTASH_URL}/incr/${encodeURIComponent(key)}`, {
        headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}` }
      });

      if (!countRes.ok) {
        console.error('Upstash incr HTTPエラー:', countRes.status);
        return res.status(500).json({
          error: 'サーバーの一時的なエラーです。しばらくしてから再度お試しください。'
        });
      }

      const countData = await countRes.json();
      count = countData.result;

      // レスポンス値の型検証（INCRは必ず1以上の整数を返す）
      if (!Number.isInteger(count) || count < 1) {
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

    if (count === 1) {
      // 初回: TTL設定（24時間）
      try {
        const expireRes = await fetch(`${UPSTASH_URL}/expire/${encodeURIComponent(key)}/86400`, {
          headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}` }
        });
        if (!expireRes.ok) {
          console.error('Upstash expire HTTPエラー:', expireRes.status);
        }
      } catch (expireError) {
        console.error('Upstash expire接続エラー:', expireError);
      }
    }

    if (count > 10) {
      return res.status(429).json({
        error: '本日の画像生成回数の上限（10回）に達しました。明日再度お試しください。'
      });
    }

    // ===================================================================
    // 7. GitHubから日記ファイルを取得し、image_promptを抽出
    // ===================================================================

    const year = date.split('-')[0];
    const month = date.split('-')[1];
    const diaryPath = `diaries/${year}/${month}/${date}.md`;
    const diaryApiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${diaryPath}`;

    const diaryResponse = await fetch(diaryApiUrl, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!diaryResponse.ok) {
      console.error('日記ファイル取得失敗:', diaryResponse.status);
      return res.status(404).json({ error: '指定された日付の日記が見つかりません。' });
    }

    const diaryFile = await diaryResponse.json();
    const diaryContent = Buffer.from(diaryFile.content, 'base64').toString('utf-8');

    // YAML Front Matterからimage_promptを抽出
    const frontMatterMatch = diaryContent.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!frontMatterMatch) {
      return res.status(400).json({ error: '日記ファイルの形式が不正です。' });
    }

    const imagePromptMatch = frontMatterMatch[1].match(/image_prompt:\s*"((?:[^"\\]|\\.)*)"/);
    if (!imagePromptMatch) {
      return res.status(400).json({ error: '画像生成用プロンプトが見つかりません。' });
    }

    const imagePrompt = imagePromptMatch[1]
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\\\/g, '\\');

    // ===================================================================
    // 8. DALL-E 3 API呼び出し
    // ===================================================================

    const dalleResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: imagePrompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
        response_format: 'b64_json'
      })
    });

    if (!dalleResponse.ok) {
      const dalleError = await dalleResponse.json();
      console.error('DALL-E 3 APIエラー:', dalleError);
      throw new Error('画像の生成に失敗しました。');
    }

    const dalleData = await dalleResponse.json();
    const imageBase64 = dalleData.data[0].b64_json;

    // ===================================================================
    // 9. GitHub Contents APIで画像を保存
    // ===================================================================

    const imagePath = `docs/images/${date}.png`;
    const imageApiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${imagePath}`;

    // 既存ファイルのSHA取得（上書き時に必要）
    let imageSha;
    try {
      const getResponse = await fetch(imageApiUrl, {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      if (getResponse.ok) {
        const data = await getResponse.json();
        imageSha = data.sha;
      }
    } catch (e) {
      // ファイルが存在しない場合はSHA不要
    }

    const imageBody = {
      message: `image: ${date} - AI生成画像`,
      content: imageBase64,
      branch: 'main'
    };
    if (imageSha) {
      imageBody.sha = imageSha;
    }

    const pushResponse = await fetch(imageApiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(imageBody)
    });

    if (!pushResponse.ok) {
      const pushError = await pushResponse.json();
      console.error('GitHub画像保存エラー:', pushError);
      throw new Error('画像のGitHub保存に失敗しました。');
    }

    // ===================================================================
    // 10. 成功レスポンス
    // ===================================================================

    // GitHub raw content URLで画像を配信（publicリポジトリ、GitHub Pages非依存）
    const imageUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/${imagePath}`;

    return res.status(200).json({
      success: true,
      imageUrl,
      imagePath,
      githubUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/main/${imagePath}`
    });

  } catch (error) {
    console.error('サーバーエラー:', error);
    return res.status(500).json({
      error: '画像の生成中にエラーが発生しました。しばらくしてから再度お試しください。'
    });
  }
}
