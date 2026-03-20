// api/generate-image.js
// Vercel Serverless Function - AI画像生成API（Phase 4）
//
// 日記作成後にDALL-E 3で画像を生成し、GitHubリポジトリに保存する。
//
// セキュリティ機能:
// 1. CORS設定（共通ヘルパー: lib/cors.js）
// 2. HMAC署名付きトークン認証（IMAGE_TOKEN_SECRET、AUTH_TOKENは使用しない）
// 3. Upstash Redis永続レート制限（10req/日、IPベース）
// 4. 入力検証（date: YYYY-MM-DD、imagePromptはサーバー側取得）
// 5. エラーハンドリング（汎用エラーのみ返却）

import { isIP } from 'net';
import { handleCors } from '../lib/cors.js';
import { isValidStyleId } from '../lib/image-styles.js';
import { verifyImageToken } from '../lib/image-token.js';
import { loadCharacter, composeImagePrompt } from '../lib/character.js';
import { generateImageWithFallback, sanitizeError } from '../lib/image-backend.js';

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

    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_OWNER = process.env.GITHUB_OWNER;
    const GITHUB_REPO = process.env.GITHUB_REPO;
    const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
    const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!GOOGLE_API_KEY && !OPENAI_API_KEY) {
      console.error('環境変数が未設定: GOOGLE_API_KEYまたはOPENAI_API_KEYのどちらかが必要です');
      return res.status(500).json({ error: 'サーバーの設定に問題があります。' });
    }

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
    // 5. HMAC署名付きトークン検証（AUTH_TOKENは使用しない）
    // ===================================================================

    const { date, imageToken, filePath, characterId, mode, styleId } = req.body;

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

    // filePath検証（任意パラメータ、パストラバーサル防止）
    if (filePath !== undefined) {
      if (typeof filePath !== 'string') {
        return res.status(400).json({ error: 'ファイルパスの形式が不正です。' });
      }
      if (!/^(diaries|research)\/\d{4}\/\d{2}\/[\w-]+\.md$/.test(filePath)) {
        return res.status(400).json({ error: 'ファイルパスの形式が不正です。' });
      }
      if (filePath.includes('..') || filePath.includes('//')) {
        return res.status(400).json({ error: 'ファイルパスの形式が不正です。' });
      }
    }

    // characterIdバリデーション（任意パラメータ）
    if (characterId !== undefined) {
      if (typeof characterId !== 'string' || !/^[a-z0-9-]{1,30}$/.test(characterId)) {
        return res.status(400).json({ error: 'キャラクターIDの形式が不正です。' });
      }
    }

    // modeバリデーション（未指定時のみnormal、不正値は拒否）
    const VALID_MODES = ['normal', 'dino-story', 'dino-research'];
    if (mode !== undefined && (typeof mode !== 'string' || !VALID_MODES.includes(mode))) {
      return res.status(400).json({ error: '不正なモードです。' });
    }
    const effectiveMode = mode || 'normal';

    // styleIdバリデーション（必須パラメータ）
    if (!isValidStyleId(styleId)) {
      return res.status(400).json({ error: '不正な画像スタイルです。' });
    }

    // characterIdはdino-storyモード時のみ許可（サーバー側強制）
    if (characterId && effectiveMode !== 'dino-story') {
      return res.status(400).json({ error: 'キャラクターIDはdino-storyモードでのみ使用できます。' });
    }

    // imageToken検証（image-token.jsに委譲、fail-closed設計）
    const tokenResult = verifyImageToken(imageToken, {
      date,
      filePath,
      characterId: characterId || '',
      mode: effectiveMode,
      styleId,
    }, IMAGE_SECRET);

    if (!tokenResult.valid) {
      const reason = tokenResult.reason;
      if (reason === 'token_expired') {
        return res.status(401).json({ error: 'トークンの有効期限切れ' });
      }
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
    const diaryPath = filePath || `diaries/${year}/${month}/${date}.md`;
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
    // 7.5. キャラクター設定読み込み（任意）
    // ===================================================================

    // キャラクター読み込み（任意）+ スタイル適用
    let character = null;
    if (characterId) {
      character = await loadCharacter(characterId, {
        token: GITHUB_TOKEN,
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
      });
    }

    // スタイル + キャラクター合成（キャラクターnullでもスタイルは適用される）
    const composed = composeImagePrompt(imagePrompt, character, styleId);
    const composedPrompt = composed.prompt;
    const negativePrompt = composed.negativePrompt;
    const loadedCharacterId = character ? characterId : null;

    // ===================================================================
    // 8. 画像生成（フォールバックチェーン: NB2 → NBpro → DALL-E 3）
    // ===================================================================

    const { imageData, backend, model, modelId } = await generateImageWithFallback(composedPrompt, negativePrompt);
    const imageBase64 = imageData.toString('base64');

    // ===================================================================
    // 9. GitHub Contents APIで画像を保存
    // ===================================================================

    // 画像パス構築（filePath指定時はbasenameを使用、未指定時はdateフォールバック）
    let imageName = date;
    if (filePath) {
      const basename = filePath.split('/').pop().replace(/\.md$/, '');
      imageName = basename;
    }
    const imagePath = `docs/images/${imageName}.png`;
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

    // Base64プレビュー用データ（2.5MB未満ならレスポンスに含める）
    // CDNキャッシュ（raw.githubusercontent.com）による古い画像表示を回避
    const MAX_BASE64_SIZE = 2_500_000;
    const responseBody = {
      success: true,
      imageUrl,
      imagePath,
      githubUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/main/${imagePath}`,
      backend,
      model,
      modelId,
    };
    if (loadedCharacterId) {
      responseBody.characterId = loadedCharacterId;
    }
    if (effectiveMode !== 'normal') {
      responseBody.mode = effectiveMode;
    }

    if (imageBase64.length < MAX_BASE64_SIZE) {
      responseBody.imageBase64 = imageBase64;
    } else {
      // サイズ超過時: キャッシュバスター付きURLにフォールバック
      responseBody.imageUrl = `${imageUrl}?t=${Date.now()}`;
    }

    return res.status(200).json(responseBody);

  } catch (error) {
    console.error('サーバーエラー:', error);
    return res.status(500).json({
      error: '画像の生成中にエラーが発生しました。しばらくしてから再度お試しください。'
    });
  }
}
