// lib/character.js
// キャラクター読み込み・プロンプト合成共通ライブラリ
//
// GitHub APIからキャラクター設定JSONを取得し、
// 画像生成プロンプトやClaude整形プロンプトに合成する。

import { getStyle } from './image-styles.js';
import { PROMPT_WARN_THRESHOLD } from './prompt-policy.js';

/**
 * characterIdのバリデーション（英数字・ハイフンのみ、最大30文字）
 * @param {string} characterId - キャラクターID
 * @returns {boolean} 有効ならtrue
 */
function isValidCharacterId(characterId) {
  if (!characterId || typeof characterId !== 'string') return false;
  return /^[a-z0-9-]{1,30}$/.test(characterId);
}

// スタイル不整合検出用のキーワードマップ
const STYLE_CONFLICTS = {
  oilpainting: ['kawaii', 'chibi', 'cartoon', 'anime', 'cute chibi'],
  illustration: ['photorealistic', 'oil painting', 'acrylic'],
};

/**
 * キャラクタースキーマの最低限検証（必須フィールド確認）
 * @param {object} character - パース済みキャラクターオブジェクト
 * @returns {boolean} 有効ならtrue
 */
function validateCharacterSchema(character) {
  if (!character || typeof character !== 'object') return false;
  if (!character.id || typeof character.id !== 'string') return false;
  if (!character.name || typeof character.name !== 'string') return false;

  // appearance必須
  if (!character.appearance || typeof character.appearance !== 'object') return false;
  if (!Array.isArray(character.appearance.consistencyKeywords)) return false;

  // imageGeneration必須
  if (!character.imageGeneration || typeof character.imageGeneration !== 'object') return false;
  if (typeof character.imageGeneration.basePrompt !== 'string') return false;

  // personality必須
  if (!character.personality || typeof character.personality !== 'object') return false;

  // species必須
  if (!character.species || typeof character.species !== 'object') return false;

  // styleOverridesの型チェック（存在する場合のみ）
  const styleOverrides = character.imageGeneration.styleOverrides;
  if (styleOverrides !== undefined) {
    if (!styleOverrides || typeof styleOverrides !== 'object' || Array.isArray(styleOverrides)) return false;
    for (const [styleKey, override] of Object.entries(styleOverrides)) {
      if (!override || typeof override !== 'object' || Array.isArray(override)) return false;

      // eyeDescriptorは文字列であること
      if (override.eyeDescriptor !== undefined && typeof override.eyeDescriptor !== 'string') {
        return false;
      }

      // basePrompt: 存在する場合は文字列であること
      if (override.basePrompt !== undefined && typeof override.basePrompt !== 'string') {
        return false;
      }
      // negativePrompt: 存在する場合は文字列であること
      if (override.negativePrompt !== undefined && typeof override.negativePrompt !== 'string') {
        return false;
      }
      // consistencyKeywords: 存在する場合は文字列配列であること
      if (override.consistencyKeywords !== undefined) {
        if (!Array.isArray(override.consistencyKeywords) || !override.consistencyKeywords.every(k => typeof k === 'string')) {
          return false;
        }
      }
      // styleModifiers: 存在する場合は文字列配列であること
      if (override.styleModifiers !== undefined) {
        if (!Array.isArray(override.styleModifiers) || !override.styleModifiers.every(k => typeof k === 'string')) {
          return false;
        }
      }
      // craftAnalysis: 存在する場合はオブジェクトであること
      if (override.craftAnalysis !== undefined) {
        if (typeof override.craftAnalysis !== 'object' || override.craftAnalysis === null || Array.isArray(override.craftAnalysis)) {
          return false;
        }
      }

      // 文字列フィールドの最大長チェック（警告のみ、ブロックしない）
      if (typeof override.basePrompt === 'string' && override.basePrompt.length > 800) {
        console.warn(`[SCHEMA_WARN] styleOverrides.${styleKey}.basePrompt が800文字を超えています (${override.basePrompt.length}文字)`);
      }
      if (typeof override.eyeDescriptor === 'string' && override.eyeDescriptor.length > 300) {
        console.warn(`[SCHEMA_WARN] styleOverrides.${styleKey}.eyeDescriptor が300文字を超えています (${override.eyeDescriptor.length}文字)`);
      }
      if (typeof override.negativePrompt === 'string' && override.negativePrompt.length > 500) {
        console.warn(`[SCHEMA_WARN] styleOverrides.${styleKey}.negativePrompt が500文字を超えています (${override.negativePrompt.length}文字)`);
      }

      // consistencyKeywords: 最大20要素×100文字
      if (Array.isArray(override.consistencyKeywords)) {
        if (override.consistencyKeywords.length > 20) {
          console.warn(`[SCHEMA_WARN] styleOverrides.${styleKey}.consistencyKeywords が20要素を超えています (${override.consistencyKeywords.length}要素)`);
        }
        for (const kw of override.consistencyKeywords) {
          if (typeof kw === 'string' && kw.length > 100) {
            console.warn(`[SCHEMA_WARN] styleOverrides.${styleKey}.consistencyKeywords のキーワードが100文字を超えています`);
          }
        }
      }
    }
  }

  return true;
}

/**
 * スタイル別のキャラクター属性を解決する（非公開関数）
 * styleOverrides[styleId]が存在すればそれを使用、なければデフォルトにフォールバック
 *
 * @param {object} character - キャラクター設定オブジェクト
 * @param {string} styleId - スタイルID
 * @returns {{ basePrompt: string, eyeDescriptor: string, consistencyKeywords: string[], craftAnalysis: object, styleModifiers: string[], negativePrompt: string }}
 */
function resolveStyleAttributes(character, styleId) {
  const imgGen = character.imageGeneration;
  const overrides = imgGen.styleOverrides?.[styleId];

  // craftAnalysis正規化: overrides内 > v2(nested) > v1(flat) > {}
  let craftAnalysis;
  if (overrides?.craftAnalysis) {
    // styleOverrides内に直接指定されている場合（最優先）
    craftAnalysis = overrides.craftAnalysis;
  } else if (imgGen.craftAnalysis?.[styleId] && typeof imgGen.craftAnalysis[styleId] === 'object'
    && 'color' in imgGen.craftAnalysis[styleId]) {
    // v2(nested): craftAnalysis.illustration.color が存在する
    craftAnalysis = imgGen.craftAnalysis[styleId];
  } else if (imgGen.craftAnalysis && 'color' in imgGen.craftAnalysis) {
    // v1(flat): craftAnalysis.color が直接存在する
    craftAnalysis = imgGen.craftAnalysis;
  } else {
    craftAnalysis = {};
  }

  return {
    basePrompt: (typeof overrides?.basePrompt === 'string' ? overrides.basePrompt : null) || imgGen.basePrompt,
    eyeDescriptor: (typeof overrides?.eyeDescriptor === 'string' ? overrides.eyeDescriptor : null) || '',
    consistencyKeywords: Array.isArray(overrides?.consistencyKeywords)
      ? overrides.consistencyKeywords
      : character.appearance.consistencyKeywords,
    craftAnalysis,
    styleModifiers: Array.isArray(overrides?.styleModifiers)
      ? overrides.styleModifiers
      : (Array.isArray(imgGen.styleModifiers) ? imgGen.styleModifiers : []),
    negativePrompt: (typeof overrides?.negativePrompt === 'string' ? overrides.negativePrompt : null) || imgGen.negativePrompt || '',
  };
}

/**
 * 合成済みプロンプトのスタイル不整合を検出し警告ログを出す
 * @param {string} prompt - 合成済みプロンプト
 * @param {string} styleId - スタイルID
 * @returns {string[]} 検出された不整合キーワード
 */
function detectStyleConflict(prompt, styleId) {
  const conflicts = STYLE_CONFLICTS[styleId] || [];
  const found = conflicts.filter(keyword =>
    prompt.toLowerCase().includes(keyword)
  );
  if (found.length > 0) {
    console.warn(`[STYLE_CONFLICT] styleId=${styleId}にスタイル不整合: ${found.join(', ')}`);
  }
  return found;
}

/**
 * GitHub APIからキャラクター設定を読み込む
 * @param {string} characterId - キャラクターID（例: "quetz-default"）
 * @param {object} githubConfig - GitHub API設定
 * @param {string} githubConfig.token - GitHub APIトークン
 * @param {string} githubConfig.owner - リポジトリオーナー
 * @param {string} githubConfig.repo - リポジトリ名
 * @returns {Promise<object|null>} キャラクター設定オブジェクト、失敗時はnull
 */
export async function loadCharacter(characterId, githubConfig, options = {}) {
  // IDバリデーション
  if (!isValidCharacterId(characterId)) {
    return null;
  }

  const { token, owner, repo } = githubConfig;
  if (!token || !owner || !repo) {
    console.warn('キャラクター読み込み: GitHub設定が不足しています');
    return null;
  }

  const path = `characters/${characterId}.json`;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  try {
    const fetchOpts = {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    };
    if (options.signal) {
      fetchOpts.signal = options.signal;
    }
    const response = await fetch(url, fetchOpts);

    if (!response.ok) {
      console.warn(`キャラクター読み込み失敗: ${response.status} (${characterId})`);
      return null;
    }

    const data = await response.json();
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    const character = JSON.parse(content);

    // スキーマ検証
    if (!validateCharacterSchema(character)) {
      console.warn(`キャラクタースキーマ不正: ${characterId}`);
      return null;
    }

    return character;
  } catch (err) {
    console.warn(`キャラクター読み込みエラー: ${err.message}`);
    return null;
  }
}

/**
 * 日記のimage_promptとキャラクター設定を合成して画像生成プロンプトを作る
 * @param {string} diaryImagePrompt - 日記から生成されたimage_prompt
 * @param {object|null} character - キャラクター設定オブジェクト（nullの場合はそのまま返却）
 * @returns {{ prompt: string, negativePrompt: string }}
 */
export function composeImagePrompt(diaryImagePrompt, character, styleId) {
  const style = getStyle(styleId);

  // キャラクターがnullの場合は元のプロンプトをそのまま返却
  if (!character) {
    const result = {
      prompt: style ? `${style.promptPrefix}. ${diaryImagePrompt}` : diaryImagePrompt,
      negativePrompt: style ? style.negativePrompt : '',
    };

    if (result.prompt.length > PROMPT_WARN_THRESHOLD) {
      console.warn(`[PROMPT_LENGTH_WARN] 画像プロンプト長警告: ${result.prompt.length}文字 (推奨上限: ${PROMPT_WARN_THRESHOLD})`);
    }

    return result;
  }

  // スタイル別属性を解決
  const resolved = resolveStyleAttributes(character, styleId);

  // CRAFT 5軸を活用した合成（eyeDescriptorをbasePrompt直後に配置）
  const composed = [
    resolved.basePrompt,
    resolved.eyeDescriptor
      ? `Eye detail (IMPORTANT): ${resolved.eyeDescriptor}` : null,
    `Scene: ${diaryImagePrompt}`,
    style ? `Art style: ${style.promptPrefix}` : null,
    `Style details: ${resolved.styleModifiers.join(', ')}`,
    `Important details: ${resolved.consistencyKeywords.join(', ')}`,
    (resolved.craftAnalysis.color && resolved.craftAnalysis.rendering && resolved.craftAnalysis.atmosphere)
      ? `Color: ${resolved.craftAnalysis.color}. Rendering: ${resolved.craftAnalysis.rendering}. Atmosphere: ${resolved.craftAnalysis.atmosphere}`
      : '',
  ].filter(Boolean).join('. ');

  const mergedNegative = [resolved.negativePrompt, style ? style.negativePrompt : '']
    .filter(Boolean).join(', ');

  // スタイル不整合検出
  detectStyleConflict(composed, styleId);

  const result = {
    prompt: composed.slice(0, 3800),
    negativePrompt: mergedNegative,
  };

  if (result.prompt.length > PROMPT_WARN_THRESHOLD) {
    console.warn(`[PROMPT_LENGTH_WARN] 画像プロンプト長警告: ${result.prompt.length}文字 (推奨上限: ${PROMPT_WARN_THRESHOLD})`);
  }

  return result;
}

/**
 * Claudeの日記整形プロンプトにキャラクター設定を注入する
 * @param {string} basePrompt - 元のClaudeプロンプト
 * @param {object|null} character - キャラクター設定オブジェクト（nullの場合はそのまま返却）
 * @returns {string} キャラクター設定が注入されたプロンプト
 */
export function injectCharacterPrompt(basePrompt, character) {
  // キャラクターがnullの場合は元のプロンプトをそのまま返却
  if (!character) {
    return basePrompt;
  }

  const { personality, species, name } = character;

  const characterSection = `

【キャラクター設定】
キャラクター名: ${name}（${character.nameEn}）
種族: ${species.common}（${species.scientific}）
性格: ${personality.traits.join('、')}
口調: ${personality.speechStyle}
一人称: ${personality.firstPerson}

【追加の整形ルール】
7. キャラクターの口調と性格を反映した文体にする（翼竜の視点から人間の日常を観察するユニークな語り口）
8. image_promptにはキャラクターの外見特徴（デフォルメ翼竜）を含める
9. タグにキャラクター関連ハッシュタグを含める`;

  return basePrompt + characterSection;
}
