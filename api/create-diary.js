import crypto from 'crypto';
import { isIP } from 'net';
import { handleCors } from './lib/cors.js';
import { verifyJwt } from './lib/jwt.js';

// api/create-diary.js
// Vercel Serverless Function - 日記作成API
//
// このファイルは、ブラウザからの日記作成リクエストを受け取り、
// Claude APIで整形してGitHubに保存するサーバーレス関数です。
//
// セキュリティ機能:
// 1. CORS設定（共通ヘルパー: api/lib/cors.js）
// 2. JWT認証（X-Auth-Tokenヘッダー） + AUTH_TOKENフォールバック（移行期間）
// 3. Upstash Redis永続レート制限（30req/日、IPベース、fail-closed）
// 4. 入力検証（最大10,000文字、Content-Type検証）
// 5. LLM出力スキーマ検証（型・長さ検証、YAMLエスケープ）
// 6. エラーハンドリング（汎用エラーのみ返却）

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
    // 4. JWT認証（AUTH_TOKENフォールバック付き移行期間）
    // ===================================================================

    const authToken = req.headers['x-auth-token'];
    const JWT_SECRET = process.env.JWT_SECRET;
    const LEGACY_AUTH_TOKEN = process.env.AUTH_TOKEN;

    if (!JWT_SECRET) {
      console.error('JWT_SECRET環境変数が未設定');
      return res.status(500).json({
        error: 'サーバーの設定に問題があります。管理者に連絡してください。'
      });
    }

    // JWT優先検証（sub === 'diary-admin' で用途拘束）
    const jwtPayload = authToken ? verifyJwt(authToken, JWT_SECRET) : null;
    const jwtValid = jwtPayload && jwtPayload.sub === 'diary-admin';

    if (!jwtValid) {
      // AUTH_TOKENフォールバック（移行期間）
      if (LEGACY_AUTH_TOKEN && authToken === LEGACY_AUTH_TOKEN) {
        console.warn('レガシー認証使用: AUTH_TOKENフォールバックで認証成功');
      } else {
        return res.status(401).json({
          error: '認証に失敗しました。トークンが無効または期限切れです。'
        });
      }
    }

    // ===================================================================
    // 5. Upstash Redis永続レート制限（30req/日、IPベース、fail-closed）
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
    const rateLimitKey = `diary_rate:${clientIP}:${rateDateISO}`;

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

    // 初回: TTL設定（86400秒 = 24時間）
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
          // TTL確認: ttl > 0 のみ「設定済み」として継続可
          // ttl === -1（無期限）→ 再EXPIRE試行、ttl === -2（キー不在）/その他 → 失敗
          try {
            const ttlRes = await fetch(`${UPSTASH_URL}/ttl/${encodeURIComponent(rateLimitKey)}`, {
              headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}` }
            });
            if (ttlRes.ok) {
              const ttlData = await ttlRes.json();
              const ttl = ttlData.result;
              if (Number.isInteger(ttl) && ttl > 0) {
                // TTLが正の値 → 既に設定済み、継続可
                ttlSet = true;
              } else if (ttl === -1) {
                // 無期限キー → 再度EXPIRE試行
                const retryRes = await fetch(`${UPSTASH_URL}/expire/${encodeURIComponent(rateLimitKey)}/86400`, {
                  headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}` }
                });
                if (retryRes.ok) {
                  ttlSet = true;
                } else {
                  console.error('Upstash expire再試行失敗:', retryRes.status);
                }
              } else {
                // ttl === -2（キー不在）またはその他の異常値
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

    // 30回超過 → 429
    if (rateCount > 30) {
      return res.status(429).json({
        error: '本日のリクエスト回数の上限（30回）に達しました。明日再度お試しください。'
      });
    }

    // ===================================================================
    // 6. 入力検証
    // ===================================================================

    // リクエストボディから日記の生テキストを取得
    const { rawText } = req.body;

    // 必須フィールドの存在確認
    if (!rawText) {
      return res.status(400).json({
        error: '日記の内容が必要です。'
      });
    }

    // 型チェック（string型のみ許可）
    if (typeof rawText !== 'string') {
      return res.status(400).json({
        error: '不正な入力形式です。'
      });
    }

    // 長さ制限（最大10,000文字）
    if (rawText.length > 10000) {
      return res.status(400).json({
        error: '日記の内容が長すぎます（10000文字以内）。'
      });
    }

    // ===================================================================
    // 7. 環境変数の確認
    // ===================================================================

    // Vercelの環境変数から必要な認証情報を取得
    const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_OWNER = process.env.GITHUB_OWNER;
    const GITHUB_REPO = process.env.GITHUB_REPO;

    // 環境変数が設定されているか確認
    if (!CLAUDE_API_KEY || !GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
      // サーバーログに詳細を記録
      console.error('環境変数が未設定:', {
        CLAUDE_API_KEY: !!CLAUDE_API_KEY,
        GITHUB_TOKEN: !!GITHUB_TOKEN,
        GITHUB_OWNER: !!GITHUB_OWNER,
        GITHUB_REPO: !!GITHUB_REPO
      });

      // クライアントには汎用エラーのみ返す
      return res.status(500).json({
        error: 'サーバーの設定に問題があります。管理者に連絡してください。'
      });
    }

    // ===================================================================
    // 8. Claude APIで日記整形
    // ===================================================================

    // 今日の日付を日本語形式で取得（例: 2026年02月16日）
    const today = new Date().toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).replace(/\//g, '年').replace(/年0?/, '年').replace(/月0?/, '月') + '日';

    // Claude APIへのプロンプト（TECHNICAL_SPEC.mdの仕様に従う）
    const claudePrompt = `あなたは日記執筆のアシスタントです。以下の音声入力テキスト（口語）を、文語の日記形式に整形してください。

【音声入力テキスト】
${rawText}

【出力形式】
以下のJSON形式で出力してください。JSONの前後に説明文は不要です。

\`\`\`json
{
  "date": "${today}",
  "title": "その日の出来事を要約した魅力的なタイトル（15文字以内）",
  "summary": "3行サマリー（1行30文字程度、改行で区切る）",
  "body": "詳細な日記本文（段落分けあり、文語体で整った文章）",
  "tags": ["関連するハッシュタグ", "5個程度"],
  "image_prompt": "この日記から1枚の画像を生成するための英語プロンプト（DALL-E用、詳細に）"
}
\`\`\`

【整形のルール】
1. 口語（「〜でした」「〜なんだけど」）→ 文語（「〜だった」「〜だが」）
2. タイトルは読者の興味を引く工夫をする
3. サマリーは3行で要点をまとめる
4. 本文は適度に段落分けし、読みやすくする
5. ハッシュタグはInstagram投稿を想定（#日記 #今日の出来事 など）
6. 画像プロンプトは情景が浮かぶような具体的な英語で記述

それでは、音声入力テキストを日記に整形してください。`;

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

      // サーバーログに詳細を記録
      console.error('Claude APIエラー:', error);

      // クライアントには汎用エラーのみ返す
      throw new Error('日記の整形に失敗しました。');
    }

    // レスポンスからテキストを取得
    const claudeData = await claudeResponse.json();
    const responseText = claudeData.content[0].text;

    // JSONを抽出（```json ... ``` または {...} を探す）
    const jsonMatch = responseText.match(/```json\s*(\{.*?\})\s*```/s) ||
                      responseText.match(/(\{.*\})/s);

    if (!jsonMatch) {
      // サーバーログに詳細を記録
      console.error('Claude APIレスポンスからJSON抽出失敗:', responseText);

      // クライアントには汎用エラーのみ返す
      throw new Error('日記の整形結果を解析できませんでした。');
    }

    // JSONをパース
    const diaryData = JSON.parse(jsonMatch[1]);

    // ===================================================================
    // 9. LLM出力のスキーマ検証（セキュリティ強化）
    // ===================================================================

    // 必須フィールドの存在と型を検証
    const validateDiaryData = (data) => {
      const errors = [];

      // title検証（string、1-50文字）
      if (!data.title || typeof data.title !== 'string') {
        errors.push('titleが不正です');
      } else if (data.title.length > 50) {
        errors.push('titleが長すぎます（50文字以内）');
      }

      // summary検証（string、1-500文字）
      if (!data.summary || typeof data.summary !== 'string') {
        errors.push('summaryが不正です');
      } else if (data.summary.length > 500) {
        errors.push('summaryが長すぎます（500文字以内）');
      }

      // body検証（string、1-10000文字）
      if (!data.body || typeof data.body !== 'string') {
        errors.push('bodyが不正です');
      } else if (data.body.length > 10000) {
        errors.push('bodyが長すぎます（10000文字以内）');
      }

      // tags検証（配列、各要素string、最大10個）
      if (!Array.isArray(data.tags)) {
        errors.push('tagsが配列ではありません');
      } else if (data.tags.length > 10) {
        errors.push('tagsが多すぎます（10個以内）');
      } else if (!data.tags.every(tag => typeof tag === 'string' && tag.length <= 30)) {
        errors.push('tagsの要素が不正です（各30文字以内のstring）');
      }

      // image_prompt検証（string、1-500文字）
      if (!data.image_prompt || typeof data.image_prompt !== 'string') {
        errors.push('image_promptが不正です');
      } else if (data.image_prompt.length > 500) {
        errors.push('image_promptが長すぎます（500文字以内）');
      }

      return errors;
    };

    // スキーマ検証実行
    const validationErrors = validateDiaryData(diaryData);
    if (validationErrors.length > 0) {
      console.error('LLM出力スキーマ検証エラー:', validationErrors, diaryData);
      throw new Error('日記データの形式が不正です。');
    }

    // YAML frontmatter用のエスケープ処理
    const escapeYaml = (str) => {
      // ダブルクォート内の特殊文字をエスケープ
      return str
        .replace(/\\/g, '\\\\')  // バックスラッシュ
        .replace(/"/g, '\\"')    // ダブルクォート
        .replace(/\n/g, '\\n')   // 改行
        .replace(/\r/g, '\\r')   // キャリッジリターン
        .replace(/\t/g, '\\t');  // タブ
    };

    // ===================================================================
    // 10. Markdownファイル生成
    // ===================================================================

    // 今日の日付をISO形式で取得（YYYY-MM-DD）
    const todayISO = new Date().toISOString().split('T')[0];
    const year = todayISO.split('-')[0];
    const month = todayISO.split('-')[1];

    // ハッシュタグの整形（#が付いていない場合は追加）
    const tags = diaryData.tags.map(tag => tag.startsWith('#') ? tag : '#' + tag);

    // YAML frontmatter用にエスケープ処理を適用
    const escapedTitle = escapeYaml(diaryData.title);
    const escapedImagePrompt = escapeYaml(diaryData.image_prompt);
    const escapedTags = tags.map(tag => escapeYaml(tag));

    // Markdown形式で日記ファイルを生成
    // 注意: tags要素は必ずクォートする（#記号がYAMLコメントと解釈されるのを防ぐ）
    const markdown = `---
title: "${escapedTitle}"
date: ${todayISO}
tags: [${escapedTags.map(t => `"${t}"`).join(', ')}]
image_prompt: "${escapedImagePrompt}"
---

# ${diaryData.title}

## 📅 ${todayISO}

### 📖 サマリー

${diaryData.summary}

---

${diaryData.body}

---

**Tags:** ${tags.join(' ')}
`;

    // ===================================================================
    // 10. GitHub APIでリポジトリにpush
    // ===================================================================

    // ファイルパス（例: diaries/2026/02/2026-02-16.md）
    const filePath = `diaries/${year}/${month}/${todayISO}.md`;
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
        sha = data.sha; // 既存ファイルのSHAを取得
      }
    } catch (e) {
      // ファイルが存在しない場合は、shaは不要（新規作成）
    }

    // MarkdownをBase64エンコード（GitHubのAPI仕様）
    const contentBase64 = Buffer.from(markdown, 'utf-8').toString('base64');

    // リクエストボディを構築
    const body = {
      message: `diary: ${todayISO} - ${diaryData.title}`,
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

      // サーバーログに詳細を記録
      console.error('GitHub APIエラー:', error);

      // クライアントには汎用エラーのみ返す
      throw new Error('GitHubへの保存に失敗しました。');
    }

    // ===================================================================
    // 11. 成功レスポンスを返す
    // ===================================================================

    // 画像生成用のHMAC署名付きトークンを生成（Phase 4）
    const IMAGE_TOKEN_SECRET = process.env.IMAGE_TOKEN_SECRET;
    let imageToken = null;
    if (IMAGE_TOKEN_SECRET) {
      const timestamp = Date.now();
      const payload = `${todayISO}:${timestamp}`;
      const hmac = crypto.createHmac('sha256', IMAGE_TOKEN_SECRET)
        .update(payload).digest('hex');
      imageToken = `${timestamp}:${hmac}`;
    }

    return res.status(200).json({
      success: true,
      title: diaryData.title,
      tags: diaryData.tags,
      filePath,
      githubUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/main/${filePath}`,
      date: todayISO,
      imageToken
    });

  } catch (error) {
    // ===================================================================
    // 12. エラーハンドリング（情報露出抑制）
    // ===================================================================

    // サーバーログに詳細を記録（Vercel Logsで確認可能）
    console.error('サーバーエラー:', error);

    // クライアントには汎用的なエラーメッセージのみ返す（セキュリティ強化）
    // 内部実装の詳細（APIキー、ファイルパス、スタックトレース）を漏洩しない
    return res.status(500).json({
      error: '日記の作成中にエラーが発生しました。しばらくしてから再度お試しください。'
    });
  }
}
