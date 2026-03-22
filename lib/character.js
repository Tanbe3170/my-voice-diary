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

  return true;
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

  const { basePrompt, styleModifiers, negativePrompt, craftAnalysis } = character.imageGeneration;
  const { consistencyKeywords } = character.appearance;

  // CRAFT 5軸を活用した合成
  const composed = [
    basePrompt,
    `Scene: ${diaryImagePrompt}`,
    style ? `Art style: ${style.promptPrefix}` : null,
    `Style details: ${styleModifiers.join(', ')}`,
    `Important details: ${consistencyKeywords.join(', ')}`,
    craftAnalysis
      ? `Color: ${craftAnalysis.color}. Rendering: ${craftAnalysis.rendering}. Atmosphere: ${craftAnalysis.atmosphere}`
      : '',
  ].filter(Boolean).join('. ');

  const mergedNegative = [negativePrompt, style ? style.negativePrompt : '']
    .filter(Boolean).join(', ');

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
