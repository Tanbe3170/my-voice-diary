// api/lib/image-backend.js
// 画像生成バックエンド共通ライブラリ（NB2/NBpro/DALL-E 3フォールバックチェーン）
//
// Gemini（NB2/NBpro）をプライマリ、DALL-E 3をフォールバックとして使用する。
// APIキーが未設定のバックエンドはスキップする。
// エラーメッセージからAPIキーを除去するサニタイズ機能を提供する。

import { GoogleGenAI } from '@google/genai';

/**
 * フォールバックチェーンの定義
 * モデルIDは環境変数で上書き可能（Googleのpreviewモデルは頻繁に変更されるため）
 */
function getFallbackChain() {
  return [
    {
      backend: 'gemini',
      model: process.env.GEMINI_NB2_MODEL || 'gemini-3.1-flash-image-preview',
      name: 'NB2',
    },
    {
      backend: 'gemini',
      model: process.env.GEMINI_NBPRO_MODEL || 'gemini-3-pro-image-preview',
      name: 'NBpro',
    },
    {
      backend: 'dalle',
      model: 'dall-e-3',
      name: 'DALL-E 3',
    },
  ];
}

/**
 * バックエンドに対応するAPIキーを取得する
 * @param {string} backend - バックエンド名（'gemini' or 'dalle'）
 * @returns {string|undefined} APIキー、未設定の場合はundefined
 */
function getApiKey(backend) {
  if (backend === 'gemini') return process.env.GOOGLE_API_KEY;
  if (backend === 'dalle') return process.env.OPENAI_API_KEY;
  return undefined;
}

/**
 * Gemini API経由の画像生成
 * @param {string} prompt - 画像生成プロンプト
 * @param {string} negativePrompt - ネガティブプロンプト
 * @param {string} model - モデルID
 * @param {string} name - 表示名（"NB2" or "NBpro"）
 * @param {string} apiKey - Google API Key
 * @returns {Promise<{imageData: Buffer, backend: string, model: string, modelId: string}>}
 */
async function generateWithGemini(prompt, negativePrompt, model, name, apiKey) {
  const client = new GoogleGenAI({ apiKey });

  // negativePromptがある場合はプロンプトに追記（Gemini APIはnegativePrompt専用パラメータを持たないため）
  const fullPrompt = negativePrompt
    ? `${prompt}\n\nAvoid: ${negativePrompt}`
    : prompt;

  const response = await client.models.generateContent({
    model,
    contents: fullPrompt,
    config: { responseModalities: ['IMAGE'] },
  });

  const parts = response.candidates[0].content.parts;
  for (const part of parts) {
    if (part.inlineData) {
      return {
        imageData: Buffer.from(part.inlineData.data, 'base64'),
        backend: 'gemini',
        model: name,
        modelId: model,
      };
    }
  }
  throw new Error('Gemini: 画像データが返されませんでした');
}

/**
 * DALL-E 3経由の画像生成（fetch直接呼び出し、SDK不使用）
 * @param {string} prompt - 画像生成プロンプト
 * @param {string} apiKey - OpenAI API Key
 * @returns {Promise<{imageData: Buffer, backend: string, model: string, modelId: string}>}
 */
async function generateWithDalle(prompt, apiKey) {
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json',
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`DALL-E 3 API error: ${response.status}`);
  }

  const json = await response.json();
  const b64 = json.data[0].b64_json;
  return {
    imageData: Buffer.from(b64, 'base64'),
    backend: 'dalle',
    model: 'DALL-E 3',
    modelId: 'dall-e-3',
  };
}

/**
 * フォールバック付き画像生成
 * NB2 → NBpro → DALL-E 3 の順に試行し、最初に成功した結果を返す。
 * APIキー未設定のバックエンドはスキップする。
 *
 * @param {string} prompt - 合成済みプロンプト
 * @param {string} negativePrompt - ネガティブプロンプト（Gemini用、DALL-E時は無視）
 * @returns {Promise<{imageData: Buffer, backend: string, model: string, modelId: string}>}
 */
export async function generateImageWithFallback(prompt, negativePrompt) {
  const chain = getFallbackChain();

  for (const target of chain) {
    const apiKey = getApiKey(target.backend);
    if (!apiKey) continue; // APIキー未設定ならスキップ

    try {
      if (target.backend === 'gemini') {
        return await generateWithGemini(prompt, negativePrompt, target.model, target.name, apiKey);
      } else {
        return await generateWithDalle(prompt, apiKey);
      }
    } catch (err) {
      console.warn(`${target.name} failed: ${sanitizeError(err.message, apiKey)}`);
      continue;
    }
  }

  throw new Error('全画像生成バックエンドが失敗しました');
}

/**
 * エラーメッセージからAPIキーを除去する
 * @param {string} message - エラーメッセージ
 * @param {...string} keys - 除去対象のAPIキー
 * @returns {string} サニタイズ済みメッセージ
 */
export function sanitizeError(message, ...keys) {
  let sanitized = message;
  for (const key of keys) {
    if (key && sanitized.includes(key)) {
      sanitized = sanitized.replace(
        new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        '[REDACTED]'
      );
    }
  }
  return sanitized;
}
