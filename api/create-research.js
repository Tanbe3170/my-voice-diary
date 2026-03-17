import crypto from 'crypto';
import { isIP } from 'net';
import { handleCors } from './lib/cors.js';
import { verifyJwt } from './lib/jwt.js';

// api/create-research.js
// Vercel Serverless Function - リサーチ記事作成API
//
// このファイルは、ブラウザからのリサーチ記事作成リクエストを受け取り、
// Claude APIで解説記事に整形してGitHubに保存するサーバーレス関数です。
//
// セキュリティ機能:
// 1. CORS設定（共通ヘルパー: api/lib/cors.js）
// 2. JWT認証（JWTのみ、AUTH_TOKENフォールバックなし）
// 3. Upstash Redis永続レート制限（15req/日、IPベース、fail-closed）
// 4. 入力検証（rawText最大10,000文字、category検証、topic検証）
// 5. LLM出力スキーマ検証（型・長さ検証、YAMLエスケープ）
// 6. エラーハンドリング（汎用エラーのみ返却）

// ===================================================================
// LLM出力スキーマ検証関数
// ===================================================================

const validateResearchData = (data) => {
  const errors = [];

  // title検証（string、1-50文字）
  if (!data.title || typeof data.title !== 'string') errors.push('titleが不正');
  else if (data.title.length > 50) errors.push('titleが長すぎます（50文字以内）');

  // topic検証（string、1-50文字）
  if (!data.topic || typeof data.topic !== 'string') errors.push('topicが不正');
  else if (data.topic.length > 50) errors.push('topicが長すぎます（50文字以内）');

  // category検証
  const validCategories = ['dinosaur', 'tech', 'skill', 'general'];
  if (!validCategories.includes(data.category)) errors.push('categoryが不正');

  // summary検証（string、1-500文字）
  if (!data.summary || typeof data.summary !== 'string') errors.push('summaryが不正');
  else if (data.summary.length > 500) errors.push('summaryが長すぎます');

  // key_points検証（配列、各要素string、最大10個）
  if (!Array.isArray(data.key_points)) errors.push('key_pointsが配列ではありません');
  else if (data.key_points.length > 10) errors.push('key_pointsが多すぎます');

  // body検証（string、1-10000文字）
  if (!data.body || typeof data.body !== 'string') errors.push('bodyが不正');
  else if (data.body.length > 10000) errors.push('bodyが長すぎます');

  // tags検証（配列、各要素string、最大10個）
  if (!Array.isArray(data.tags)) errors.push('tagsが配列ではありません');
  else if (data.tags.length > 10) errors.push('tagsが多すぎます');

  // image_prompt検証（string、1-500文字）
  if (!data.image_prompt || typeof data.image_prompt !== 'string') errors.push('image_promptが不正');
  else if (data.image_prompt.length > 500) errors.push('image_promptが長すぎます');

  // slug検証（英数字+ハイフン、3-50文字）
  if (!data.slug || typeof data.slug !== 'string') errors.push('slugが不正');
  else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(data.slug)) errors.push('slugの形式が不正');
  else if (data.slug.length > 50) errors.push('slugが長すぎます');

  // sources検証（任意、配列）
  if (data.sources !== undefined) {
    if (!Array.isArray(data.sources)) errors.push('sourcesが配列ではありません');
  }

  return errors;
};

export default async function handler(req, res) {
  // ===================================================================
  // 1. CORS設定（共通ヘルパー使用）
  // ===================================================================

  if (handleCors(req, res, { allowHeaders: 'Content-Type, X-Auth-Token' })) {
    return;
  }

  // ===================================================================
  // 2. メソッド検証（POSTリクエストのみ許可）
  // ===================================================================

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: '許可されていないメソッドです。'
    });
  }

  try {
    // ===================================================================
    // 3. Content-Type検証（application/jsonのみ受付）
    // ===================================================================

    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      return res.status(400).json({
        error: '不正なリクエスト形式です。'
      });
    }

    // ===================================================================
    // 4. JWT認証（JWTのみ、AUTH_TOKENフォールバックなし）
    // ===================================================================

    const authToken = req.headers['x-auth-token'];
    const JWT_SECRET = process.env.JWT_SECRET;

    if (!JWT_SECRET) {
      console.error('JWT_SECRET環境変数が未設定');
      return res.status(500).json({
        error: 'サーバーの設定に問題があります。'
      });
    }

    const jwtPayload = authToken ? verifyJwt(authToken, JWT_SECRET) : null;
    const jwtValid = jwtPayload && jwtPayload.sub === 'diary-admin';

    if (!jwtValid) {
      return res.status(401).json({
        error: '認証に失敗しました。トークンが無効または期限切れです。'
      });
    }

    // ===================================================================
    // 5. Upstash Redis永続レート制限（15req/日、IPベース、fail-closed）
    // ===================================================================

    const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
    const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!UPSTASH_URL || !UPSTASH_TOKEN) {
      console.error('Upstash環境変数が未設定');
      return res.status(500).json({
        error: 'サーバーの設定に問題があります。管理者に連絡してください。'
      });
    }

    // IP取得の信頼境界: x-vercel-forwarded-forを最優先
    const rawIP = (req.headers['x-vercel-forwarded-for']?.split(',')[0].trim() ||
                   req.headers['x-forwarded-for']?.split(',')[0].trim() ||
                   req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
    const clientIP = isIP(rawIP) !== 0 ? rawIP : 'unknown';

    const rateDateISO = new Date().toISOString().split('T')[0];
    const rateLimitKey = `research_rate:${clientIP}:${rateDateISO}`;

    // fail-closed: Redis障害時は処理に進まず500エラーを返す
    let rateCount;
    try {
      const countRes = await fetch(`${UPSTASH_URL}/incr/${encodeURIComponent(rateLimitKey)}`, {
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

    // 初回: TTL設定（86400秒 = 24時間）、fail-closed
    if (rateCount === 1) {
      let ttlSet = false;
      try {
        const expireRes = await fetch(`${UPSTASH_URL}/expire/${encodeURIComponent(rateLimitKey)}/86400`, {
          headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}` }
        });
        if (expireRes.ok) {
          ttlSet = true;
        } else {
          console.error('Upstash expire HTTPエラー:', expireRes.status);
          try {
            const ttlRes = await fetch(`${UPSTASH_URL}/ttl/${encodeURIComponent(rateLimitKey)}`, {
              headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}` }
            });
            if (ttlRes.ok) {
              const ttlData = await ttlRes.json();
              const ttl = ttlData.result;
              if (Number.isInteger(ttl) && ttl > 0) {
                ttlSet = true;
              } else if (ttl === -1) {
                const retryRes = await fetch(`${UPSTASH_URL}/expire/${encodeURIComponent(rateLimitKey)}/86400`, {
                  headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}` }
                });
                if (retryRes.ok) {
                  ttlSet = true;
                } else {
                  console.error('Upstash expire再試行失敗:', retryRes.status);
                }
              } else {
                console.error('Upstash TTL異常値:', ttl);
              }
            } else {
              console.error('Upstash TTL確認HTTPエラー:', ttlRes.status);
            }
          } catch (ttlError) {
            console.error('Upstash TTL確認エラー:', ttlError);
          }
        }
      } catch (expireError) {
        console.error('Upstash expire接続エラー:', expireError);
      }

      // TTL未設定のまま → fail-closed（無期限キー残留を防止）
      if (!ttlSet) {
        return res.status(500).json({
          error: 'サーバーの一時的なエラーです。しばらくしてから再度お試しください。'
        });
      }
    }

    // 15回超過 → 429
    if (rateCount > 15) {
      return res.status(429).json({
        error: '本日のリクエスト回数の上限（15回）に達しました。明日再度お試しください。'
      });
    }

    // ===================================================================
    // 6. 入力検証
    // ===================================================================

    const { rawText, category, topic } = req.body;

    // rawText: 必須、string、1-10000文字
    if (!rawText) {
      return res.status(400).json({
        error: 'リサーチの内容が必要です。'
      });
    }

    if (typeof rawText !== 'string') {
      return res.status(400).json({
        error: '不正な入力形式です。'
      });
    }

    if (rawText.length > 10000) {
      return res.status(400).json({
        error: 'リサーチの内容が長すぎます（10000文字以内）。'
      });
    }

    // category: 任意、ホワイトリスト検証
    const VALID_CATEGORIES = ['dinosaur', 'tech', 'skill', 'general'];
    const effectiveCategory = category || 'general';
    if (!VALID_CATEGORIES.includes(effectiveCategory)) {
      return res.status(400).json({
        error: '不正なカテゴリです。dinosaur, tech, skill, general のいずれかを指定してください。'
      });
    }

    // topic: 任意、string、1-50文字
    if (topic !== undefined && topic !== null) {
      if (typeof topic !== 'string') {
        return res.status(400).json({
          error: 'トピックの形式が不正です。'
        });
      }
      if (topic.length > 50) {
        return res.status(400).json({
          error: 'トピックが長すぎます（50文字以内）。'
        });
      }
    }

    // ===================================================================
    // 7. 環境変数の確認
    // ===================================================================

    const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_OWNER = process.env.GITHUB_OWNER;
    const GITHUB_REPO = process.env.GITHUB_REPO;

    if (!CLAUDE_API_KEY || !GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
      console.error('環境変数が未設定:', {
        CLAUDE_API_KEY: !!CLAUDE_API_KEY,
        GITHUB_TOKEN: !!GITHUB_TOKEN,
        GITHUB_OWNER: !!GITHUB_OWNER,
        GITHUB_REPO: !!GITHUB_REPO
      });

      return res.status(500).json({
        error: 'サーバーの設定に問題があります。管理者に連絡してください。'
      });
    }

    // ===================================================================
    // 8. Claude APIでリサーチ記事整形
    // ===================================================================

    const todayISO = new Date().toISOString().split('T')[0];

    // Claude APIプロンプト構築（リサーチ用）
    const claudePrompt = `あなたはリサーチ記事のライティングアシスタントです。以下の調査メモを、
読みやすい解説記事に整形してください。

【調査メモ】
${rawText}

【トピック（任意）】
${topic || '調査メモから自動推定してください'}

【カテゴリ】
${effectiveCategory}

【出力形式】
以下のJSON形式で出力してください。JSONの前後に説明文は不要です。

{
  "date": "${todayISO}",
  "title": "読者の興味を引くタイトル（20文字以内）",
  "topic": "調査トピック名（15文字以内）",
  "category": "${effectiveCategory}",
  "summary": "3行サマリー（1行30文字程度、改行で区切る）",
  "key_points": ["重要ポイント1", "重要ポイント2", "重要ポイント3"],
  "body": "詳細な解説記事（段落分けあり、わかりやすい文章）",
  "sources": ["参考にした情報源があれば記載"],
  "tags": ["関連するハッシュタグ", "5個程度"],
  "image_prompt": "このリサーチから1枚の画像を生成するための英語プロンプト（DALL-E用、詳細に）",
  "slug": "英語のURL用スラッグ（ハイフン区切り、3-5単語）"
}

【整形のルール】
1. 専門用語は初出時に簡潔な説明を添える
2. key_pointsは核心となるポイントを3-5個
3. 本文は論理的な構成で段落分けする
4. タグはSNS投稿を想定（#リサーチ #テーマ名 など）
5. 画像プロンプトはテーマを視覚的に表す具体的な英語で記述
6. slugは簡潔で意味が通る英語`;

    // Claude APIにリクエスト送信
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: claudePrompt }]
      })
    });

    // Claude APIのレスポンス確認
    if (!claudeResponse.ok) {
      const error = await claudeResponse.json();
      console.error('Claude APIエラー:', error);
      throw new Error('リサーチ記事の整形に失敗しました。');
    }

    // レスポンスからテキストを取得
    const claudeData = await claudeResponse.json();
    const responseText = claudeData.content[0].text;

    // JSONを抽出（```json ... ``` または {...} を探す）
    const jsonMatch = responseText.match(/```json\s*(\{.*?\})\s*```/s) ||
                      responseText.match(/(\{.*\})/s);

    if (!jsonMatch) {
      console.error('Claude APIレスポンスからJSON抽出失敗:', responseText);
      throw new Error('リサーチ記事の整形結果を解析できませんでした。');
    }

    // JSONをパース
    const researchData = JSON.parse(jsonMatch[1]);

    // ===================================================================
    // 9. LLM出力のスキーマ検証（セキュリティ強化）
    // ===================================================================

    const validationErrors = validateResearchData(researchData);
    if (validationErrors.length > 0) {
      console.error('LLM出力スキーマ検証エラー:', validationErrors, researchData);
      throw new Error('リサーチデータの形式が不正です。');
    }

    // YAML frontmatter用のエスケープ処理
    const escapeYaml = (str) => {
      return str
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
    };

    // ===================================================================
    // 10. Markdownファイル生成（リサーチ用フォーマット）
    // ===================================================================

    const year = todayISO.split('-')[0];
    const month = todayISO.split('-')[1];

    // ハッシュタグの整形（#が付いていない場合は追加）
    const tags = researchData.tags.map(tag => tag.startsWith('#') ? tag : '#' + tag);

    // YAML frontmatter用にエスケープ処理を適用
    const escapedTitle = escapeYaml(researchData.title);
    const escapedTopic = escapeYaml(researchData.topic);
    const escapedImagePrompt = escapeYaml(researchData.image_prompt);
    const escapedTags = tags.map(tag => escapeYaml(tag));

    // sources整形
    const sources = researchData.sources || [];
    const sourcesYaml = sources.map(s => `  - "${escapeYaml(s)}"`).join('\n');

    // キーポイント整形
    const keyPointsMarkdown = researchData.key_points
      .map(point => `- ${point}`)
      .join('\n');

    // Markdown形式でリサーチファイルを生成
    const markdown = `---
title: "${escapedTitle}"
date: ${todayISO}
type: research
topic: "${escapedTopic}"
category: ${researchData.category}
tags: [${escapedTags.map(t => `"${t}"`).join(', ')}]
sources:
${sourcesYaml}
image_prompt: "${escapedImagePrompt}"
slug: ${researchData.slug}
---

# ${researchData.title}

## ${todayISO}

### トピック: ${researchData.topic}

### サマリー

${researchData.summary}

### キーポイント

${keyPointsMarkdown}

---

${researchData.body}

---

**Sources:** ${sources.join(', ')}

**Tags:** ${tags.join(' ')}
`;

    // ===================================================================
    // 11. GitHub APIでリポジトリにpush
    // ===================================================================

    const filePath = `research/${year}/${month}/${todayISO}-${researchData.slug}.md`;
    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;

    // 既存ファイルのSHA取得（上書き時に必要）
    let sha;
    try {
      const getResponse = await fetch(apiUrl, {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (getResponse.ok) {
        const data = await getResponse.json();
        sha = data.sha;
      }
    } catch (e) {
      // ファイルが存在しない場合は、shaは不要（新規作成）
    }

    // MarkdownをBase64エンコード（GitHubのAPI仕様）
    const contentBase64 = Buffer.from(markdown, 'utf-8').toString('base64');

    // リクエストボディを構築
    const body = {
      message: `research: ${todayISO} - ${researchData.title}`,
      content: contentBase64,
      branch: 'main'
    };

    // 既存ファイルを上書きする場合はSHAを含める
    if (sha) {
      body.sha = sha;
    }

    // GitHubにファイルを作成/更新
    const pushResponse = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    // GitHub APIのレスポンス確認
    if (!pushResponse.ok) {
      const error = await pushResponse.json();
      console.error('GitHub APIエラー:', error);
      throw new Error('GitHubへの保存に失敗しました。');
    }

    // ===================================================================
    // 12. 成功レスポンスを返す
    // ===================================================================

    // 画像生成用のHMAC署名付きトークンを生成
    const IMAGE_TOKEN_SECRET = process.env.IMAGE_TOKEN_SECRET;
    let imageToken = null;
    if (IMAGE_TOKEN_SECRET) {
      const timestamp = Date.now();
      // filePathをHMAC署名に含めてトークンとfilePathを拘束する
      const payload = filePath
        ? `${todayISO}:${filePath}:${timestamp}`
        : `${todayISO}:${timestamp}`;
      const hmac = crypto.createHmac('sha256', IMAGE_TOKEN_SECRET)
        .update(payload).digest('hex');
      imageToken = `${timestamp}:${hmac}`;
    }

    return res.status(200).json({
      success: true,
      title: researchData.title,
      topic: researchData.topic,
      category: researchData.category,
      tags: researchData.tags,
      filePath,
      githubUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/main/${filePath}`,
      date: todayISO,
      slug: researchData.slug,
      imageToken
    });

  } catch (error) {
    // ===================================================================
    // 13. エラーハンドリング（情報露出抑制）
    // ===================================================================

    console.error('サーバーエラー:', error);

    return res.status(500).json({
      error: 'リサーチ記事の作成中にエラーが発生しました。しばらくしてから再度お試しください。'
    });
  }
}
